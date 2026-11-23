import {
  SECTION_ROLE_META,
  type BuilderSection,
  type BuilderVariation,
} from "./builder-api";
import { downloadCsv, rowsToCsv } from "./csv-export";
import type { BackendMedia } from "./media-api";

export interface BatchMediaRef {
  id: string;
  name: string;
  path: string;
  thumbnail?: string | null;
  type: string;
}

export interface BatchDraftItem {
  id: string;
  index: number;
  body: string;
  graphicNote?: string;
  media: BatchMediaRef | null;
  reusedCopy: boolean;
  reusedMedia: boolean;
}

export type VisualizerFrequency =
  | "weekdays"
  | "weekly"
  | "biweekly"
  | "every_n_days"
  | "monthly_day"
  | "twice_monthly";

export interface VisualizerSlot {
  id: string;
  batchId: string;
  draftId: string;
  date: string; // YYYY-MM-DD in local/selected timezone
  time: string; // HH:mm in local/selected timezone
  body: string;
  media: BatchMediaRef | null;
  reusedCopy?: boolean;
  reusedMedia?: boolean;
  locked?: boolean;
  manualEdited?: boolean;
}

export interface VisualizerBatch {
  id: string;
  label: string;
  color: string;
  channelName: string;
  channelIds?: string[];
  frequency: VisualizerFrequency;
  everyNDays: number;
  monthlyDay: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // optional YYYY-MM-DD
  time: string; // HH:mm
  timeEnd?: string; // HH:mm optional window end
  slots: VisualizerSlot[];
  writingCollectionIds?: string[];
  mediaCollectionIds?: string[];
}

export interface ConfirmedMatchPlan {
  id: string;
  writingCollectionId: string;
  writingName: string;
  mediaCollectionId: string;
  mediaName: string;
  mediaCoverPath?: string | null;
  previewCaption: string;
  previewMedia?: BatchMediaRef | null;
  batchCount: number;
  frequency: VisualizerFrequency;
  everyNDays: number;
  monthlyDay: number;
  startDate: string;
  timeStart: string;
  timeEnd: string;
  color: string;
  channelIds?: string[];
  channelName?: string;
}

export interface WorkingPlanState {
  matches: ConfirmedMatchPlan[];
  batches: VisualizerBatch[];
  confirmedAt: string | null;
  confirmedHash: string | null;
}

export const BATCH_COLOR_PALETTE = [
  "#2563EB",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#0EA5E9",
] as const;

export function toBatchMediaRef(m: BackendMedia): BatchMediaRef {
  return {
    id: m.id,
    name: m.originalName || m.name,
    path: m.path,
    type: m.type,
  };
}

function assembleFromSections(
  sections: Omit<BuilderSection, "text">[],
  pickedByRole: Record<string, string>,
): { body: string; graphicNote?: string } {
  const captionParts: string[] = [];
  let graphicNote: string | undefined;

  for (const s of sections) {
    const val = (pickedByRole[s.role] ?? "").trim();
    if (!val) continue;
    if (s.role === "graphic_note") {
      graphicNote = val;
    } else {
      captionParts.push(val);
    }
  }

  return { body: captionParts.join("\n\n"), graphicNote };
}

/**
 * Extract a story-lock identifier (e.g. `[S01]`, `S01 · ...`, `story:S01`, `story_id: S01`)
 * from a variation title so story-specific blocks never mix across stories.
 */
export function extractStoryId(title?: string | null): string | null {
  if (!title) return null;
  const bracketed = title.match(/\[(S\d+|[a-z0-9_-]+)\]/i);
  if (bracketed) return bracketed[1].toUpperCase();
  const prefixed = title.match(/^(S\d+)\b/i);
  if (prefixed) return prefixed[1].toUpperCase();
  const explicit = title.match(/story(?:_id)?\s*:\s*([a-z0-9_-]+)/i);
  if (explicit) return explicit[1].toUpperCase();
  return null;
}

export function generateBatchDrafts(params: {
  sections: Omit<BuilderSection, "text">[];
  variations: BuilderVariation[];
  mediaAssets: BackendMedia[];
  count: number;
}): { drafts: BatchDraftItem[]; warnings: string[] } {
  const { sections, variations, mediaAssets, count } = params;
  const safeCount = Number.isFinite(count)
    ? Math.max(1, Math.min(100, Math.floor(count)))
    : 1;
  const warnings: string[] = [];

  const activeSections = sections.filter((s) => s && !s.skipped);
  const byRole = new Map<string, BuilderVariation[]>();
  for (const v of variations) {
    const list = byRole.get(v.sectionRole) ?? [];
    list.push(v);
    byRole.set(v.sectionRole, list);
  }

  const captionSections = activeSections.filter((s) => s && s.role !== "graphic_note");
  const populatedRoleSizes = captionSections
    .map((s) => ({
      role: s.role,
      label: s.label || SECTION_ROLE_META[s.role]?.label || s.role,
      len: (byRole.get(s.role) ?? []).length,
    }))
    .filter((r) => r.len > 0);

  if (populatedRoleSizes.length === 0) {
    warnings.push(
      "No saved variations found for this collection/formula yet. Paste or save variations first, or edit the generated drafts directly.",
    );
  } else {
    const tight = populatedRoleSizes.filter((r) => r.len < safeCount);
    if (tight.length > 0) {
      warnings.push(
        `Fewer variations than requested (${tight
          .map((t) => `${t.label}: ${t.len}`)
          .join(", ")}) — items will cycle across ${safeCount} posts.`,
      );
    }
  }

  if (mediaAssets.length > 0 && mediaAssets.length < safeCount) {
    warnings.push(
      `Selected Media Collection has ${mediaAssets.length} asset${mediaAssets.length === 1 ? "" : "s"} — media will cycle across ${safeCount} posts.`,
    );
  }

  const minBankSize =
    populatedRoleSizes.length > 0
      ? Math.min(...populatedRoleSizes.map((r) => r.len))
      : 0;

  const drafts: BatchDraftItem[] = [];
  for (let i = 0; i < safeCount; i++) {
    const pickedByRole: Record<string, string> = {};
    let lockedStoryId: string | null = null;
    activeSections.forEach((sec, slotIdx) => {
      const pool = byRole.get(sec.role) ?? [];
      if (pool.length === 0) return;
      let candidatePool = pool;
      if (lockedStoryId) {
        const sameStory = pool.filter((v) => extractStoryId(v.title) === lockedStoryId);
        if (sameStory.length > 0) {
          candidatePool = sameStory;
        } else {
          // Never mix a different story_id; fall back only to un-locked blocks.
          const unlocked = pool.filter((v) => !extractStoryId(v.title));
          if (unlocked.length > 0) candidatePool = unlocked;
        }
      }
      // Stagger slot offsets so hooks/bodies don't pair 1:1 identically when sizes match.
      const idx = (i + slotIdx * 3) % candidatePool.length;
      const picked = candidatePool[idx];
      pickedByRole[sec.role] = picked.content;
      if (!lockedStoryId) {
        lockedStoryId = extractStoryId(picked.title);
      }
    });

    const { body, graphicNote } = assembleFromSections(
      activeSections,
      pickedByRole,
    );
    const media =
      mediaAssets.length > 0
        ? toBatchMediaRef(mediaAssets[i % mediaAssets.length])
        : null;

    drafts.push({
      id: `draft-${i + 1}-${crypto.randomUUID().slice(0, 8)}`,
      index: i + 1,
      body: body || `Draft post #${i + 1}`,
      graphicNote,
      media,
      reusedCopy: minBankSize > 0 && i >= minBankSize,
      reusedMedia: mediaAssets.length > 0 && i >= mediaAssets.length,
    });
  }

  return { drafts, warnings };
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  return { y: y || 2026, m: m || 1, d: d || 1 };
}

