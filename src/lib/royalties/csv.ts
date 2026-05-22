// Minimal CSV parser for MVP.
// Assumptions: comma-separated, supports quoted fields with doubled quotes.

export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const rows: string[][] = [];
  const cur: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    cur.push(field);
    field = "";
  };
  const pushRow = () => {
    // skip empty trailing row
    if (cur.length === 1 && cur[0] === "") {
      cur.length = 0;
      return;
    }
    rows.push([...cur]);
    cur.length = 0;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : "";

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      pushField();
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }
    if (ch === "\r") {
      // ignore, handle CRLF via \n
      continue;
    }

    field += ch;
  }
  pushField();
  pushRow();

  const header = (rows.shift() ?? []).map((h) => h.trim());
  return { header, rows };
}

export function rowToObject(header: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < header.length; i++) {
    const k = header[i];
    if (!k) continue;
    obj[k] = (row[i] ?? "").trim();
  }
  return obj;
}

