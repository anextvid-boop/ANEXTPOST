// Client-side RFC-4180 CSV parser & local media folder matcher for bulk CSV import.
// Keeps the exact parsing semantics of libraries/nestjs-libraries/src/csv-import/csv.parser.ts
// so previewed rows match backend row numbers (1-based, header = 1, first data row = 2).

export const ALLOWED_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
]);

export const ALLOWED_VIDEO_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mov",
]);

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // Matches backend UPLOAD_MAX_IMAGE_BYTES
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // Matches backend UPLOAD_MAX_VIDEO_BYTES

export function parseCsvText(input: string): string[][] {
  const s = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export function csvRowsToRecords(rows: string[][]): {
  headers: string[];
  records: Record<string, string>[];
} {
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = (r[idx] ?? "").trim();
    });
    return rec;
  });
  return { headers, records };
}

export function splitMediaPaths(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
}

function normalizeRelPath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .toLowerCase();
}

export interface FolderIndex {
  byRelPath: Map<string, File>;
  byFullPath: Map<string, File>;
  byBasename: Map<string, File[]>;
  totalFiles: number;
}

export function buildFolderIndex(files: File[]): FolderIndex {
  const byRelPath = new Map<string, File>();
  const byFullPath = new Map<string, File>();
  const byBasename = new Map<string, File[]>();

  for (const file of files) {
    const rawRel = file.webkitRelativePath || file.name;
    const normFull = normalizeRelPath(rawRel);
    byFullPath.set(normFull, file);

    // Strip the top-level selected folder prefix ("my-folder/sub/a.png" -> "sub/a.png")
    const slashIdx = normFull.indexOf("/");
    const insideFolder = slashIdx >= 0 ? normFull.slice(slashIdx + 1) : normFull;
    if (insideFolder) {
      byRelPath.set(insideFolder, file);
    }

    const base = file.name.toLowerCase();
    const list = byBasename.get(base) ?? [];
    list.push(file);
    byBasename.set(base, list);
  }

  return { byRelPath, byFullPath, byBasename, totalFiles: files.length };
}

export type MediaMatchStatus =
  | "matched"
  | "missing"
  | "unsupported"
  | "too_large"
  | "ambiguous"
  | "invalid_combo";

export interface LibraryMediaCandidate {
  id: string;
  name: string;
  originalName: string | null;
  path: string;
  type: string;
}

export interface MatchedMediaRef {
  rawPath: string;
  status: MediaMatchStatus;
  kind?: "image" | "video";
  file?: File;
  libraryRef?: { id: string; path: string };
  error?: string;
}

export interface CsvPreviewRow {
  row: number;
  content: string;
  channels: string;
  datetime: string;
  mediaRefs: MatchedMediaRef[];
  hasError: boolean;
}

export interface CsvPreviewSummary {
  headers: string[];
  missingRequiredCols: string[];
  rows: CsvPreviewRow[];
  matchedImageCount: number;
  matchedVideoCount: number;
  errorRowCount: number;
  hasBlockingErrors: boolean;
}

function resolveFileFromFolder(
  rawPath: string,
  index: FolderIndex
): { file?: File; ambiguous?: boolean } {
  const norm = normalizeRelPath(rawPath);
  const direct = index.byRelPath.get(norm) ?? index.byFullPath.get(norm);
  if (direct) return { file: direct };

  // Fallback to basename only when unambiguous across the selected folder
  if (!norm.includes("/")) {
    const candidates = index.byBasename.get(norm);
    if (candidates && candidates.length === 1) return { file: candidates[0] };
    if (candidates && candidates.length > 1) return { ambiguous: true };
  }
  return {};
}

function checkMediaFile(file: File): {
  status: MediaMatchStatus;
  kind?: "image" | "video";
  error?: string;
} {
  const dotIdx = file.name.lastIndexOf(".");
  const ext = dotIdx >= 0 ? file.name.slice(dotIdx + 1).toLowerCase() : "";
  const isImage = ALLOWED_IMAGE_EXTENSIONS.has(ext);
  const isVideo = ALLOWED_VIDEO_EXTENSIONS.has(ext);
  if (!isImage && !isVideo) {
    return {
      status: "unsupported",
      error: `Unsupported file type ".${ext || "?"}" (allowed images: jpg, png, gif, webp; videos: mp4, webm, mov)`,
    };
  }
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = isVideo ? 500 : 10;
    return {
      status: "too_large",
      kind: isVideo ? "video" : "image",
      error: `${isVideo ? "Video" : "Image"} is ${mb} MB (max ${maxMb} MB)`,
    };
  }
  return { status: "matched", kind: isVideo ? "video" : "image" };
}