function formatYmd(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysInMonth(year: number, monthZeroIndexed: number): number {
  return new Date(year, monthZeroIndexed + 1, 0).getDate();
}

export function generateScheduleDates(params: {
  count: number;
  frequency: VisualizerFrequency;
  everyNDays: number;
  monthlyDay: number;
  startDate: string;
  endDate?: string;
}): string[] {
  const { count, frequency, everyNDays, monthlyDay, startDate, endDate } = params;
  if (count <= 0) return [];
  const { y, m, d } = parseYmd(startDate);
  let cursor = new Date(y, m - 1, d);
  const dates: string[] = [];
  let monthCursorYear = y;
  let monthCursorMonth = m - 1;
  let guard = 0;

  while (dates.length < count && guard < 2000) {
    guard++;
    if (frequency === "monthly_day" || frequency === "twice_monthly") {
      const maxD = daysInMonth(monthCursorYear, monthCursorMonth);
      const baseD = Math.max(1, Math.min(monthlyDay || 1, maxD));
      const dayCandidates =
        frequency === "twice_monthly"
          ? Array.from(
            new Set([
              baseD,
              baseD <= 16
                ? Math.min(baseD + 14, maxD)
                : Math.max(1, baseD - 14),
            ]),
          ).sort((a, b) => a - b)
          : [baseD];

      for (const targetDay of dayCandidates) {
        if (dates.length >= count) break;
        const candidate = new Date(monthCursorYear, monthCursorMonth, targetDay);
        if (candidate >= new Date(y, m - 1, d)) {
          const ymd = formatYmd(candidate);
          if (endDate && ymd > endDate) {
            guard = 2000;
            break;
          }
          dates.push(ymd);
        }
      }
      monthCursorMonth += 1;
      if (monthCursorMonth > 11) {
        monthCursorMonth = 0;
        monthCursorYear += 1;
      }
      continue;
    }

    const ymd = formatYmd(cursor);
    if (endDate && ymd > endDate) break;

    if (frequency === "weekdays") {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) {
        dates.push(ymd);
      }
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1,
      );
    } else if (frequency === "weekly") {
      dates.push(ymd);
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 7,
      );
    } else if (frequency === "biweekly") {
      dates.push(ymd);
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 14,
      );
    } else {
      const step = Math.max(1, everyNDays || 1);
      dates.push(ymd);
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + step,
      );
    }
  }

  return dates;
}

function parseHm(hm: string): number {
  const [h, m] = (hm || "09:00").split(":").map((n) => Number(n));
  const safeH = Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 9;
  const safeM = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
  return safeH * 60 + safeM;
}

