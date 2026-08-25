/**
 * Lightweight CSV generation (semicolon-delimited — Excel fr-BE friendly).
 */

function escapeCell(value: string | number): string {
  const s = String(value ?? '');
  // French Excel expects semicolons; quote any cell containing ; , " or newline.
  if (/[";\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Builds a CSV string from headers + rows (semicolon-separated, CRLF). */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(escapeCell).join(';'), ...rows.map((r) => r.map(escapeCell).join(';'))];
  return '\uFEFF' + lines.join('\r\n');
}

/** Triggers a browser download of a CSV file. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