function resolveFromLibrary(
  rawPath: string,
  libraryMedia: LibraryMediaCandidate[]
): LibraryMediaCandidate | undefined {
  if (!libraryMedia.length) return undefined;
  const trimmed = rawPath.trim();
  const norm = normalizeRelPath(trimmed);
  const direct = libraryMedia.find(
    (m) =>
      m.id === trimmed ||
      m.path === trimmed ||
      normalizeRelPath(m.path) === norm
  );
  if (direct) return direct;
  const byName = libraryMedia.filter(
    (m) =>
      (m.originalName && m.originalName.toLowerCase() === norm) ||
      m.name.toLowerCase() === norm
  );
  return byName.length === 1 ? byName[0] : undefined;
}

export function buildCsvPreview(
  csvText: string,
  folderFiles: File[],
  libraryMedia: LibraryMediaCandidate[] = []
): CsvPreviewSummary {
  const parsed = parseCsvText(csvText);
  const { headers, records } = csvRowsToRecords(parsed);
  const missingRequiredCols = ["content", "channels"].filter(
    (c) => !headers.includes(c)
  );
  const index = buildFolderIndex(folderFiles);

  let matchedImageCount = 0;
  let matchedVideoCount = 0;
  let errorRowCount = 0;

  const rows: CsvPreviewRow[] = records.map((rec, idx) => {
    const rowNum = idx + 2;
    const rawPaths = splitMediaPaths(rec.media_path);
    const mediaRefs: MatchedMediaRef[] = rawPaths.map((rawPath) => {
      const libHit = resolveFromLibrary(rawPath, libraryMedia);
      if (libHit) {
        const kind: "image" | "video" =
          libHit.type === "video" ? "video" : "image";
        return {
          rawPath,
          status: "matched",
          kind,
          libraryRef: { id: libHit.id, path: libHit.path },
        };
      }
      if (index.totalFiles === 0) {
        return {
          rawPath,
          status: "missing",
          error: "Not found in Media Library; select a media folder",
        };
      }
      const { file, ambiguous } = resolveFileFromFolder(rawPath, index);
      if (ambiguous) {
        return {
          rawPath,
          status: "ambiguous",
          error: `Multiple files named "${rawPath}" in folder; use relative subfolder path`,
        };
      }
      if (!file) {
        return {
          rawPath,
          status: "missing",
          error: `File not found in selected folder: ${rawPath}`,
        };
      }
      const check = checkMediaFile(file);
      if (check.status !== "matched") {
        return {
          rawPath,
          status: check.status,
          kind: check.kind,
          file,
          error: check.error,
        };
      }
      return { rawPath, status: "matched", kind: check.kind, file };
    });

    // Enforce single-video rule: a post cannot mix video with images or attach >1 video.
    const hasVideo = mediaRefs.some((m) => m.kind === "video");
    if (hasVideo && mediaRefs.length > 1) {
      for (const m of mediaRefs) {
        if (m.status === "matched") {
          m.status = "invalid_combo";
          m.error = "Only 1 video is allowed per post (cannot combine with images or other videos)";
        }
      }
    }

    for (const m of mediaRefs) {
      if (m.status === "matched") {
        if (m.kind === "video") matchedVideoCount++;
        else matchedImageCount++;
      }
    }

    const hasError = mediaRefs.some((m) => m.status !== "matched");
    if (hasError) errorRowCount++;

    return {
      row: rowNum,
      content: rec.content || "",
      channels: rec.channels || "",
      datetime: rec.datetime || "",
      mediaRefs,
      hasError,
    };
  });

  return {
    headers,
    missingRequiredCols,
    rows,
    matchedImageCount,
    matchedVideoCount,
    errorRowCount,
    hasBlockingErrors: missingRequiredCols.length > 0 || errorRowCount > 0,
  };
}
