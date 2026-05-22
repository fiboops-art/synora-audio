export type NumberFormat = "auto" | "en_US" | "pt_BR";

export function parseFlexibleNumber(
  raw: unknown,
  numberFormat: NumberFormat = "auto"
): { value: number | null; warnings: string[]; error: string | null } {
  const warnings: string[] = [];
  if (raw === null || raw === undefined) return { value: null, warnings, error: "null_value" };
  const s0 = String(raw).trim();
  if (!s0) return { value: null, warnings, error: "empty_value" };

  // Allow negative, spaces, currency symbols
  const s1 = s0
    .replace(/[\s\u00A0]/g, "")
    .replace(/[^0-9,.-]/g, "");

  const hasDot = s1.includes(".");
  const hasComma = s1.includes(",");

  const normalizeEn = (s: string) => s.replace(/,/g, "");
  const normalizeBr = (s: string) => s.replace(/\./g, "").replace(/,/g, ".");

  let normalized = s1;

  if (numberFormat === "en_US") {
    normalized = normalizeEn(s1);
  } else if (numberFormat === "pt_BR") {
    normalized = normalizeBr(s1);
  } else {
    // auto
    if (hasDot && hasComma) {
      // last separator is decimal
      const lastDot = s1.lastIndexOf(".");
      const lastComma = s1.lastIndexOf(",");
      const decimalIsComma = lastComma > lastDot;
      normalized = decimalIsComma ? normalizeBr(s1) : normalizeEn(s1);
    } else if (hasComma || hasDot) {
      const sep = hasComma ? "," : ".";
      const parts = s1.split(sep);
      if (parts.length === 2 && parts[1].length === 2) {
        // treat as decimal
        normalized = hasComma ? normalizeBr(s1) : normalizeEn(s1);
      } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length >= 1) {
        // likely thousands separator
        warnings.push("ambiguous_thousands_separator");
        normalized = hasComma ? normalizeEn(s1) : normalizeEn(s1); // remove thousands
      } else {
        warnings.push("ambiguous_number_format");
        // best-effort: if comma present, try pt_BR, else en_US
        normalized = hasComma ? normalizeBr(s1) : normalizeEn(s1);
      }
    }
  }

  // Edge: multiple minus signs, or trailing separators
  if (!/^[-]?[0-9]*\.?[0-9]*$/.test(normalized) || normalized === "-" || normalized === "." || normalized === "-.") {
    return { value: null, warnings, error: "invalid_number_format" };
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return { value: null, warnings, error: "not_finite" };
  return { value: n, warnings, error: null };
}