function formatHm(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function computeWindowTime(
  timeStart: string,
  timeEnd: string | undefined,
  index: number,
  total: number,
): string {
  const startMin = parseHm(timeStart || "09:00");
  const endMin = parseHm(timeEnd || timeStart || "09:00");
  if (endMin <= startMin || total <= 1) {
    return formatHm(startMin);
  }
  // Deterministic spread across the window so times vary naturally yet stay stable
  const span = endMin - startMin;
  const stepFraction = ((index * 0.61803398875) % 1);
  const minutes = startMin + Math.round((span * stepFraction) / 5) * 5;
  return formatHm(Math.min(endMin, Math.max(startMin, minutes)));
}

export function prioritizeUnusedMedia(
  mediaAssets: BackendMedia[],
  usedIds: Set<string>,
): BackendMedia[] {
  const unused: BackendMedia[] = [];
  const used: BackendMedia[] = [];
  for (const m of mediaAssets) {
    if (usedIds.has(m.id)) used.push(m);
    else unused.push(m);
  }
  return [...unused, ...used];
}

export function scheduleDraftsIntoSlots(params: {
  batchId: string;
  drafts: BatchDraftItem[];
  frequency: VisualizerFrequency;
  everyNDays: number;
  monthlyDay: number;
  startDate: string;
  endDate?: string;
  time: string;
  timeEnd?: string;
}): VisualizerSlot[] {
  const dates = generateScheduleDates({
    count: params.drafts.length,
    frequency: params.frequency,
    everyNDays: params.everyNDays,
    monthlyDay: params.monthlyDay,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  return dates.map((date, idx) => {
    const draft = params.drafts[idx];
    return {
      id: `slot-${params.batchId}-${idx + 1}`,
      batchId: params.batchId,
      draftId: draft.id,
      date,
      time: computeWindowTime(
        params.time || "09:00",
        params.timeEnd,
        idx,
        dates.length,
      ),
      body: draft.body,
      media: draft.media,
      reusedCopy: draft.reusedCopy,
      reusedMedia: draft.reusedMedia,
    };
  });
}

export function localDateTimeToUtcCsv(date: string, time: string): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map((n) => Number(n));
  const [hh, mm] = (time || "09:00").split(":").map((n) => Number(n));
  const local = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
  if (Number.isNaN(local.getTime())) return "";
  const uy = local.getUTCFullYear();
  const um = String(local.getUTCMonth() + 1).padStart(2, "0");
  const ud = String(local.getUTCDate()).padStart(2, "0");
  const uh = String(local.getUTCHours()).padStart(2, "0");
  const umin = String(local.getUTCMinutes()).padStart(2, "0");
  return `${uy}-${um}-${ud} ${uh}:${umin}`;
}

export interface CsvExportBatchInput {
  channelName: string;
  channelIds?: string[];
  label?: string;
  color?: string;
  items: Array<{
    body: string;
    media?: BatchMediaRef | null;
    date?: string;
    time?: string;
  }>;
}

export function buildBatchCsvString(batches: CsvExportBatchInput[]): string {
  const headers = [
    "content",
    "channels",
    "datetime",
    "first_comment",
    "thread",
    "media_path",
    "batch_label",
    "batch_color",
  ];

  const rows: unknown[][] = [];
  for (const b of batches) {
    const channel = b.channelName.trim() || "Your channel name";
    for (const item of b.items) {
      const dt =
        item.date && item.date.trim()
          ? localDateTimeToUtcCsv(item.date.trim(), item.time || "09:00")
          : "";
      rows.push([
        item.body,
        channel,
        dt,
        "",
        "",
        item.media?.path || "",
        b.label || "",
        b.color || "",
      ]);
    }
  }

  return rowsToCsv(headers, rows);
}

export function exportBatchesToCsvFile(
  filename: string,
  batches: CsvExportBatchInput[],
): string {
  const csv = buildBatchCsvString(batches);
  downloadCsv(filename, csv);
  return csv;
}

const STAGING_STORAGE_PREFIX = "anextpost:staging-batches:";
const WORKING_PLAN_PREFIX = "anextpost:working-plan:";
const PENDING_IMPORT_PREFIX = "anextpost:pendingCsvImport:";
const IMPORTED_HASHES_PREFIX = "anextpost:importedPlanHashes:";

function isLegacyDemoBatch(batch: Partial<VisualizerBatch> | null | undefined): boolean {
  if (!batch) return true;
  const ch = String(batch.channelName ?? "");
  if (ch.startsWith("[DEMO]") || ch === "LinkedIn Test Channel (Offline)") return true;
  if (Array.isArray(batch.slots) && batch.slots.some((s) => String(s?.body ?? "").startsWith("[DEMO]"))) {
    return true;
  }
  return false;
}

export function computePlanHash(batches: VisualizerBatch[]): string {
  const canonical = batches.map((b) => ({
    label: b.label,
    channelName: b.channelName,
    slots: b.slots.map((s) => ({
      date: s.date,
      time: s.time,
      body: s.body,
      media: s.media?.path ?? "",
    })),
  }));
  const str = JSON.stringify(canonical);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `plan-${(hash >>> 0).toString(16)}`;
}

export function loadWorkingPlan(orgId: string | undefined): WorkingPlanState {
  const empty: WorkingPlanState = {
    matches: [],
    batches: loadStagingBatches(orgId),
    confirmedAt: null,
    confirmedHash: null,
  };
  if (typeof window === "undefined" || !orgId) return empty;
  try {
    const raw = window.localStorage.getItem(`${WORKING_PLAN_PREFIX}${orgId}`);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<WorkingPlanState>;
    const rawBatches = Array.isArray(parsed.batches) ? parsed.batches : empty.batches;
    const cleanedBatches = rawBatches.filter((b) => !isLegacyDemoBatch(b));
    return {
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      batches: cleanedBatches,
      confirmedAt: cleanedBatches.length > 0 && typeof parsed.confirmedAt === "string" ? parsed.confirmedAt : null,
      confirmedHash: cleanedBatches.length > 0 && typeof parsed.confirmedHash === "string" ? parsed.confirmedHash : null,
    };
  } catch {
    return empty;
  }
}

export function saveWorkingPlan(
  orgId: string | undefined,
  plan: WorkingPlanState,
): void {
  if (typeof window === "undefined" || !orgId) return;
  try {
    window.localStorage.setItem(
      `${WORKING_PLAN_PREFIX}${orgId}`,
      JSON.stringify(plan),
    );
    window.localStorage.setItem(
      `${STAGING_STORAGE_PREFIX}${orgId}`,
      JSON.stringify(plan.batches),
    );
  } catch {
    // ignore quota errors
  }
}

export function hasImportedPlanHash(
  orgId: string | undefined,
  hash: string | null | undefined,
): boolean {
  if (typeof window === "undefined" || !orgId || !hash) return false;
  try {
    const raw = window.localStorage.getItem(`${IMPORTED_HASHES_PREFIX}${orgId}`);
    if (!raw) return false;
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.includes(hash);
  } catch {
    return false;
  }
}

export function recordImportedPlanHash(
  orgId: string | undefined,
  hash: string | null | undefined,
): void {
  if (typeof window === "undefined" || !orgId || !hash) return;
  try {
    const raw = window.localStorage.getItem(`${IMPORTED_HASHES_PREFIX}${orgId}`);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(hash)) {
      window.localStorage.setItem(
        `${IMPORTED_HASHES_PREFIX}${orgId}`,
        JSON.stringify([...list.slice(-24), hash]),
      );
    }
  } catch {
    // ignore
  }
}

export function loadStagingBatches(orgId: string | undefined): VisualizerBatch[] {
  if (typeof window === "undefined" || !orgId) return [];
  try {
    const raw = window.localStorage.getItem(`${STAGING_STORAGE_PREFIX}${orgId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cleaned = (parsed as VisualizerBatch[]).filter((b) => !isLegacyDemoBatch(b));
    if (cleaned.length !== parsed.length) {
      window.localStorage.setItem(`${STAGING_STORAGE_PREFIX}${orgId}`, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function saveStagingBatches(
  orgId: string | undefined,
  batches: VisualizerBatch[],
): void {
  if (typeof window === "undefined" || !orgId) return;
  try {
    window.localStorage.setItem(
      `${STAGING_STORAGE_PREFIX}${orgId}`,
      JSON.stringify(batches),
    );
  } catch {
    // ignore quota errors
  }
}

export function savePendingCsvImport(
  orgId: string | undefined,
  payload: { csv: string; filename: string; confirmedHash?: string | null },
): void {
  if (typeof window === "undefined" || !orgId) return;
  window.sessionStorage.setItem(
    `${PENDING_IMPORT_PREFIX}${orgId}`,
    JSON.stringify(payload),
  );
}

export function consumePendingCsvImport(
  orgId: string | undefined,
): { csv: string; filename: string; confirmedHash?: string | null } | null {
  if (typeof window === "undefined" || !orgId) return null;
  const key = `${PENDING_IMPORT_PREFIX}${orgId}`;
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  window.sessionStorage.removeItem(key);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.csv === "string") {
      return {
        csv: parsed.csv,
        filename:
          typeof parsed.filename === "string"
            ? parsed.filename
            : "visualizer-batch.csv",
        confirmedHash:
          typeof parsed.confirmedHash === "string" ? parsed.confirmedHash : null,
      };
    }
  } catch {
    // ignore malformed
  }
  return null;
}

export function analyzeBatchSpacing(batch: VisualizerBatch): {
  issues: string[];
  repeatedCount: number;
} {
  const issues: string[] = [];
  const repeatedCount = batch.slots.filter(
    (s) => s.reusedCopy || s.reusedMedia,
  ).length;

  const sorted = [...batch.slots].sort((a, b) => a.date.localeCompare(b.date));
  const countsByDate = new Map<string, number>();
  for (const s of sorted) {
    countsByDate.set(s.date, (countsByDate.get(s.date) ?? 0) + 1);
  }
  const sameDayDupes = Array.from(countsByDate.values()).filter((c) => c > 1).length;
  if (sameDayDupes > 0) {
    issues.push(`${sameDayDupes} day(s) have >1 post from this batch`);
  }

  const maxExpectedGap =
    batch.frequency === "weekdays"
      ? 4
      : batch.frequency === "weekly"
        ? 10
        : batch.frequency === "biweekly"
          ? 18
          : batch.frequency === "monthly_day"
            ? 35
            : Math.max(2, (batch.everyNDays || 1) * 2);

  let largeGaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].date + "T00:00:00Z").getTime();
    const curr = new Date(sorted[i].date + "T00:00:00Z").getTime();
    const diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays > maxExpectedGap) largeGaps++;
  }
  if (largeGaps > 0) {
    issues.push(`${largeGaps} uneven gap(s) > ${maxExpectedGap}d`);
  }

  return { issues, repeatedCount };
}

export interface OfficialScheduledSlot {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  channelName: string;
  channelIds?: string[];
  channelId?: string;
  title: string;
  state: string;
}

export interface OptimiseSlotChange {
  batchId: string;
  batchLabel: string;
  slotId: string;
  bodyPreview: string;
  oldDate: string;
  oldTime: string;
  newDate: string;
  newTime: string;
  changed: boolean;
  locked: boolean;
  unplacedReason?: string;
}

export interface OptimiseScheduleOptions {
  selectedBatchIds: string[];
  startDate: string;
  endDate: string;
  weeklyTarget: number;
  timeStart: string;
  timeEnd: string;
  varyTimeInWindow: boolean;
  clashBufferMinutes?: number;
  respectBatchWindows?: boolean;
}

export interface OptimiseScheduleResult {
  proposedBatches: VisualizerBatch[];
  changes: OptimiseSlotChange[];
  unplacedCount: number;
  remainingClashCount: number;
  shortfallSummary: string | null;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0);
}

function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  const h = String(Math.floor(clamped / 60)).padStart(2, "0");
  const m = String(clamped % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function getMondayWeekKey(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const day = (dt.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  dt.setUTCDate(dt.getUTCDate() - day);
  return dt.toISOString().slice(0, 10);
}

function channelsMatch(a: string, b: string): boolean {
  const partsA = a
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const partsB = b
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (partsA.length === 0 || partsB.length === 0) return true;
  return partsA.some((pa) => partsB.includes(pa));
}

export function detectScheduleClashes(
  batches: VisualizerBatch[],
  officialPosts: OfficialScheduledSlot[],
  bufferMinutes = 30,
): {
  clashingSlotIds: Set<string>;
  multiPostDates: Set<string>;
} {
  const clashingSlotIds = new Set<string>();
  const countByDate = new Map<string, number>();

  for (const op of officialPosts) {
    countByDate.set(op.date, (countByDate.get(op.date) ?? 0) + 1);
  }

  const batchEntries: Array<{ slot: VisualizerSlot; channelName: string }> = [];
  for (const b of batches) {
    for (const s of b.slots) {
      batchEntries.push({ slot: s, channelName: b.channelName });
      countByDate.set(s.date, (countByDate.get(s.date) ?? 0) + 1);
    }
  }

  // Check batch slot vs official scheduled posts
  for (const entry of batchEntries) {
    const entryMin = toMinutes(entry.slot.time);
    for (const op of officialPosts) {
      if (
        op.date === entry.slot.date &&
        channelsMatch(entry.channelName, op.channelName) &&
        Math.abs(entryMin - toMinutes(op.time)) < bufferMinutes
      ) {
        clashingSlotIds.add(entry.slot.id);
      }
    }
  }

  // Check batch slot vs other batch slots
  for (let i = 0; i < batchEntries.length; i++) {
    for (let j = i + 1; j < batchEntries.length; j++) {
      const a = batchEntries[i];
      const b = batchEntries[j];
      if (
        a.slot.date === b.slot.date &&
        channelsMatch(a.channelName, b.channelName) &&
        Math.abs(toMinutes(a.slot.time) - toMinutes(b.slot.time)) < bufferMinutes
      ) {
        clashingSlotIds.add(a.slot.id);
        clashingSlotIds.add(b.slot.id);
      }
    }
  }

  const multiPostDates = new Set<string>();
  for (const [date, count] of countByDate.entries()) {
    if (count > 1) multiPostDates.add(date);
  }

  return { clashingSlotIds, multiPostDates };
}

export function optimiseBatchesAgainstSchedule(
  batches: VisualizerBatch[],
  officialPosts: OfficialScheduledSlot[],
  options: OptimiseScheduleOptions,
): OptimiseScheduleResult {
  const buffer = options.clashBufferMinutes ?? 30;
  const selectedSet = new Set(options.selectedBatchIds);
  const respectBatchWindows = options.respectBatchWindows !== false;
  const globalStartMin = toMinutes(options.timeStart || "09:00");
  const globalEndMin = Math.max(
    globalStartMin,
    toMinutes(options.timeEnd || options.timeStart || "10:00"),
  );
  const weeklyTarget = Math.max(1, options.weeklyTarget || 4);

  // Track occupied slots (date -> list of { timeMin, channelName }) and weekly counts per channel
  const occupiedByDate = new Map<string, Array<{ timeMin: number; channelName: string }>>();
  const weekCounts = new Map<string, number>();

  const recordOccupied = (date: string, time: string, channelName: string) => {
    const list = occupiedByDate.get(date) ?? [];
    list.push({ timeMin: toMinutes(time), channelName });
    occupiedByDate.set(date, list);
    const wk = `${getMondayWeekKey(date)}|${channelName.trim().toLowerCase()}`;
    weekCounts.set(wk, (weekCounts.get(wk) ?? 0) + 1);
  };

  const hasTimeClashOnDate = (date: string, tMin: number, channelName: string): boolean => {
    const dayOccupied = occupiedByDate.get(date) ?? [];
    return dayOccupied.some(
      (occ) =>
        channelsMatch(channelName, occ.channelName) &&
        Math.abs(tMin - occ.timeMin) < buffer,
    );
  };

  for (const op of officialPosts) {
    recordOccupied(op.date, op.time, op.channelName);
  }
  for (const b of batches) {
    for (const s of b.slots) {
      if (!selectedSet.has(b.id) || s.locked) {
        recordOccupied(s.date, s.time, b.channelName);
      }
    }
  }

  // Build candidate dates in [startDate, endDate]
  const allDatesInRange: string[] = [];
  const startDt = new Date(`${options.startDate}T00:00:00Z`);
  const endDt = new Date(`${options.endDate}T00:00:00Z`);
  if (!Number.isNaN(startDt.getTime()) && !Number.isNaN(endDt.getTime()) && startDt <= endDt) {
    for (let d = new Date(startDt); d <= endDt && allDatesInRange.length < 366; d.setUTCDate(d.getUTCDate() + 1)) {
      allDatesInRange.push(d.toISOString().slice(0, 10));
    }
  }

  const getBatchWindow = (batch: VisualizerBatch): { startMin: number; endMin: number } => {
    if (!respectBatchWindows) {
      return { startMin: globalStartMin, endMin: globalEndMin };
    }
    const bStart = toMinutes(batch.time || options.timeStart || "09:00");
    const bEnd = Math.max(bStart, toMinutes(batch.timeEnd || batch.time || options.timeEnd || "10:00"));
    return { startMin: bStart, endMin: bEnd };
  };

  const isDatePermitted = (batch: VisualizerBatch, ymd: string): boolean => {
    if (options.startDate && ymd < options.startDate) return false;
    if (options.endDate && ymd > options.endDate) return false;
    if (batch.frequency === "weekdays") {
      const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
      return dow >= 1 && dow <= 5;
    }
    return true;
  };

  // First pass across selected batches: keep unlocked slots that have NO clash,
  // sit inside their batch window, and fit within weeklyTarget.
  const keptSlotIds = new Set<string>();
  const slotsToPlace: Array<{ batch: VisualizerBatch; slot: VisualizerSlot }> = [];

  for (const batch of batches) {
    if (!selectedSet.has(batch.id)) continue;
    const { startMin, endMin } = getBatchWindow(batch);
    const chanKey = batch.channelName.trim().toLowerCase();
    const sorted = [...batch.slots].sort((a, b) =>
      `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
    );
    for (const slot of sorted) {
      if (slot.locked) continue;
      const tMin = toMinutes(slot.time || batch.time || "09:00");
      const inWindow = tMin >= startMin && tMin <= endMin;
      const wkKey = `${getMondayWeekKey(slot.date)}|${chanKey}`;
      const wkTotal = weekCounts.get(wkKey) ?? 0;
      const fits =
        inWindow &&
        isDatePermitted(batch, slot.date) &&
        !hasTimeClashOnDate(slot.date, tMin, batch.channelName) &&
        wkTotal < weeklyTarget;
      if (fits) {
        keptSlotIds.add(slot.id);
        recordOccupied(slot.date, slot.time, batch.channelName);
      } else {
        slotsToPlace.push({ batch, slot });
      }
    }
  }

  // Second pass: redistribute only clashing / overcrowded / out-of-window slots.
  // Move the day FIRST while preserving original posting time (clamped to batch window);
  // only adjust time within that batch's window if no permitted day has the original time free.
  const placedMap = new Map<string, { date: string; time: string; unplacedReason?: string }>();
  let unplacedCount = 0;

  for (const { batch, slot } of slotsToPlace) {
    const { startMin, endMin } = getBatchWindow(batch);
    const chanKey = batch.channelName.trim().toLowerCase();
    const origMin = toMinutes(slot.time || batch.time || "09:00");
    const preferredMin = Math.min(endMin, Math.max(startMin, origMin));

    const primaryDates = allDatesInRange.filter((ymd) => isDatePermitted(batch, ymd));
    const datesToTry = primaryDates.length > 0 ? primaryDates : allDatesInRange;
    const rankedDates = [...datesToTry].sort((a, b) => {
      const ca = (occupiedByDate.get(a) ?? []).length;
      const cb = (occupiedByDate.get(b) ?? []).length;
      if (ca !== cb) return ca - cb;
      return a.localeCompare(b);
    });

    let chosenDate: string | null = null;
    let chosenTime: string | null = null;

    // Pass 1: Move day first, keep original posting time (preferredMin)
    for (const ymd of rankedDates) {
      const wkKey = `${getMondayWeekKey(ymd)}|${chanKey}`;
      if ((weekCounts.get(wkKey) ?? 0) >= weeklyTarget) continue;
      if (!hasTimeClashOnDate(ymd, preferredMin, batch.channelName)) {
        chosenDate = ymd;
        chosenTime = fromMinutes(preferredMin);
        break;
      }
    }

    // Pass 2: Only if no permitted day had preferredMin free, space within that batch's window
    if (!chosenDate) {
      const step = endMin - startMin < 60 ? 15 : 30;
      const candidateTimes: number[] = [];
      for (let t = startMin; t <= endMin; t += step) {
        if (t !== preferredMin) candidateTimes.push(t);
      }
      for (const ymd of rankedDates) {
        const wkKey = `${getMondayWeekKey(ymd)}|${chanKey}`;
        if ((weekCounts.get(wkKey) ?? 0) >= weeklyTarget) continue;
        for (const tMin of candidateTimes) {
          if (!hasTimeClashOnDate(ymd, tMin, batch.channelName)) {
            chosenDate = ymd;
            chosenTime = fromMinutes(tMin);
            break;
          }
        }
        if (chosenDate) break;
      }
    }

    if (chosenDate && chosenTime) {
      recordOccupied(chosenDate, chosenTime, batch.channelName);
      placedMap.set(slot.id, { date: chosenDate, time: chosenTime });
    } else {
      unplacedCount++;
      placedMap.set(slot.id, {
        date: slot.date,
        time: slot.time,
        unplacedReason: `No open gap in ${options.startDate}–${options.endDate} within ${fromMinutes(startMin)}–${fromMinutes(endMin)} under ${weeklyTarget}/week.`,
      });
    }
  }

  const changes: OptimiseSlotChange[] = [];
  const proposedBatches = batches.map((batch) => {
    if (!selectedSet.has(batch.id)) return batch;
    const nextSlots = batch.slots.map((slot) => {
      if (slot.locked) {
        changes.push({
          batchId: batch.id,
          batchLabel: batch.label,
          slotId: slot.id,
          bodyPreview: slot.body.slice(0, 60),
          oldDate: slot.date,
          oldTime: slot.time,
          newDate: slot.date,
          newTime: slot.time,
          changed: false,
          locked: true,
        });
        return slot;
      }
      if (keptSlotIds.has(slot.id)) {
        changes.push({
          batchId: batch.id,
          batchLabel: batch.label,
          slotId: slot.id,
          bodyPreview: slot.body.slice(0, 60),
          oldDate: slot.date,
          oldTime: slot.time,
          newDate: slot.date,
          newTime: slot.time,
          changed: false,
          locked: false,
        });
        return slot;
      }
      const placed = placedMap.get(slot.id);
      const nextDate = placed?.date ?? slot.date;
      const nextTime = placed?.time ?? slot.time;
      changes.push({
        batchId: batch.id,
        batchLabel: batch.label,
        slotId: slot.id,
        bodyPreview: slot.body.slice(0, 60),
        oldDate: slot.date,
        oldTime: slot.time,
        newDate: nextDate,
        newTime: nextTime,
        changed: nextDate !== slot.date || nextTime !== slot.time,
        locked: false,
        unplacedReason: placed?.unplacedReason,
      });
      return {
        ...slot,
        date: nextDate,
        time: nextTime,
      };
    });
    return { ...batch, slots: nextSlots };
  });

  const postOptimiseClashes = detectScheduleClashes(proposedBatches, officialPosts, buffer);
  const remainingClashCount = postOptimiseClashes.clashingSlotIds.size;

  const summaryParts: string[] = [];
  if (unplacedCount > 0) {
    summaryParts.push(
      `${unplacedCount} post${unplacedCount === 1 ? "" : "s"} could not fit within ${options.startDate}–${options.endDate} (keeping scheduled, locked & window rules).`,
    );
  }
  if (remainingClashCount > 0) {
    summaryParts.push(
      `${remainingClashCount} post${remainingClashCount === 1 ? " still clashes" : "s still clash"} (e.g. locked or unplaced slot).`,
    );
  }
  const shortfallSummary = summaryParts.length > 0 ? summaryParts.join(" ") : null;

  return {
    proposedBatches,
    changes,
    unplacedCount,
    remainingClashCount,
    shortfallSummary,
  };
}

// ---------------------------------------------------------------------------
// Match Provenance (links 6 Schedule / 5 Posts items back to Builder matches)
// ---------------------------------------------------------------------------

export interface MatchProvenanceRecord {
  matchId: string;
  batchId: string;
  batchLabel: string;
  writingCollectionId: string;
  writingCollectionName: string;
  mediaCollectionId: string;
  mediaCollectionName: string;
  isDemo?: boolean;
}

export interface MatchProvenanceStore {
  byPostId: Record<string, MatchProvenanceRecord>;
  byGroup: Record<string, MatchProvenanceRecord>;
}

const PROVENANCE_STORAGE_PREFIX = "anextpost:match-provenance:v1";

function provenanceKey(orgId?: string): string {
  return orgId
    ? `${PROVENANCE_STORAGE_PREFIX}:${orgId}`
    : `${PROVENANCE_STORAGE_PREFIX}:default`;
}

export function loadMatchProvenance(orgId?: string): MatchProvenanceStore {
  if (typeof window === "undefined") return { byPostId: {}, byGroup: {} };
  try {
    const raw = window.localStorage.getItem(provenanceKey(orgId));
    if (!raw) return { byPostId: {}, byGroup: {} };
    const parsed = JSON.parse(raw) as Partial<MatchProvenanceStore>;
    return {
      byPostId: parsed.byPostId && typeof parsed.byPostId === "object" ? parsed.byPostId : {},
      byGroup: parsed.byGroup && typeof parsed.byGroup === "object" ? parsed.byGroup : {},
    };
  } catch {
    return { byPostId: {}, byGroup: {} };
  }
}

export function saveMatchProvenance(
  orgId: string | undefined,
  store: MatchProvenanceStore,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(provenanceKey(orgId), JSON.stringify(store));
  } catch {
    // ignore storage quota errors
  }
}

