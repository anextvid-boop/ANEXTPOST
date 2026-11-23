"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { uploadCsv, CsvImportResult, CsvMediaRef } from "@/lib/csv-import-api";
import {
  createMediaCollection,
  fetchMedia,
  fetchMediaCollections,
  mediaPathToUrl,
  uploadMedia,
  type BackendMedia,
  type MediaCollectionSummary,
  type UploadedMediaResponse,
} from "@/lib/media-api";
import { useAuth } from "@/lib/auth-context";
import {
  consumePendingCsvImport,
  hasImportedPlanHash,
  recordImportedPlanHash,
} from "@/lib/builder-batch";
import { buildCsvPreview } from "@/lib/csv-media-matcher";
import { useChannels } from "@/lib/use-channels";
import { WorkspaceBadge, channelDestinationLabel } from "@/components/workspace-badge";

/**
 * Builds the sample CSV from the org's OWN channels.
 *
 * The static /csv-template.csv shipped with placeholder names ("My X Account",
 * "My LinkedIn Page") that match no real org, plus a hardcoded date that is now
 * in the past, so downloading it and uploading it back failed every row. That
 * is the first thing a new user does with the feature.
 *
 * The datetime column is left empty on purpose: the importer drops rows with no
 * datetime into the next free queue slot, which is both the friendliest default
 * and impossible to get wrong.
 */
/** CSV-quotes a field, doubling any embedded `"` per RFC 4180. Channel names
 *  come straight from the connected platform and can legitimately contain
 *  one (an Instagram display name, for instance) — leaving it unescaped
 *  produced invalid CSV the app's own parser would misread. */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildTemplate(channelNames: string[]): string {
  const sample = channelNames.length
    ? channelNames.slice(0, 2).join(", ")
    : "Your channel name";
  const rows = [
    "content,channels,datetime,first_comment,thread,media_path",
    [
      csvField("Big news! Our summer collection just dropped. Tell us which piece is your favourite."),
      csvField(sample),
      "",
      csvField("Shop the full collection here: https://example.com/summer"),
      "",
      csvField("launch/hero.png|launch/detail.png"),
    ].join(","),
    [
      csvField("Leave datetime empty and this post drops into your next free queue slot."),
      csvField(sample),
      "",
      "",
      "",
      "",
    ].join(","),
  ];
  return rows.join("\n") + "\n";
}

