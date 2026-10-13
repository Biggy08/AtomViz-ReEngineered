import type { Result } from "../domain/types";
const quote = (s: unknown) => `"${String(s).replaceAll('"', '""')}"`;
export function toCsv(result: Result): string {
  const { rows, ...provenance } = result;
  return (
    "# AtomViz result; provenance JSON follows\n# " +
    JSON.stringify(provenance) +
    "\n" +
    result.columns.map(quote).join(",") +
    "\n" +
    result.rows.map((row) => row.map(quote).join(",")).join("\n") +
    "\n"
  );
}
export function download(result: Result, format: "csv" | "json"): void {
  const text =
    format === "csv" ? toCsv(result) : JSON.stringify(result, null, 2);
  const url = URL.createObjectURL(
    new Blob([text], {
      type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `atomviz-${result.module}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