export function registerPostProvenance(
  orgId: string | undefined,
  entries: Array<{ postId?: string; group?: string; record: MatchProvenanceRecord }>,
): void {
  const store = loadMatchProvenance(orgId);
  for (const entry of entries) {
    if (entry.postId) {
      store.byPostId[entry.postId] = entry.record;
    }
    if (entry.group) {
      store.byGroup[entry.group] = entry.record;
    }
  }
  saveMatchProvenance(orgId, store);
}

export function resolvePostProvenance(
  store: MatchProvenanceStore,
  post: { id: string; group?: string },
): MatchProvenanceRecord | null {
  if (store.byPostId[post.id]) return store.byPostId[post.id];
  if (post.group && store.byGroup[post.group]) return store.byGroup[post.group];
  return null;
}

export function removeDemoMatchProvenance(orgId?: string): void {
  const store = loadMatchProvenance(orgId);
  const nextByPostId: Record<string, MatchProvenanceRecord> = {};
  for (const [k, v] of Object.entries(store.byPostId)) {
    if (!v.isDemo) nextByPostId[k] = v;
  }
  const nextByGroup: Record<string, MatchProvenanceRecord> = {};
  for (const [k, v] of Object.entries(store.byGroup)) {
    if (!v.isDemo) nextByGroup[k] = v;
  }
  saveMatchProvenance(orgId, { byPostId: nextByPostId, byGroup: nextByGroup });
}

