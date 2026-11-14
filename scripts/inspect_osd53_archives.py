#!/usr/bin/env python3
"""Inspect OSD-53 ZIP structure without persisting extracted NASA files."""

from __future__ import annotations

import csv
import io
import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath

MAX_MEMBER_BYTES = 20 * 1024 * 1024
MAX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
TABLE_EXTENSIONS = {".txt", ".tsv", ".csv", ".soft", ".gct"}


def safe_member_name(name: str) -> bool:
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    if normalized.startswith("/") or re.match(r"^[A-Za-z]:", normalized):
        return False
    return all(part not in {"", ".", ".."} for part in path.parts)


def decode_text(raw: bytes) -> str | None:
    if b"\x00" in raw[:4096]:
        return None
    for encoding in ("utf-8-sig", "utf-16", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return None


def parse_delimited_text(member_name: str, raw: bytes) -> dict | None:
    text = decode_text(raw)
    if text is None:
        return None
    lines = text.splitlines()
    delimiter = "\t" if "\t" in text else ","
    header_index = None
    headers = None

    for index, line in enumerate(lines[:1000]):
        stripped = line.strip()
        if not stripped or stripped.startswith(("!", "#")):
            continue
        try:
            fields = next(csv.reader([line], delimiter=delimiter))
        except csv.Error:
            continue
        if len(fields) >= 2:
            header_index = index
            headers = [field.strip().lstrip("\ufeff") for field in fields]
            break

    if header_index is None or headers is None:
        return None

    sample_ids = []
    source_ids = []
    row_count = 0
    malformed_rows = 0
    numeric_cells = 0
    candidate_numeric_cells = 0
    sample_index = next(
        (i for i, name in enumerate(headers)
         if re.search(r"^sample(?: name| id| identifier)$", name, re.I)),
        None,
    )
    source_index = next(
        (i for i, name in enumerate(headers)
         if re.search(r"^source name$", name, re.I)),
        None,
    )
    matrix_sample_columns = [
        name for name in headers[1:]
        if re.match(r"^(GSM\d+|C\d{3}|S\d+)", name, re.I)
    ]

    reader = csv.reader(lines[header_index + 1:], delimiter=delimiter)
    for row in reader:
        if not row or all(not field.strip() for field in row):
            continue
        row_count += 1
        if len(row) != len(headers):
            malformed_rows += 1
        if sample_index is not None and sample_index < len(row):
            value = row[sample_index].strip()
            if value:
                sample_ids.append(value)
        if source_index is not None and source_index < len(row):
            value = row[source_index].strip()
            if value:
                source_ids.append(value)
        if row_count <= 20:
            for value in row[1:]:
                candidate_numeric_cells += 1
                try:
                    float(value.strip())
                    numeric_cells += 1
                except (TypeError, ValueError):
                    pass

    geo_accessions = sorted(set(re.findall(r"\bGSM\d+\b", text)))
    normalized_first = headers[0].strip().lower()
    is_expression_matrix = (
        normalized_first in {"id_ref", "probe", "probe_id", "gene_id", "feature"}
        and len(headers) >= 3
        and (len(matrix_sample_columns) >= 2 or len(geo_accessions) >= 2)
    )

    return {
        "member": member_name,
        "delimiter": "tab" if delimiter == "\t" else "comma",
        "header_row_1based": header_index + 1,
        "row_count": row_count,
        "column_count": len(headers),
        "headers": headers[:80],
        "malformed_row_count": malformed_rows,
        "sample_id_field_values": sorted(set(sample_ids))[:500],
        "source_id_field_values": sorted(set(source_ids))[:500],
        "sample_id_field_unique_count": len(set(sample_ids)),
        "source_id_field_unique_count": len(set(source_ids)),
        "matrix_sample_columns": matrix_sample_columns[:500],
        "geo_sample_accessions": geo_accessions[:500],
        "numeric_cell_fraction_first_20_rows": (
            numeric_cells / candidate_numeric_cells if candidate_numeric_cells else None
        ),
        "is_expression_matrix_candidate": is_expression_matrix,
        "parse_status": "RECTANGULAR" if malformed_rows == 0 else "RAGGED_ROWS_FOUND",
    }


def inspect_zip_bytes(file_name: str, raw: bytes) -> dict:
    if not zipfile.is_zipfile(io.BytesIO(raw)):
        raise ValueError(f"{file_name} is not a valid ZIP archive")
    entries = []
    tables = []
    total_uncompressed = 0

    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        bad_member = archive.testzip()
        if bad_member:
            raise ValueError(f"ZIP CRC validation failed for {file_name}:{bad_member}")

        for info in archive.infolist():
            if info.is_dir():
                continue
            if not safe_member_name(info.filename):
                raise ValueError(f"Unsafe ZIP member path in {file_name}: {info.filename}")
            if info.file_size > MAX_MEMBER_BYTES:
                raise ValueError(f"ZIP member exceeds 20 MiB limit: {file_name}:{info.filename}")
            total_uncompressed += info.file_size
            if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES:
                raise ValueError(f"ZIP uncompressed size exceeds 100 MiB limit: {file_name}")

            entries.append({
                "member": info.filename,
                "compressed_bytes": info.compress_size,
                "uncompressed_bytes": info.file_size,
                "crc32": f"{info.CRC:08x}",
            })

            suffix = Path(info.filename).suffix.lower()
            if suffix in TABLE_EXTENSIONS and info.file_size:
                parsed = parse_delimited_text(info.filename, archive.read(info))
                if parsed is not None:
                    tables.append(parsed)

    return {
        "file_name": file_name,
        "archive_bytes": len(raw),
        "archive_sha256_checked_by_downloader": True,
        "zip_crc": "PASS",
        "member_count": len(entries),
        "uncompressed_total_bytes": total_uncompressed,
        "members": entries,
        "tabular_members": tables,
    }


def inspect_directory(directory: Path, summary_path: Path) -> dict:
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    downloads = summary.get("file_level_downloads", [])
    file_reports = []
    missing = []

    for item in downloads:
        temporary_path = item.get("temporary_path")
        file_name = item.get("file_name", "unknown")
        if item.get("status") != "DOWNLOADED_AND_SIZE_VERIFIED" or not temporary_path:
            missing.append(file_name)
            continue
        archive_path = Path(temporary_path)
        if not archive_path.is_file():
            missing.append(file_name)
            continue
        try:
            raw = archive_path.read_bytes()
            file_reports.append(inspect_zip_bytes(file_name, raw))
        except Exception as error:
            missing.append(file_name + ": " + str(error))

    expected = summary.get("expected_file_count", 0)
    completed = len(file_reports)
    inspection = {
        "status": "PASS" if expected > 0 and completed == expected and not missing else "INCOMPLETE",
        "expected_archive_count": expected,
        "inspected_archive_count": completed,
        "missing_or_unavailable_files": missing,
        "archives": file_reports,
        "data_values_exported_to_report": False,
        "extracted_files_persisted": False,
    }
    summary["archive_inspection"] = inspection
    if inspection["status"] != "PASS":
        summary["decision"] = "DEFER_ARCHIVE_CONTENT_QA_INCOMPLETE"
    elif summary.get("license") is None:
        summary["decision"] = "DEFER_INTEGRATION_PENDING_LICENSE_REVIEW"
    else:
        summary["decision"] = "DEFER_SCIENTIFIC_SCHEMA_AND_SAMPLE_MAPPING_QA"
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    for item in downloads:
        temporary_path = item.get("temporary_path")
        if temporary_path:
            Path(temporary_path).unlink(missing_ok=True)
    try:
        directory.rmdir()
    except OSError:
        pass
    return inspection


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: inspect_osd53_archives.py ARCHIVE_DIR SUMMARY_JSON")
    directory = Path(sys.argv[1])
    summary_path = Path(sys.argv[2])
    try:
        result = inspect_directory(directory, summary_path)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result["status"] == "PASS" else 2
    except Exception as error:
        print(f"OSD-53 archive inspection failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
