"use strict";

function parseCsv(text) {
  if (typeof text !== "string") throw new TypeError("CSV input must be text");

  const source = text.replace(/^\uFEFF/, "");
  const matrix = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.length > 0)) matrix.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (quoted) throw new SyntaxError("CSV contains an unterminated quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) matrix.push(row);
  }

  if (matrix.length < 2) throw new SyntaxError("CSV must contain a header and at least one data row");

  const headers = matrix[0].map((value) => value.trim());
  if (headers.some((value) => value.length === 0)) throw new SyntaxError("CSV contains an empty header");
  if (new Set(headers).size !== headers.length) throw new SyntaxError("CSV contains duplicate headers");

  const rows = matrix.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new SyntaxError(`CSV row ${index + 2} has ${cells.length} cells; expected ${headers.length}`);
    }
    return headers.reduce((record, header, columnIndex) => {
      record[header] = cells[columnIndex].trim();
      return record;
    }, {});
  });

  return { headers, rows };
}

module.exports = { parseCsv };