export function formatDestinationRole(identifier?: string | null): string | null {
  if (!identifier) return null;
  if (identifier === "linkedin") return "Profile";
  if (identifier === "linkedin-page") return "Page";
  return null;
}

export function formatPlatformDisplayName(identifier?: string | null): string {
  switch (identifier) {
    case "linkedin":
      return "LinkedIn Profile";
    case "linkedin-page":
      return "LinkedIn Page";
    case "instagram":
    case "instagram-standalone":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "x":
      return "X";
    case "threads":
      return "Threads";
    case "bluesky":
      return "Bluesky";
    default:
      return identifier ? identifier.charAt(0).toUpperCase() + identifier.slice(1) : "Channel";
  }
}

export type MagicCategory =
  | "quote"
  | "infographic"
  | "short_form"
  | "story"
  | "showcase"
  | "offer"
  | "discovery"
  | "portrait"
  | "editorial"
  | "uncertain";

export interface MagicPairSuggestion {
  id: string;
  writingId: string;
  writingName: string;
  mediaId: string;
  mediaName: string;
  score: number;
  reason: string;
  warnings: string[];
  rejected?: boolean;
}

export interface MagicPairUnmatched {
  id: string;
  name: string;
  kind: "writing" | "media";
  reason: string;
}

export interface MagicPairResult {
  suggestions: MagicPairSuggestion[];
  unmatched: MagicPairUnmatched[];
}

