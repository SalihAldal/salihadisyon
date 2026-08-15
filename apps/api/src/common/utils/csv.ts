export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escapeCell = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
  };

  return `\uFEFF${[headers.map(escapeCell).join(","), ...rows.map((row) => row.map(escapeCell).join(","))].join("\n")}`;
}