export default function CsvImportPage() {
  const t = useT();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CsvImportResult[] | null>(null);
  const [asDraft, setAsDraft] = useState(false);
  const [importedAsDraft, setImportedAsDraft] = useState(false);
  const uploadedCacheRef = useRef<Map<File, UploadedMediaResponse>>(new Map());
  const batchIdRef = useRef<string>(crypto.randomUUID());
  const { channels } = useChannels();
  const [collections, setCollections] = useState<MediaCollectionSummary[]>([]);
  const [libraryMedia, setLibraryMedia] = useState<BackendMedia[]>([]);
  const [collectionTarget, setCollectionTarget] = useState<string>("unassigned");
  const [newCollectionName, setNewCollectionName] = useState<string>("");

  useEffect(() => {
    fetchMediaCollections()
      .then((res) => setCollections(res.collections ?? []))
      .catch(() => {});
    (async () => {
      const all: BackendMedia[] = [];
      for (let page = 1; page <= 50; page++) {
        const res = await fetchMedia(page, undefined, undefined, 250).catch(() => null);
        if (!res || !res.results || res.results.length === 0) break;
        all.push(...res.results);
        if (page >= (res.pages || 1)) break;
      }
      setLibraryMedia(all);
    })();
  }, []);

  useEffect(() => {
    if (!user?.orgId) return;
    const pending = consumePendingCsvImport(user.orgId);
    if (!pending) return;
    const f = new File([pending.csv], pending.filename, { type: "text/csv" });
    setFile(f);
    setCsvText(pending.csv);
    setAsDraft(true);
    setResults(null);
    setError(null);
    if (pending.confirmedHash && hasImportedPlanHash(user.orgId, pending.confirmedHash)) {
      setError(
        "This confirmed sequence has already been imported to 5 Posts as drafts — duplicate import skipped.",
      );
      batchIdRef.current = "duplicate-skipped";
    } else {
      batchIdRef.current = pending.confirmedHash || crypto.randomUUID();
    }
  }, [user?.orgId]);

  const preview = useMemo(() => {
    if (!csvText) return null;
    return buildCsvPreview(csvText, folderFiles, libraryMedia);
  }, [csvText, folderFiles, libraryMedia]);

  // Create & revoke object URLs for matched image thumbnails in the preview table.
  const thumbUrls = useMemo(() => {
    const map = new Map<File, string>();
    if (!preview) return map;
    for (const row of preview.rows) {
      for (const ref of row.mediaRefs) {
        if (ref.status === "matched" && ref.file && !map.has(ref.file)) {
          map.set(ref.file, URL.createObjectURL(ref.file));
        }
      }
    }
    return map;
  }, [preview]);

  useEffect(() => {
    return () => {
      for (const url of thumbUrls.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, [thumbUrls]);

  const pick = async (f: File | null | undefined) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      setError(t("csvImport.onlyCsv"));
      return;
    }
    setError(null);
    setResults(null);
    batchIdRef.current = crypto.randomUUID();
    setFile(f);
    setCsvText(await f.text());
  };

  const pickFolder = (list: FileList | null) => {
    if (!list) return;
    uploadedCacheRef.current.clear();
    setFolderFiles(Array.from(list));
    setResults(null);
    setError(null);
  };

  const runImport = async (onlyRetryRows?: number[]) => {
    if (!file || busy || !preview || preview.hasBlockingErrors) return;
    setBusy(true);
    setError(null);
    try {
      const targetRowSet = onlyRetryRows ? new Set(onlyRetryRows) : null;
      const rowsToProcess = preview.rows.filter(
        (r) => !targetRowSet || targetRowSet.has(r.row),
      );

      // Deduplicate and upload unique matched images once; cache across retries.
      const uniqueFiles: File[] = [];
      const seen = new Set<File>();
      for (const row of rowsToProcess) {
        for (const ref of row.mediaRefs) {
          if (ref.file && !uploadedCacheRef.current.has(ref.file) && !seen.has(ref.file)) {
            seen.add(ref.file);
            uniqueFiles.push(ref.file);
          }
        }
      }

      let targetCollectionId: string | null =
        collectionTarget === "unassigned" || collectionTarget === "__new__"
          ? null
          : collectionTarget;
      if (uniqueFiles.length > 0 && collectionTarget === "__new__") {
        const trimmed = newCollectionName.trim();
        if (!trimmed) {
          throw new Error("Please enter a collection name or select Unassigned.");
        }
        const created = await createMediaCollection(trimmed);
        targetCollectionId = created.id;
        setCollectionTarget(created.id);
        setNewCollectionName("");
        fetchMediaCollections()
          .then((res) => setCollections(res.collections ?? []))
          .catch(() => {});
      }

      for (let i = 0; i < uniqueFiles.length; i++) {
        const mediaFile = uniqueFiles[i];
        setUploadProgress(`Uploading media (${i + 1}/${uniqueFiles.length})…`);
        const uploaded = await uploadMedia(mediaFile, targetCollectionId);
        uploadedCacheRef.current.set(mediaFile, uploaded);
      }

      const mediaMap: Record<number, CsvMediaRef[]> = {};
      for (const row of rowsToProcess) {
        if (row.mediaRefs.length > 0) {
          mediaMap[row.row] = row.mediaRefs
            .map((ref) => {
              if (ref.libraryRef) return ref.libraryRef;
              const u = ref.file ? uploadedCacheRef.current.get(ref.file) : undefined;
              return u ? { id: u.id, path: u.path } : undefined;
            })
            .filter((u): u is CsvMediaRef => Boolean(u));
        }
      }

      setUploadProgress("Importing posts…");
      const batchResults = await uploadCsv(file, asDraft, {
        mediaMap,
        retryRows: onlyRetryRows,
        batchId: batchIdRef.current,
      });

      if (onlyRetryRows && results) {
        const byRow = new Map(results.map((r) => [r.row, r]));
        for (const updated of batchResults) {
          byRow.set(updated.row, updated);
        }
        setResults(Array.from(byRow.values()).sort((a, b) => a.row - b.row));
      } else {
        setResults(batchResults);
      }
      setImportedAsDraft(asDraft);
      if (batchIdRef.current.startsWith("plan-")) {
        recordImportedPlanHash(user?.orgId, batchIdRef.current);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("csvImport.importFailed"));
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  };

  const failedRows = results?.filter((r) => !r.ok).map((r) => r.row) ?? [];
  const okCount = results?.filter((r) => r.ok).length ?? 0;
  const errCount = failedRows.length;
  const canImport =
    Boolean(file) &&
    !busy &&
    batchIdRef.current !== "duplicate-skipped" &&
    Boolean(preview) &&
    !preview?.hasBlockingErrors &&
    (preview?.rows.length ?? 0) > 0;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>{t("csvImport.eyebrow")}</div>
          <WorkspaceBadge />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 6px" }}>{t("csvImport.title")}</h1>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>{t("csvImport.subtitle")}</p>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, color: "var(--fg)" }}>Available destinations in this workspace:</span>
          {channels.length === 0 ? (
            <span>No channels connected</span>
          ) : (
            <span>{channels.map((c) => channelDestinationLabel(c)).join(" · ")}</span>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" data-testid="csv-import-error" style={{ padding: "10px 12px", borderRadius: 8, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 13 }}>{error}</div>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void pick(e.dataTransfer.files?.[0]); }}
        style={{
          border: `2px dashed ${dragging ? "var(--accent)" : "var(--line-soft)"}`,
          borderRadius: 14,
          padding: "32px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "rgb(var(--tint) / 0.04)" : "var(--bg)",
        }}
      >
        <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => void pick(e.target.files?.[0])} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>{file ? file.name : t("csvImport.dropHint")}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{file ? `${(file.size / 1024).toFixed(1)} KB` : t("csvImport.maxSize")}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--line-soft)", background: "var(--bg)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Media folder (optional, for `media_path` images or videos)</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {folderFiles.length > 0
              ? `${folderFiles.length} file${folderFiles.length === 1 ? "" : "s"} indexed from folder`
              : "Select the root folder containing the relative image or video paths in your CSV."}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={folderRef}
            type="file"
            multiple
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            style={{ display: "none" }}
            onChange={(e) => pickFolder(e.target.files)}
          />
          <button
            type="button"
            className="anext-btn-secondary"
            onClick={() => folderRef.current?.click()}
          >
            {folderFiles.length > 0 ? "Change media folder" : "Select media folder"}
          </button>
          {folderFiles.length > 0 && (
            <button
              type="button"
              className="anext-btn-secondary"
              onClick={() => {
                uploadedCacheRef.current.clear();
                setFolderFiles([]);
                if (folderRef.current) folderRef.current.value = "";
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--line-soft)", background: "var(--bg)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Media collection (optional)</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Assign newly uploaded CSV attachments to a workspace collection.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            aria-label="CSV media collection"
            value={collectionTarget}
            onChange={(e) => setCollectionTarget(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--line-soft)",
              background: "var(--bg)",
              color: "var(--fg)",
              fontSize: 13,
            }}
          >
            <option value="unassigned">Unassigned</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new__">+ New collection…</option>
          </select>
          {collectionTarget === "__new__" && (
            <input
              type="text"
              placeholder="Collection name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--line-soft)",
                background: "var(--bg)",
                color: "var(--fg)",
                fontSize: 13,
              }}
            />
          )}
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={asDraft}
          onChange={(e) => setAsDraft(e.target.checked)}
        />
        {t("csvImport.asDraft")}
      </label>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="anext-btn-primary"
          data-testid="csv-import-submit-btn"
          style={{ opacity: canImport ? 1 : 0.5, cursor: canImport ? "pointer" : "not-allowed" }}
          onClick={() => void runImport()}
          disabled={!canImport}
        >
          {busy
            ? (uploadProgress ?? t("csvImport.importing"))
            : asDraft && preview && preview.rows.length > 0
              ? `Create ${preview.rows.length} Draft${preview.rows.length === 1 ? "" : "s"} in 5 Posts`
              : t("csvImport.importBtn")}
        </button>
        {failedRows.length > 0 && (
          <button
            type="button"
            className="anext-btn-secondary"
            disabled={busy || Boolean(preview?.hasBlockingErrors)}
            onClick={() => void runImport(failedRows)}
          >
            Retry failed ({failedRows.length})
          </button>
        )}
        <button
          type="button"
          className="anext-btn-secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([buildTemplate(channels.map((c) => c.name))], {
                type: "text/csv;charset=utf-8",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "postsider-template.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          {t("csvImport.downloadTemplate")}
        </button>
        <Link className="anext-btn-secondary" style={{ textDecoration: "none" }} href="/posts">{t("csvImport.backToPosts")}</Link>
      </div>

      {preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Pre-import preview ({preview.rows.length} row{preview.rows.length === 1 ? "" : "s"}, {preview.matchedImageCount} matched image{preview.matchedImageCount === 1 ? "" : "s"}{preview.matchedVideoCount > 0 ? `, ${preview.matchedVideoCount} video${preview.matchedVideoCount === 1 ? "" : "s"}` : ""})
            </div>
            {preview.hasBlockingErrors && (
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--danger-bright)" }}>
                {preview.missingRequiredCols.length > 0
                  ? `Missing required columns: ${preview.missingRequiredCols.join(", ")}`
                  : `${preview.errorRowCount} ${preview.errorRowCount === 1 ? "row has" : "rows have"} missing or invalid media — fix before importing`}
              </span>
            )}
          </div>
          <div style={{ border: "1px solid var(--line-soft)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "52px 1.6fr 1fr 130px 1.3fr", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--line-soft)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
              <span>Row</span>
              <span>Content</span>
              <span>Channels</span>
              <span>Datetime (UTC)</span>
              <span>Media</span>
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {preview.rows.map((r) => (
                <div key={r.row} style={{ display: "grid", gridTemplateColumns: "52px 1.6fr 1fr 130px 1.3fr", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgb(var(--tint) / 0.05)", fontSize: 12, alignItems: "center", background: r.hasError ? "var(--danger-soft)" : "transparent" }}>
                  <span style={{ color: "var(--muted)", fontWeight: 600 }}>{r.row}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.content}>{r.content || "—"}</span>
                  <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.channels || "—"}</span>
                  <span style={{ color: "var(--muted)" }}>{r.datetime || "Next free slot"}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    {r.mediaRefs.length === 0 ? (
                      <span style={{ color: "var(--muted)" }}>Text-only</span>
                    ) : (
                      r.mediaRefs.map((m, idx) => {
                        const thumb = m.file
                          ? thumbUrls.get(m.file)
                          : m.libraryRef
                          ? mediaPathToUrl(m.libraryRef.path) ?? undefined
                          : undefined;
                        return (
                          <div key={`${r.row}-${idx}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 6px", borderRadius: 6, border: `1px solid ${m.status === "matched" ? "var(--line-soft)" : "var(--danger-bright)"}`, fontSize: 11, color: m.status === "matched" ? "var(--fg)" : "var(--danger-bright)" }} title={m.error || m.rawPath}>
                            {thumb && (m.kind === "video" ? (
                              <video src={thumb} muted playsInline style={{ width: 20, height: 20, objectFit: "cover", borderRadius: 4 }} />
                            ) : (
                              <img src={thumb} alt={m.rawPath} style={{ width: 20, height: 20, objectFit: "cover", borderRadius: 4 }} />
                            ))}
                            <span style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.status === "matched" ? m.rawPath : m.error}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <details style={{ fontSize: 13, color: "var(--muted)" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--fg)" }}>{t("csvImport.columnsTitle")}</summary>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
          <li><b>content</b> ({t("csvImport.colRequired")}) {t("csvImport.colContent")}</li>
          <li><b>channels</b> ({t("csvImport.colRequired")}) {t("csvImport.colChannels")}</li>
          <li><b>datetime</b> {t("csvImport.colDatetime")}</li>
          <li><b>first_comment</b> ({t("csvImport.colOptional")}) {t("csvImport.colFirstComment")}</li>
          <li><b>thread</b> ({t("csvImport.colOptional")}) {t("csvImport.colThread")}</li>
          <li><b>media_path</b> ({t("csvImport.colOptional")}) Relative image (<code>jpg, png, gif, webp</code>) or single video (<code>mp4, webm, mov</code>, max 500 MB) path inside the selected media folder; separate multiple images with <code>|</code> (e.g. <code>launch/a.png|launch/b.png</code>). Videos cannot be combined with images or other videos.</li>
        </ul>
      </details>

      {results && (
        <div data-testid="csv-import-results" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {errCount
              ? t("csvImport.summaryWithErrors", { ok: okCount, errors: errCount })
              : t("csvImport.summaryOk", { ok: okCount })}
          </div>
          <div style={{ border: "1px solid var(--line-soft)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 1.4fr", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--line-soft)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
              <span>{t("csvImport.rowHeader")}</span>
              <span>{t("csvImport.statusHeader")}</span>
              <span>{t("csvImport.detailHeader")}</span>
            </div>
            {results.map((r) => (
              <div key={r.row} style={{ display: "grid", gridTemplateColumns: "56px 1fr 1.4fr", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgb(var(--tint) / 0.05)", fontSize: 13, alignItems: "center" }}>
                <span style={{ color: "var(--muted)" }}>{r.row}</span>
                <span style={{ fontWeight: 600, color: r.ok ? "var(--success)" : "var(--danger-bright)" }}>{r.ok ? (importedAsDraft ? t("csvImport.statusDraft") : t("csvImport.statusScheduled")) : t("csvImport.statusError")}</span>
                <span style={{ color: "var(--muted)" }}>{r.ok ? `${r.channels ?? ""}${r.scheduledFor ? ` · ${r.scheduledFor.replace("T", " ")}` : ""}${r.mediaCount ? ` · ${r.mediaCount} image${r.mediaCount === 1 ? "" : "s"}` : ""}` : r.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