export function classifyWritingCategory(name: string, description?: string | null): MagicCategory {
  const hay = `${name} ${description ?? ""}`.toLowerCase();
  if (/quote/.test(hay)) return "quote";
  if (/infographic|diagram|workflow|breakdown/.test(hay)) return "infographic";
  if (/short[\s-]*form|visual/.test(hay) && !/showcase|project/.test(hay)) return "short_form";
  if (/story|stories|founder/.test(hay)) return "story";
  if (/project|portfolio|showcase/.test(hay)) return "showcase";
  if (/offer|service|product|playbook/.test(hay)) return "offer";
  if (/discovery|question/.test(hay)) return "discovery";
  return "uncertain";
}

export function classifyMediaCategory(name: string): MagicCategory {
  const hay = name.toLowerCase();
  if (/quote|three word|start before|creative invitation|editorial note/.test(hay)) return "quote";
  if (/infographic|guideline|layout|brief to publish|strategy and positioning|founder content mix|choose the right format|plan a shoot|positioning/.test(hay)) return "infographic";
  if (/portfolio|project story/.test(hay)) return "showcase";
  if (/service card|violet video|visuals matter|listening to customer/.test(hay)) return "offer";
  if (/headline|overlay|cover/.test(hay)) return "editorial";
  if (/portrait|jumper|shirt|studio|hand study|stylus|viewfinder|laptop|interior|black and white/.test(hay)) return "portrait";
  return "uncertain";
}

