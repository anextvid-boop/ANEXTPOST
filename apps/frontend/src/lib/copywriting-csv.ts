import type { BuilderLength, SectionRole } from "./builder-api";

export const COPYWRITING_CSV_HEADERS = [
  "collection",
  "post_type",
  "section_role",
  "content",
  "length_hint",
] as const;

const VALID_ROLES = new Set<SectionRole>([
  "hook",
  "context",
  "body",
  "proof",
  "takeaway",
  "question",
  "signoff",
  "hashtags",
  "graphic_note",
]);

export interface ParsedCopywritingRow {
  rowNumber: number;
  collection: string;
  postType: string;
  sectionRole: SectionRole;
  content: string;
  lengthHint: BuilderLength | null;
}

export interface ParsedCopywritingCsvResult {
  rows: ParsedCopywritingRow[];
  errors: string[];
}

export function buildBlankCopywritingTemplateCsv(): string {
  return `${COPYWRITING_CSV_HEADERS.join(",")}\n`;
}

export function downloadCopywritingTemplateCsv(): void {
  const csv = buildBlankCopywritingTemplateCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "anextpost-copywriting-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** RFC-4180 compliant CSV parser supporting quoted fields, commas, and newlines. */
function parseCsvMatrix(text: string): { rows: string[][]; unclosedQuote: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const clean = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      if (clean[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return {
    rows: rows.filter((r) => r.some((c) => c.trim().length > 0)),
    unclosedQuote: inQuotes,
  };
}

export function parseCopywritingCsv(csvText: string): ParsedCopywritingCsvResult {
  const { rows: matrix, unclosedQuote } = parseCsvMatrix(csvText);
  if (unclosedQuote) {
    return {
      rows: [],
      errors: ["CSV contains an unclosed quoted field. Check matching double quotes (\")."],
    };
  }
  if (matrix.length === 0) {
    return { rows: [], errors: ["CSV file is empty."] };
  }

  const headers = matrix[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const idxCollection = headers.indexOf("collection");
  const idxPostType = headers.indexOf("post_type");
  const idxRole = headers.indexOf("section_role");
  const idxContent = headers.indexOf("content");
  const idxLength = headers.indexOf("length_hint");

  if (idxRole === -1 || idxContent === -1) {
    return {
      rows: [],
      errors: [
        "Missing required columns. Expected headers: collection, post_type, section_role, content, length_hint",
      ],
    };
  }

  if (matrix.length === 1) {
    return {
      rows: [],
      errors: ["CSV file contains headers only and no data rows."],
    };
  }

  const rows: ParsedCopywritingRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const line = matrix[i];
    const rowNumber = i + 1;
    const rawRole = (line[idxRole] ?? "").trim().toLowerCase() as SectionRole;
    const content = (line[idxContent] ?? "").trim();
    const collection = idxCollection >= 0 ? (line[idxCollection] ?? "").trim() : "";
    const postType = idxPostType >= 0 ? (line[idxPostType] ?? "").trim() : "";
    const rawLength =
      idxLength >= 0 ? (line[idxLength] ?? "").trim().toLowerCase() : "";

    if (!content) {
      errors.push(`Row ${rowNumber}: content is empty.`);
      continue;
    }
    if (!VALID_ROLES.has(rawRole)) {
      errors.push(
        `Row ${rowNumber}: invalid section_role "${rawRole}" (expected hook, context, body, proof, takeaway, question, signoff, hashtags, or graphic_note).`,
      );
      continue;
    }

    let lengthHint: BuilderLength | null = null;
    if (rawLength === "short" || rawLength === "standard") {
      lengthHint = rawLength;
    } else if (rawLength.length > 0) {
      errors.push(
        `Row ${rowNumber}: invalid length_hint "${rawLength}" (expected short, standard, or blank).`,
      );
      continue;
    }

    rows.push({
      rowNumber,
      collection,
      postType,
      sectionRole: rawRole,
      content,
      lengthHint,
    });
  }

  return { rows, errors };
}
