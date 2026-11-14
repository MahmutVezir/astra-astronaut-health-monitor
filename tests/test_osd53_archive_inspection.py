import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.inspect_osd53_archives import (
    inspect_directory,
    inspect_zip_bytes,
    parse_delimited_text,
    safe_member_name,
)


def make_zip(member_name="matrix.tsv", content="ID_REF\tGSM100\tGSM101\nprobe1\t1.2\t2.3\n"):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(member_name, content)
    return buffer.getvalue()


class OSD53ArchiveInspectionTests(unittest.TestCase):
    def test_rejects_path_traversal_and_absolute_zip_members(self):
        self.assertFalse(safe_member_name("../outside.txt"))
        self.assertFalse(safe_member_name("/absolute/file.txt"))
        self.assertFalse(safe_member_name("C:/outside.txt"))
        self.assertTrue(safe_member_name("data/matrix.tsv"))

    def test_parses_expression_matrix_candidate_without_exporting_values(self):
        report = parse_delimited_text(
            "matrix.tsv",
            b"ID_REF\tGSM100\tGSM101\nprobe1\t1.2\t2.3\n",
        )
        self.assertIsNotNone(report)
        self.assertTrue(report["is_expression_matrix_candidate"])
        self.assertEqual(report["row_count"], 1)
        self.assertEqual(report["matrix_sample_columns"], ["GSM100", "GSM101"])

    def test_validates_zip_crc_and_member_structure(self):
        report = inspect_zip_bytes("candidate.zip", make_zip())
        self.assertEqual(report["zip_crc"], "PASS")
        self.assertEqual(report["member_count"], 1)
        self.assertTrue(report["tabular_members"][0]["is_expression_matrix_candidate"])

    def test_rejects_zip_path_traversal(self):
        with self.assertRaisesRegex(ValueError, "Unsafe ZIP member path"):
            inspect_zip_bytes("unsafe.zip", make_zip("../outside.tsv"))

    def test_rejects_non_zip_input(self):
        with self.assertRaisesRegex(ValueError, "not a valid ZIP"):
            inspect_zip_bytes("bad.zip", b"not a zip archive")

    def test_zero_expected_archives_cannot_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            summary_path = root / "summary.json"
            summary_path.write_text(json.dumps({"expected_file_count": 0, "file_level_downloads": []}))
            result = inspect_directory(root / "files", summary_path)
            self.assertEqual(result["status"], "INCOMPLETE")

    def test_missing_or_corrupt_archive_cannot_pass_and_is_cleaned_up(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive_dir = root / "files"
            archive_dir.mkdir()
            archive_path = archive_dir / "bad.zip"
            archive_path.write_bytes(b"not a zip")
            summary_path = root / "summary.json"
            summary_path.write_text(json.dumps({
                "expected_file_count": 1,
                "license": None,
                "file_level_downloads": [{
                    "file_name": "bad.zip",
                    "status": "DOWNLOADED_AND_SIZE_VERIFIED",
                    "temporary_path": str(archive_path),
                }],
            }))
            result = inspect_directory(archive_dir, summary_path)
            self.assertEqual(result["status"], "INCOMPLETE")
            self.assertTrue(result["missing_or_unavailable_files"])
            self.assertEqual(json.loads(summary_path.read_text())["decision"], "DEFER_ARCHIVE_CONTENT_QA_INCOMPLETE")
            self.assertFalse(archive_path.exists())

    def test_complete_archive_inspection_still_defers_without_license(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive_dir = root / "files"
            archive_dir.mkdir()
            archive_path = archive_dir / "good.zip"
            archive_path.write_bytes(make_zip())
            summary_path = root / "summary.json"
            summary_path.write_text(json.dumps({
                "expected_file_count": 1,
                "license": None,
                "file_level_downloads": [{
                    "file_name": "good.zip",
                    "status": "DOWNLOADED_AND_SIZE_VERIFIED",
                    "temporary_path": str(archive_path),
                }],
            }))
            result = inspect_directory(archive_dir, summary_path)
            saved = json.loads(summary_path.read_text())
            self.assertEqual(result["status"], "PASS")
            self.assertEqual(saved["decision"], "DEFER_INTEGRATION_PENDING_LICENSE_REVIEW")
            self.assertFalse(archive_path.exists())


if __name__ == "__main__":
    unittest.main()