const MAGIC_COMPATIBILITY: Record<MagicCategory, Partial<Record<MagicCategory, { score: number; label: string }>>> = {
  quote: {
    quote: { score: 95, label: "Quote copy ↔ Quote graphics" },
    editorial: { score: 65, label: "Quote copy ↔ Editorial covers" },
  },
  infographic: {
    infographic: { score: 95, label: "Infographic breakdown ↔ Framework/layout visuals" },
    editorial: { score: 70, label: "Infographic breakdown ↔ Editorial covers" },
  },
  short_form: {
    editorial: { score: 90, label: "Short-form hook ↔ Headline/cover graphics" },
    quote: { score: 80, label: "Short-form hook ↔ Short card visuals" },
    offer: { score: 75, label: "Short-form hook ↔ Service visuals" },
  },
  story: {
    portrait: { score: 92, label: "Founder/personal story ↔ Portraits" },
    editorial: { score: 72, label: "Founder/personal story ↔ Editorial covers" },
  },
  showcase: {
    showcase: { score: 95, label: "Project captions ↔ Portfolio/project visuals" },
    portrait: { score: 75, label: "Project captions ↔ Studio portraits" },
    editorial: { score: 70, label: "Project captions ↔ Editorial covers" },
  },
  offer: {
    offer: { score: 92, label: "Offer/services copy ↔ Service & brand visuals" },
    portrait: { score: 76, label: "Offer/services copy ↔ Founder portraits" },
    editorial: { score: 72, label: "Offer/services copy ↔ Editorial covers" },
  },
  discovery: {
    portrait: { score: 88, label: "Discovery prompts ↔ Portraits" },
    offer: { score: 82, label: "Discovery prompts ↔ Service cards" },
    editorial: { score: 74, label: "Discovery prompts ↔ Editorial covers" },
  },
  portrait: {},
  editorial: {},
  uncertain: {},
};

export function buildMagicPairSuggestions(input: {
  writingCollections: Array<{
    id: string;
    name: string;
    description?: string | null;
    variationCount: number;
    hasStoryLocks?: boolean;
  }>;
  mediaCollections: Array<{
    id: string;
    name: string;
    assetCount: number;
  }>;
  scheduledWritingCounts: Map<string, number>;
  scheduledMediaCounts: Map<string, number>;
  existingPairKeys: Set<string>;
  stagedWritingIds: Set<string>;
  stagedMediaIds: Set<string>;
}): MagicPairResult {
  const suggestions: MagicPairSuggestion[] = [];
  const unmatched: MagicPairUnmatched[] = [];
  const usedMediaInPass = new Set<string>();

  const validMedia = input.mediaCollections.filter((mc) => {
    if (mc.assetCount <= 0) {
      unmatched.push({ id: mc.id, name: mc.name, kind: "media", reason: "No media assets in collection (0)" });
      return false;
    }
    return true;
  });

  for (const wc of input.writingCollections) {
    if (wc.variationCount <= 0) {
      unmatched.push({ id: wc.id, name: wc.name, kind: "writing", reason: "No writing blocks in collection (0)" });
      continue;
    }
    const wCat = classifyWritingCategory(wc.name, wc.description);
    if (wCat === "uncertain") {
      unmatched.push({
        id: wc.id,
        name: wc.name,
        kind: "writing",
        reason: "Missing topic/format keywords — pair manually if intended",
      });
      continue;
    }

    const compatMap = MAGIC_COMPATIBILITY[wCat] ?? {};
    let best: {
      mc: (typeof validMedia)[number];
      effectiveScore: number;
      label: string;
    } | null = null;

    for (const mc of validMedia) {
      const mCat = classifyMediaCategory(mc.name);
      const compat = compatMap[mCat];
      if (!compat) continue;

      const pairKey = `${wc.id}::${mc.id}`;
      const mSched = input.scheduledMediaCounts.get(mc.id) ?? 0;
      const mStaged = input.stagedMediaIds.has(mc.id);
      const alreadyPaired = input.existingPairKeys.has(pairKey);
      const alreadyUsedHere = usedMediaInPass.has(mc.id);

      // Prioritise compatibility first, then prefer Pass 1 / unused media
      let effectiveScore = compat.score;
      if (mSched === 0 && !mStaged) effectiveScore += 15;
      if (alreadyPaired) effectiveScore -= 20;
      if (alreadyUsedHere) effectiveScore -= 12;

      if (!best || effectiveScore > best.effectiveScore) {
        best = { mc, effectiveScore, label: compat.label };
      }
    }

    if (!best) {
      unmatched.push({
        id: wc.id,
        name: wc.name,
        kind: "writing",
        reason: `No compatible non-empty media set found for "${wCat}"`,
      });
      continue;
    }

    usedMediaInPass.add(best.mc.id);
    const warnings: string[] = [];
    const wSched = input.scheduledWritingCounts.get(wc.id) ?? 0;
    const mSched = input.scheduledMediaCounts.get(best.mc.id) ?? 0;
    if (wSched > 0) warnings.push(`Writing Pass ${wSched + 1}`);
    if (mSched > 0) warnings.push(`Media Pass ${mSched + 1}`);
    if (input.stagedWritingIds.has(wc.id)) warnings.push("Writing staged in Builder");
    if (input.stagedMediaIds.has(best.mc.id)) warnings.push("Media staged in Builder");
    if (input.existingPairKeys.has(`${wc.id}::${best.mc.id}`)) warnings.push("Already paired");
    if (wc.hasStoryLocks) warnings.push("Story-locked blocks isolated by [S##]");

    suggestions.push({
      id: `mp-${wc.id}-${best.mc.id}`,
      writingId: wc.id,
      writingName: wc.name,
      mediaId: best.mc.id,
      mediaName: best.mc.name,
      score: best.effectiveScore,
      reason: best.label,
      warnings,
      rejected: false,
    });
  }

  return { suggestions, unmatched };
}
