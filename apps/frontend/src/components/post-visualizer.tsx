"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  analyzeBatchSpacing,
  BATCH_COLOR_PALETTE,
  buildBatchCsvString,
  detectScheduleClashes,
  exportBatchesToCsvFile,
  optimiseBatchesAgainstSchedule,
  savePendingCsvImport,
  scheduleDraftsIntoSlots,
  type BatchDraftItem,
  type OfficialScheduledSlot,
  type OptimiseScheduleResult,
  type VisualizerBatch,
  type VisualizerFrequency,
  type VisualizerSlot,
} from "@/lib/builder-batch";
import { fetchCalendarPosts, fetchPostsList } from "@/lib/posts";
import { mediaPathToUrl } from "@/lib/media-api";
import { PlatformIcon } from "./platform-icon";
import { DestinationFilterChips } from "./destination-filter-chips";
import styles from "./post-builder.module.css";

interface ChannelOption {
  id: string;
  name: string;
  platform: string;
  identifier?: string;
}

interface PostVisualizerProps {
  batches: VisualizerBatch[];
  onChangeBatches: (next: VisualizerBatch[]) => void;
  channels: ChannelOption[];
  pendingBatchDrafts: BatchDraftItem[];
  pendingBatchLabel: string;
  onAddPendingBatch: () => void;
  onBackToBuilder: () => void;
  confirmedAt?: string | null;
  confirmedHash?: string | null;
  onConfirmSequence?: () => void;
}

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatYmdLocal(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd: string, delta: number): string {
  const dt = parseYmdLocal(ymd);
  dt.setDate(dt.getDate() + delta);
  return formatYmdLocal(dt);
}

function getTodayYmdInTz(tzName: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tzName,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return formatYmdLocal(new Date());
  }
}

function getChannelKindLabel(ch: ChannelOption): string {
  if (ch.identifier === "linkedin") return "Profile";
  if (ch.identifier === "linkedin-page") return "Page";
  return ch.platform;
}

function resolveBatchChannels(
  batch: VisualizerBatch,
  channels: ChannelOption[],
): ChannelOption[] {
  if (Array.isArray(batch.channelIds)) {
    return batch.channelIds
      .map((id) => channels.find((c) => c.id === id))
      .filter((c): c is ChannelOption => Boolean(c));
  }
  const byName = channels.find(
    (c) => c.name.trim().toLowerCase() === batch.channelName.trim().toLowerCase(),
  );
  return byName ? [byName] : [];
}

function buildMonthGrid(year: number, monthZero: number): string[] {
  const first = new Date(year, monthZero, 1);
  // Monday = 0 ... Sunday = 6
  const startOffset = (first.getDay() + 6) % 7;
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, monthZero, 1 - startOffset + i);
    cells.push(formatYmdLocal(d));
  }
  return cells;
}

export function PostVisualizer({
  batches,
  onChangeBatches,
  channels,
  pendingBatchDrafts,
  pendingBatchLabel,
  onAddPendingBatch,
  onBackToBuilder,
  confirmedAt = null,
  confirmedHash = null,
  onConfirmSequence,
}: PostVisualizerProps) {
  const router = useRouter();
  const { user } = useAuth();
  const tzName = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
    } catch {
      return "Local";
    }
  }, []);

  const initialAnchor = useMemo(() => {
    const firstSlot = batches[0]?.slots[0]?.date;
    if (firstSlot) return parseYmdLocal(firstSlot);
    return new Date();
  }, [batches]);

  const [viewYear, setViewYear] = useState(initialAnchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialAnchor.getMonth());
  const [selectedSlotRef, setSelectedSlotRef] = useState<{
    batchId: string;
    slotId: string;
  } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [selectedDestIds, setSelectedDestIds] = useState<string[]>([]);

  // Official Schedule overlay state
  const [showOfficialOverlay, setShowOfficialOverlay] = useState(true);
  const [officialChannelFilter, setOfficialChannelFilter] = useState<string>("active");
  const [officialPosts, setOfficialPosts] = useState<OfficialScheduledSlot[]>([]);
  const [draftPosts, setDraftPosts] = useState<OfficialScheduledSlot[]>([]);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [officialError, setOfficialError] = useState<string | null>(null);

  // Magically Optimise state
  const [optimiseOpen, setOptimiseOpen] = useState(false);
  const [optimiseBusy, setOptimiseBusy] = useState(false);
  const [optimiseError, setOptimiseError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [undoOptimiseBatches, setUndoOptimiseBatches] = useState<VisualizerBatch[] | null>(null);
  const [optimiseSummary, setOptimiseSummary] = useState<{
    moved: number;
    unplaced: number;
    shortfall: string | null;
  } | null>(null);
  const [optimiseBatchIds, setOptimiseBatchIds] = useState<string[]>([]);
  const [optimiseStartDate, setOptimiseStartDate] = useState("");
  const [optimiseEndDate, setOptimiseEndDate] = useState("");
  const [optimiseWeeklyTarget, setOptimiseWeeklyTarget] = useState(4);
  const [optimiseTimeStart, setOptimiseTimeStart] = useState("09:00");
  const [optimiseTimeEnd, setOptimiseTimeEnd] = useState("10:00");
  const [optimiseVaryTime, setOptimiseVaryTime] = useState(true);
  const [optimiseProposal, setOptimiseProposal] = useState<OptimiseScheduleResult | null>(null);

  const monthCells = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );

  const loadOfficialSchedule = useCallback(
    async (rangeStart: string, rangeEnd: string): Promise<OfficialScheduledSlot[]> => {
      setOfficialLoading(true);
      setOfficialError(null);
      try {
        const [posts, draftsRes] = await Promise.all([
          fetchCalendarPosts(
            `${rangeStart}T00:00:00.000Z`,
            `${rangeEnd}T23:59:59.999Z`,
          ),
          fetchPostsList({ state: "draft", page: 0, limit: 100 }).catch(() => ({
            posts: [],
          })),
        ]);
        const mapPost = (p: (typeof posts)[number]): OfficialScheduledSlot | null => {
          const dt = new Date(p.publishDate);
          if (Number.isNaN(dt.getTime())) return null;
          const date = formatYmdLocal(dt);
          const time = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
          const channelName =
            p.integration?.name ||
            channels.find((c) => c.id === p.integration?.id)?.name ||
            "LinkedIn";
          const plainTitle = (p.content || "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 60);
          return {
            id: p.id,
            date,
            time,
            channelName,
            channelId: p.integration?.id,
            title: plainTitle || (p.state === "DRAFT" ? "Draft post" : "Scheduled post"),
            state: p.state,
          };
        };

        const mapped: OfficialScheduledSlot[] = [];
        for (const p of posts) {
          // Only officially scheduled posts (QUEUE) count as Scheduled
          if (p.state !== "QUEUE") continue;
          const item = mapPost(p);
          if (item) mapped.push(item);
        }
        const mappedDrafts: OfficialScheduledSlot[] = [];
        for (const d of draftsRes.posts || []) {
          if (d.state !== "DRAFT") continue;
          const item = mapPost(d);
          if (item && item.date >= rangeStart && item.date <= rangeEnd) {
            mappedDrafts.push(item);
          }
        }
        setOfficialPosts(mapped);
        setDraftPosts(mappedDrafts);
        return mapped;
      } catch (err: unknown) {
        const msg = err instanceof Error && err.message ? err.message : "Failed to load official schedule";
        setOfficialError(msg);
        setOfficialPosts([]);
        setDraftPosts([]);
        return [];
      } finally {
        setOfficialLoading(false);
      }
    },
    [channels],
  );

  useEffect(() => {
    if (!showOfficialOverlay) return;
    const start = monthCells[0];
    const end = monthCells[monthCells.length - 1];
    if (start && end) {
      void loadOfficialSchedule(start, end);
    }
  }, [showOfficialOverlay, monthCells, loadOfficialSchedule]);

  const activeBatchChannels = useMemo(() => {
    const set = new Set<string>();
    for (const b of batches) {
      for (const part of b.channelName.split(",")) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed) set.add(trimmed);
      }
      for (const cid of b.channelIds ?? []) {
        const ch = channels.find((c) => c.id === cid);
        if (ch?.name) set.add(ch.name.trim().toLowerCase());
      }
    }
    return set;
  }, [batches, channels]);

  const selectedDestNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const id of selectedDestIds) {
      const ch = channels.find((c) => c.id === id);
      if (ch?.name) set.add(ch.name.trim().toLowerCase());
    }
    return set;
  }, [selectedDestIds, channels]);

  const visibleOfficialPosts = useMemo(() => {
    if (!showOfficialOverlay) return [];
    if (selectedDestIds.length > 0) {
      return officialPosts.filter((op) =>
        selectedDestNameSet.has(op.channelName.trim().toLowerCase()),
      );
    }
    if (officialChannelFilter === "all") return officialPosts;
    if (officialChannelFilter === "active") {
      if (activeBatchChannels.size === 0) return officialPosts;
      return officialPosts.filter((op) =>
        activeBatchChannels.has(op.channelName.trim().toLowerCase()),
      );
    }
    return officialPosts.filter(
      (op) => op.channelName.trim().toLowerCase() === officialChannelFilter.toLowerCase(),
    );
  }, [
    showOfficialOverlay,
    selectedDestIds.length,
    selectedDestNameSet,
    officialChannelFilter,
    officialPosts,
    activeBatchChannels,
  ]);

  const officialByDate = useMemo(() => {
    const map = new Map<string, OfficialScheduledSlot[]>();
    for (const op of visibleOfficialPosts) {
      const list = map.get(op.date) ?? [];
      list.push(op);
      map.set(op.date, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.time.localeCompare(b.time));
    }
    return map;
  }, [visibleOfficialPosts]);

  const visibleDraftPosts = useMemo(() => {
    if (!showOfficialOverlay) return [];
    if (selectedDestIds.length > 0) {
      return draftPosts.filter((dp) =>
        selectedDestNameSet.has(dp.channelName.trim().toLowerCase()),
      );
    }
    if (officialChannelFilter === "all") return draftPosts;
    if (officialChannelFilter === "active") {
      if (activeBatchChannels.size === 0) return draftPosts;
      return draftPosts.filter((dp) =>
        activeBatchChannels.has(dp.channelName.trim().toLowerCase()),
      );
    }
    return draftPosts.filter(
      (dp) => dp.channelName.trim().toLowerCase() === officialChannelFilter.toLowerCase(),
    );
  }, [
    showOfficialOverlay,
    selectedDestIds.length,
    selectedDestNameSet,
    officialChannelFilter,
    draftPosts,
    activeBatchChannels,
  ]);

  const draftByDate = useMemo(() => {
    const map = new Map<string, OfficialScheduledSlot[]>();
    for (const dp of visibleDraftPosts) {
      const list = map.get(dp.date) ?? [];
      list.push(dp);
      map.set(dp.date, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.time.localeCompare(b.time));
    }
    return map;
  }, [visibleDraftPosts]);

  const clashReport = useMemo(
    () => detectScheduleClashes(batches, officialPosts, 30),
    [batches, officialPosts],
  );

  const slotsByDate = useMemo(() => {
    const map = new Map<
      string,
      Array<{ batch: VisualizerBatch; slot: VisualizerSlot }>
    >();
    for (const batch of batches) {
      if (selectedDestIds.length > 0) {
        const resolved = resolveBatchChannels(batch, channels);
        const matchesId = resolved.some((c) => selectedDestIds.includes(c.id));
        const matchesName = batch.channelName
          .split(",")
          .some((part) => selectedDestNameSet.has(part.trim().toLowerCase()));
        if (!matchesId && !matchesName) continue;
      }
      for (const slot of batch.slots) {
        const list = map.get(slot.date) ?? [];
        list.push({ batch, slot });
        map.set(slot.date, list);
      }
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.slot.time.localeCompare(b.slot.time));
    }
    return map;
  }, [batches, channels, selectedDestIds, selectedDestNameSet]);

  const selectedEntry = useMemo(() => {
    if (!selectedSlotRef) return null;
    const batch = batches.find((b) => b.id === selectedSlotRef.batchId);
    const slot = batch?.slots.find((s) => s.id === selectedSlotRef.slotId);
    if (!batch || !slot) return null;
    return { batch, slot };
  }, [batches, selectedSlotRef]);

  const updateBatchAndReschedule = (
    batchId: string,
    patch: Partial<VisualizerBatch>,
    reschedule: boolean,
  ) => {
    onChangeBatches(
      batches.map((b) => {
        if (b.id !== batchId) return b;
        const next = { ...b, ...patch };
        if (!reschedule) return next;
        const drafts: BatchDraftItem[] = b.slots.map((s, idx) => ({
          id: s.draftId,
          index: idx + 1,
          body: s.body,
          media: s.media,
          reusedCopy: false,
          reusedMedia: false,
        }));
        return {
          ...next,
          slots: scheduleDraftsIntoSlots({
            batchId: next.id,
            drafts,
            frequency: next.frequency,
            everyNDays: next.everyNDays,
            monthlyDay: next.monthlyDay,
            startDate: next.startDate,
            endDate: next.endDate || undefined,
            time: next.time,
          }),
        };
      }),
    );
  };

  const updateSingleSlot = (
    batchId: string,
    slotId: string,
    patch: Partial<VisualizerSlot>,
  ) => {
    onChangeBatches(
      batches.map((b) =>
        b.id !== batchId
          ? b
          : {
            ...b,
            slots: b.slots.map((s) =>
              s.id === slotId ? { ...s, ...patch } : s,
            ),
          },
      ),
    );
  };

  const toCsvBatchInputs = () =>
    batches.map((b) => ({
      channelName: b.channelName,
      label: b.label,
      color: b.color,
      items: b.slots.map((s) => ({
        body: s.body,
        media: s.media,
        date: s.date,
        time: s.time,
      })),
    }));

  const handleExportCsv = () => {
    if (batches.length === 0) return;
    exportBatchesToCsvFile(
      `anextpost-visualizer-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsvBatchInputs(),
    );
    const total = batches.reduce((acc, b) => acc + b.slots.length, 0);
    setStatusMsg(
      `Exported ${total} scheduled staging posts across ${batches.length} batch(es) to CSV (UTC). Live Calendar remains untouched until you import.`,
    );
  };

  const handleSendToImport = () => {
    if (batches.length === 0 || !user?.orgId) return;
    const csv = buildBatchCsvString(toCsvBatchInputs());
    savePendingCsvImport(user.orgId, {
      csv,
      filename: `anextpost-visualizer-${new Date().toISOString().slice(0, 10)}.csv`,
      confirmedHash,
    });
    router.push("/posts/csv-import?from=visualizer");
  };

  const totalScheduled = batches.reduce((acc, b) => acc + b.slots.length, 0);
  const isConfirmed = Boolean(confirmedAt);
  const optimiseDateSpan = useMemo(() => {
    const allDates = batches
      .flatMap((b) => [b.startDate, ...b.slots.map((s) => s.date)])
      .filter(Boolean)
      .sort();
    const startDate = allDates[0] || getTodayYmdInTz(tzName);
    const endDate = addDaysYmd(allDates[allDates.length - 1] || startDate, 21);
    return { startDate, endDate };
  }, [batches, tzName]);

  const runOneClickMagicOptimise = async () => {
    if (batches.length === 0) return;
    setOptimiseError(null);
    setConfirmError(null);
    setOptimiseBusy(true);
    const snapshot = batches.map((b) => ({
      ...b,
      slots: b.slots.map((s) => ({ ...s })),
    }));
    const allDates = batches.flatMap((b) => [b.startDate, ...b.slots.map((s) => s.date)]).filter(Boolean).sort();
    const minDate = allDates[0] || formatYmdLocal(new Date());
    const maxDefault = addDaysYmd(allDates[allDates.length - 1] || minDate, 21);
    const firstBatch = batches[0];
    const tStart = firstBatch?.time || optimiseTimeStart || "09:00";
    const tEnd = firstBatch?.timeEnd || optimiseTimeEnd || "14:00";

    try {
      const freshOfficial = await loadOfficialSchedule(minDate, maxDefault);
      const result = optimiseBatchesAgainstSchedule(batches, freshOfficial, {
        selectedBatchIds: batches.map((b) => b.id),
        startDate: minDate,
        endDate: maxDefault,
        weeklyTarget: optimiseWeeklyTarget,
        timeStart: tStart,
        timeEnd: tEnd,
        varyTimeInWindow: optimiseVaryTime,
        respectBatchWindows: true,
      });
      const moved = result.changes.filter((c) => c.changed).length;
      setUndoOptimiseBatches(snapshot);
      setOptimiseSummary({
        moved,
        unplaced: result.unplacedCount,
        shortfall: result.shortfallSummary,
      });
      onChangeBatches(result.proposedBatches);
      setStatusMsg(
        `Magically Optimised: ${moved} eligible post${moved === 1 ? "" : "s"} moved around ${freshOfficial.length} scheduled post${freshOfficial.length === 1 ? "" : "s"}.${result.unplacedCount > 0 ? ` ${result.unplacedCount} could not fit.` : ""}${result.remainingClashCount > 0 ? ` ${result.remainingClashCount} clash${result.remainingClashCount === 1 ? "" : "es"} still remain.` : ""}`,
      );
    } finally {
      setOptimiseBusy(false);
    }
  };

  const handleUndoOptimise = () => {
    if (!undoOptimiseBatches) return;
    setConfirmError(null);
    onChangeBatches(undoOptimiseBatches);
    setUndoOptimiseBatches(null);
    setOptimiseSummary(null);
    setStatusMsg("Undid Magically Optimise — previous sequence restored.");
  };

  const handleConfirmSequenceClick = async () => {
    if (!onConfirmSequence || totalScheduled === 0) return;
    setConfirmError(null);
    const missingDestBatches = batches.filter(
      (b) => resolveBatchChannels(b, channels).length === 0 && !b.channelName.trim(),
    );
    const explicitMissingBatches = batches.filter(
      (b) => Array.isArray(b.channelIds) && b.channelIds.length === 0,
    );
    const missingBatches =
      explicitMissingBatches.length > 0 ? explicitMissingBatches : missingDestBatches;
    if (missingBatches.length > 0) {
      setConfirmError(
        `Cannot confirm sequence: ${missingBatches.map((b) => b.label).join(", ")} ${missingBatches.length === 1 ? "has" : "have"} no connected destination selected.`,
      );
      return;
    }
    setConfirmBusy(true);
    try {
      const allDates = batches
        .flatMap((b) => [b.startDate, ...b.slots.map((s) => s.date)])
        .filter(Boolean)
        .sort();
      const minDate = allDates[0] || formatYmdLocal(new Date());
      const maxDate = allDates[allDates.length - 1] || minDate;
      const latestOfficial = await loadOfficialSchedule(minDate, maxDate);
      const recheck = detectScheduleClashes(batches, latestOfficial, 30);
      if (recheck.clashingSlotIds.size > 0) {
        const examples: string[] = [];
        for (const b of batches) {
          for (const s of b.slots) {
            if (recheck.clashingSlotIds.has(s.id) && examples.length < 4) {
              examples.push(`${b.label}: ${s.date} ${s.time}${s.locked ? " (locked)" : ""}`);
            }
          }
        }
        setConfirmError(
          `Cannot confirm sequence: ${recheck.clashingSlotIds.size} post${recheck.clashingSlotIds.size === 1 ? "" : "s"} still have exact-time clashes (${examples.join("; ")}). Run Magically Optimise, nudge a slot, or unlock a conflicting slot first.`,
        );
        return;
      }
      onConfirmSequence();
      setStatusMsg(
        `Confirmed preview (${totalScheduled} posts). Export CSV or Send to Post Drafts (5 Posts) when ready.`,
      );
    } finally {
      setConfirmBusy(false);
    }
  };

  const openMagicOptimise = async () => {
    if (batches.length === 0) return;
    setOptimiseError(null);
    setOptimiseBusy(true);
    const allDates = batches.flatMap((b) => [b.startDate, ...b.slots.map((s) => s.date)]).filter(Boolean).sort();
    const minDate = allDates[0] || formatYmdLocal(new Date());
    const maxDefault = addDaysYmd(allDates[allDates.length - 1] || minDate, 21);
    const defaultStart = minDate;
    const defaultEnd = maxDefault;
    const defaultIds = batches.map((b) => b.id);
    const firstBatch = batches[0];
    const tStart = firstBatch?.time || "09:00";
    const tEnd = firstBatch?.timeEnd || "10:00";

    setOptimiseBatchIds(defaultIds);
    setOptimiseStartDate(defaultStart);
    setOptimiseEndDate(defaultEnd);
    setOptimiseTimeStart(tStart);
    setOptimiseTimeEnd(tEnd);
    setOptimiseOpen(true);

    try {
      const freshOfficial = await loadOfficialSchedule(defaultStart, defaultEnd);
      const result = optimiseBatchesAgainstSchedule(batches, freshOfficial, {
        selectedBatchIds: defaultIds,
        startDate: defaultStart,
        endDate: defaultEnd,
        weeklyTarget: optimiseWeeklyTarget,
        timeStart: tStart,
        timeEnd: tEnd,
        varyTimeInWindow: optimiseVaryTime,
      });
      setOptimiseProposal(result);
    } finally {
      setOptimiseBusy(false);
    }
  };

  const recalculateOptimisePreview = async () => {
    if (!optimiseStartDate || !optimiseEndDate) return;
    setOptimiseError(null);
    setOptimiseBusy(true);
    try {
      const freshOfficial = await loadOfficialSchedule(optimiseStartDate, optimiseEndDate);
      const result = optimiseBatchesAgainstSchedule(batches, freshOfficial, {
        selectedBatchIds: optimiseBatchIds,
        startDate: optimiseStartDate,
        endDate: optimiseEndDate,
        weeklyTarget: optimiseWeeklyTarget,
        timeStart: optimiseTimeStart,
        timeEnd: optimiseTimeEnd,
        varyTimeInWindow: optimiseVaryTime,
      });
      setOptimiseProposal(result);
    } finally {
      setOptimiseBusy(false);
    }
  };

  const applyOptimiseChanges = async () => {
    if (!optimiseProposal) return;
    setOptimiseError(null);
    setOptimiseBusy(true);
    try {
      // Recheck official Schedule right before applying
      const latestOfficial = await loadOfficialSchedule(optimiseStartDate, optimiseEndDate);
      const selectedBatchesOnly = optimiseProposal.proposedBatches.filter((b) =>
        optimiseBatchIds.includes(b.id),
      );
      const recheck = detectScheduleClashes(selectedBatchesOnly, latestOfficial, 30);
      const newlyClashingUnlocked = selectedBatchesOnly.some((b) =>
        b.slots.some((s) => !s.locked && recheck.clashingSlotIds.has(s.id)),
      );
      if (newlyClashingUnlocked) {
        const refreshed = optimiseBatchesAgainstSchedule(batches, latestOfficial, {
          selectedBatchIds: optimiseBatchIds,
          startDate: optimiseStartDate,
          endDate: optimiseEndDate,
          weeklyTarget: optimiseWeeklyTarget,
          timeStart: optimiseTimeStart,
          timeEnd: optimiseTimeEnd,
          varyTimeInWindow: optimiseVaryTime,
        });
        setOptimiseProposal(refreshed);
        setOptimiseError(
          "Official Schedule changed while reviewing. Refreshed proposal to avoid a new time clash — review and click Apply changes again.",
        );
        return;
      }

      const snapshot = batches.map((b) => ({
        ...b,
        slots: b.slots.map((s) => ({ ...s })),
      }));
      setUndoOptimiseBatches(snapshot);
      const movedCount = optimiseProposal.changes.filter((c) => c.changed).length;
      setOptimiseSummary({
        moved: movedCount,
        unplaced: optimiseProposal.unplacedCount,
        shortfall: optimiseProposal.shortfallSummary,
      });
      onChangeBatches(optimiseProposal.proposedBatches);
      setOptimiseOpen(false);
      setOptimiseProposal(null);
      setStatusMsg(
        `Applied optimised schedule (${movedCount} post${movedCount === 1 ? "" : "s"} updated in working plan; live 6 Schedule unchanged).`,
      );
    } finally {
      setOptimiseBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className={styles.controlBar} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15 }}>
                Staging Post Visualizer ({totalScheduled} posts across{" "}
                {batches.length} batch{batches.length === 1 ? "" : "es"})
              </strong>
              {isConfirmed && (
                <span
                  data-testid="visualizer-confirmed-badge"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: "rgba(79, 70, 229, 0.16)",
                    color: "#4338ca",
                    border: "1px solid rgba(79, 70, 229, 0.35)",
                  }}
                >
                  Confirmed preview
                </span>
              )}
            </div>
            <div
              data-testid="visualizer-optimise-range-label"
              style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}
            >
              Viewing <strong>{monthLabel}</strong> · Optimise range:{" "}
              <strong>
                {optimiseDateSpan.startDate} – {optimiseDateSpan.endDate}
              </strong>{" "}
              ({tzName}) · Staging only — live 6 Schedule is never changed from Visualizer.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="anext-btn-secondary"
              data-testid="visualizer-sidebar-toggle"
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            >
              {sidebarCollapsed ? "Show Batch Controls ▸" : "Hide Batch Controls ◂"}
            </button>
            <button
              type="button"
              className="anext-btn-primary"
              data-testid="visualizer-header-send-posts-btn"
              disabled={totalScheduled === 0}
              onClick={handleSendToImport}
            >
              Send to 5 Posts ({totalScheduled}) →
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            paddingTop: 10,
            borderTop: "1px solid var(--line-soft)",
          }}
        >
          {channels.length > 0 && (
            <div style={{ width: "100%", paddingBottom: 6 }}>
              <DestinationFilterChips
                channels={channels.map((c) => ({
                  id: c.id,
                  name: c.name,
                  platform: c.platform,
                  identifier: c.identifier ?? c.platform.toLowerCase(),
                }))}
                selectedChannelIds={selectedDestIds}
                onChange={setSelectedDestIds}
                testIdPrefix="visualizer-dest"
              />
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            <strong>1. Confirmed preview</strong> (unlocks handoff) →{" "}
            <strong>2. Draft</strong> (in 5 Posts) →{" "}
            <strong>3. Scheduled</strong> (verified on 6 Schedule)
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginLeft: "auto" }}>
            {pendingBatchDrafts.length > 0 && (
              <button
                type="button"
                className="anext-btn-secondary"
                data-testid="visualizer-add-pending-btn"
                onClick={onAddPendingBatch}
              >
                + Add Batch ({pendingBatchDrafts.length}: {pendingBatchLabel})
              </button>
            )}
            <button
              type="button"
              className="anext-btn-secondary"
              data-testid="visualizer-export-csv-btn"
              disabled={totalScheduled === 0 || (Boolean(onConfirmSequence) && !isConfirmed)}
              onClick={handleExportCsv}
            >
              Export CSV ({totalScheduled})
            </button>
            <button
              type="button"
              className="anext-btn-secondary"
              data-testid="visualizer-send-import-btn"
              disabled={totalScheduled === 0 || (Boolean(onConfirmSequence) && !isConfirmed)}
              onClick={handleSendToImport}
            >
              Send to Post Drafts (5 Posts)
            </button>
            {onConfirmSequence && (
              <button
                type="button"
                className={isConfirmed ? "anext-btn-secondary" : "anext-btn-primary"}
                data-testid="visualizer-confirm-sequence-btn"
                disabled={totalScheduled === 0 || isConfirmed || confirmBusy}
                style={{ padding: "10px 20px", fontSize: 14, fontWeight: 700 }}
                onClick={() => void handleConfirmSequenceClick()}
              >
                {confirmBusy
                  ? "Checking clashes…"
                  : isConfirmed
                  ? "Confirmed Preview ✓"
                  : "Confirm Sequence"}
              </button>
            )}
          </div>
        </div>

        {confirmError && (
          <div
            role="alert"
            data-testid="visualizer-confirm-error"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #dc2626",
              background: "rgba(220, 38, 38, 0.10)",
              color: "#dc2626",
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            {confirmError}
          </div>
        )}
      </div>

      {optimiseSummary && (
        <div
          data-testid="visualizer-optimise-summary"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--accent)",
            background: "var(--selection-bg)",
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <strong>
              ✨ Optimised: {optimiseSummary.moved} eligible post{optimiseSummary.moved === 1 ? "" : "s"} moved (scheduled &amp; locked posts preserved).
            </strong>
            {optimiseSummary.shortfall && (
              <span style={{ color: "#b45309", fontSize: 12 }}>
                {optimiseSummary.shortfall}
              </span>
            )}
          </div>
          {undoOptimiseBatches && (
            <button
              type="button"
              className="anext-btn-secondary"
              data-testid="visualizer-optimise-undo-btn"
              onClick={handleUndoOptimise}
              style={{ fontWeight: 700 }}
            >
              ↶ Undo
            </button>
          )}
        </div>
      )}

      {statusMsg && (
        <div
          role="status"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg-elev)",
            fontSize: 13,
          }}
        >
          {statusMsg}
        </div>
      )}

      {batches.length === 0 ? (
        <div className={styles.sectionCard} style={{ padding: 24 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>
            No batches in Visualizer yet
          </h3>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
            Switch to <strong>Post Builder → Batch</strong>, generate a batch
            (20, 30, or 50 posts), and click <strong>Send to Visualizer</strong>{" "}
            to sequence multiple batches side-by-side.
          </p>
          <button
            type="button"
            className="anext-btn-primary"
            onClick={onBackToBuilder}
          >
            Go to Batch Builder
          </button>
        </div>
      ) : (
        <div
          className={`${styles.visualizerLayout} ${
            sidebarCollapsed ? styles.visualizerLayoutCollapsed : ""
          }`}
        >
          {!sidebarCollapsed && (
          <div className={styles.visualizerSidebar} data-testid="visualizer-sidebar">
            {batches.map((b) => (
              <div
                key={b.id}
                className={styles.sectionCard}
                data-testid="visualizer-batch-card"
                style={{ borderLeft: `4px solid ${b.color}` }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <input
                    className={styles.input}
                    value={b.label}
                    aria-label="Batch label"
                    onChange={(e) =>
                      updateBatchAndReschedule(
                        b.id,
                        { label: e.target.value },
                        false,
                      )
                    }
                    style={{ fontWeight: 700, flex: 1 }}
                  />
                  <button
                    type="button"
                    className="anext-btn-secondary"
                    style={{ padding: "4px 8px", fontSize: 12 }}
                    onClick={() =>
                      onChangeBatches(batches.filter((x) => x.id !== b.id))
                    }
                  >
                    Remove
                  </button>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {BATCH_COLOR_PALETTE.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Color ${hex}`}
                      onClick={() =>
                        updateBatchAndReschedule(b.id, { color: hex }, false)
                      }
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        background: hex,
                        border:
                          b.color === hex
                            ? "2px solid var(--fg)"
                            : "1px solid var(--border)",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>

                <div className={styles.field}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <label className={styles.fieldLabel}>Destinations</label>
                    {resolveBatchChannels(b, channels).length === 0 && (
                      <span
                        data-testid="visualizer-missing-destination-badge"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 999,
                          background: "rgba(220, 38, 38, 0.14)",
                          color: "#dc2626",
                        }}
                      >
                        Missing destination
                      </span>
                    )}
                  </div>
                  {channels.length > 0 ? (
                    <DestinationFilterChips
                      channels={channels.map((c) => ({
                        id: c.id,
                        name: c.name,
                        platform: c.platform,
                        identifier: c.identifier ?? c.platform.toLowerCase(),
                      }))}
                      selectedChannelIds={resolveBatchChannels(b, channels).map((x) => x.id)}
                      onChange={(nextIds) => {
                        const nextNames = nextIds
                          .map((id) => channels.find((x) => x.id === id)?.name)
                          .filter(Boolean)
                          .join(", ");
                        updateBatchAndReschedule(
                          b.id,
                          { channelIds: nextIds, channelName: nextNames },
                          false,
                        );
                      }}
                      showAllOption={false}
                      variant="inline"
                      testIdPrefix={`visualizer-batch-${b.id}-dest`}
                      chipTestId={() => "visualizer-batch-dest-chip"}
                    />
                  ) : (
                    <input
                      className={styles.input}
                      value={b.channelName}
                      onChange={(e) =>
                        updateBatchAndReschedule(
                          b.id,
                          { channelName: e.target.value },
                          false,
                        )
                      }
                      placeholder="Channel name"
                    />
                  )}
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Frequency</label>
                  <select
                    className={styles.select}
                    data-testid={`batch-frequency-${b.id}`}
                    value={b.frequency}
                    onChange={(e) =>
                      updateBatchAndReschedule(
                        b.id,
                        { frequency: e.target.value as VisualizerFrequency },
                        true,
                      )
                    }
                  >
                    <option value="weekdays">Weekdays (Mon–Fri)</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="every_n_days">Every N days</option>
                    <option value="monthly_day">1 per month</option>
                    <option value="twice_monthly">2 per month</option>
                  </select>
                </div>

                {b.frequency === "every_n_days" && (
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Interval (days)</label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      className={styles.input}
                      value={b.everyNDays}
                      onChange={(e) =>
                        updateBatchAndReschedule(
                          b.id,
                          { everyNDays: Math.max(1, Number(e.target.value) || 1) },
                          true,
                        )
                      }
                    />
                  </div>
                )}

                {b.frequency === "monthly_day" && (
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>
                      Day of month (1–31)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      className={styles.input}
                      value={b.monthlyDay}
                      onChange={(e) =>
                        updateBatchAndReschedule(
                          b.id,
                          {
                            monthlyDay: Math.max(
                              1,
                              Math.min(31, Number(e.target.value) || 1),
                            ),
                          },
                          true,
                        )
                      }
                    />
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Start date</label>
                    <input
                      type="date"
                      className={styles.input}
                      value={b.startDate}
                      onChange={(e) =>
                        updateBatchAndReschedule(
                          b.id,
                          { startDate: e.target.value },
                          true,
                        )
                      }
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Time ({tzName})</label>
                    <input
                      type="time"
                      className={styles.input}
                      value={b.time}
                      onChange={(e) =>
                        updateBatchAndReschedule(
                          b.id,
                          { time: e.target.value },
                          true,
                        )
                      }
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    End date (optional — caps batch)
                  </label>
                  <input
                    type="date"
                    className={styles.input}
                    value={b.endDate}
                    onChange={(e) =>
                      updateBatchAndReschedule(
                        b.id,
                        { endDate: e.target.value },
                        true,
                      )
                    }
                  />
                </div>

                <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 3 }}>
                  <span>
                    {b.slots.length} scheduled slot
                    {b.slots.length === 1 ? "" : "s"}
                  </span>
                  {(() => {
                    const diag = analyzeBatchSpacing(b);
                    return (
                      <>
                        {diag.repeatedCount > 0 && (
                          <span style={{ color: "#b45309", fontWeight: 600 }}>
                            {diag.repeatedCount} repeated copy/media item(s)
                          </span>
                        )}
                        {diag.issues.map((issue, idx) => (
                          <span key={idx} style={{ color: "#b45309", fontWeight: 600 }}>
                            Spacing: {issue}
                          </span>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}

            {selectedEntry && (
              <div
                className={styles.sectionCard}
                data-testid="visualizer-slot-editor"
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <strong style={{ fontSize: 13 }}>
                    Adjust Post ({selectedEntry.batch.label})
                  </strong>
                  <button
                    type="button"
                    className="anext-btn-secondary"
                    style={{ padding: "2px 8px", fontSize: 11 }}
                    onClick={() => setSelectedSlotRef(null)}
                  >
                    Close
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <input
                    type="date"
                    className={styles.input}
                    data-testid="slot-edit-date"
                    value={selectedEntry.slot.date}
                    onChange={(e) =>
                      updateSingleSlot(
                        selectedEntry.batch.id,
                        selectedEntry.slot.id,
                        { date: e.target.value },
                      )
                    }
                  />
                  <input
                    type="time"
                    className={styles.input}
                    value={selectedEntry.slot.time}
                    onChange={(e) =>
                      updateSingleSlot(
                        selectedEntry.batch.id,
                        selectedEntry.slot.id,
                        { time: e.target.value },
                      )
                    }
                  />
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="anext-btn-secondary"
                    style={{ padding: "4px 8px", fontSize: 12 }}
                    onClick={() =>
                      updateSingleSlot(
                        selectedEntry.batch.id,
                        selectedEntry.slot.id,
                        { date: addDaysYmd(selectedEntry.slot.date, -1) },
                      )
                    }
                  >
                    ← -1 day
                  </button>
                  <button
                    type="button"
                    className="anext-btn-secondary"
                    style={{ padding: "4px 8px", fontSize: 12 }}
                    data-testid="slot-nudge-plus1-btn"
                    onClick={() =>
                      updateSingleSlot(
                        selectedEntry.batch.id,
                        selectedEntry.slot.id,
                        { date: addDaysYmd(selectedEntry.slot.date, 1) },
                      )
                    }
                  >
                    +1 day →
                  </button>
                  <button
                    type="button"
                    className={selectedEntry.slot.locked ? "anext-btn-primary" : "anext-btn-secondary"}
                    style={{ padding: "4px 8px", fontSize: 12 }}
                    data-testid="slot-lock-toggle-btn"
                    onClick={() =>
                      updateSingleSlot(
                        selectedEntry.batch.id,
                        selectedEntry.slot.id,
                        { locked: !selectedEntry.slot.locked },
                      )
                    }
                  >
                    {selectedEntry.slot.locked ? "🔒 Locked" : "Lock slot"}
                  </button>
                </div>

                <textarea
                  className={styles.textarea}
                  value={selectedEntry.slot.body}
                  onChange={(e) =>
                    updateSingleSlot(
                      selectedEntry.batch.id,
                      selectedEntry.slot.id,
                      { body: e.target.value, manualEdited: true },
                    )
                  }
                />
              </div>
            )}
          </div>
          )}

          <div className={styles.sectionCard} style={{ padding: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: 15 }}>{monthLabel}</strong>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className={showOfficialOverlay ? "anext-btn-primary" : "anext-btn-secondary"}
                  data-testid="visualizer-official-overlay-toggle"
                  aria-pressed={showOfficialOverlay}
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={() => setShowOfficialOverlay((prev) => !prev)}
                >
                  {showOfficialOverlay
                    ? `Schedule & Drafts: On (${visibleOfficialPosts.length} scheduled · ${visibleDraftPosts.length} drafts)`
                    : "Show Schedule & Drafts"}
                </button>
                {officialError && showOfficialOverlay && (
                  <span
                    role="alert"
                    style={{
                      fontSize: 11.5,
                      color: "#dc2626",
                      fontWeight: 600,
                    }}
                  >
                    Schedule overlay unavailable: {officialError}
                  </span>
                )}
                {showOfficialOverlay && (
                  <select
                    className={styles.select}
                    aria-label="Official schedule channel filter"
                    value={officialChannelFilter}
                    onChange={(e) => setOfficialChannelFilter(e.target.value)}
                    style={{ fontSize: 12, padding: "4px 8px" }}
                  >
                    <option value="active">Batch channels</option>
                    <option value="all">All workspace channels</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="anext-btn-secondary"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={() => {
                    const prev = new Date(viewYear, viewMonth - 1, 1);
                    setViewYear(prev.getFullYear());
                    setViewMonth(prev.getMonth());
                  }}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  className="anext-btn-secondary"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={() => {
                    const todayYmd = getTodayYmdInTz(tzName);
                    const [ty, tm] = todayYmd.split("-").map(Number);
                    setViewYear(ty || new Date().getFullYear());
                    setViewMonth((tm || 1) - 1);
                  }}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="anext-btn-secondary"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={() => {
                    const next = new Date(viewYear, viewMonth + 1, 1);
                    setViewYear(next.getFullYear());
                    setViewMonth(next.getMonth());
                  }}
                >
                  Next →
                </button>
                <div
                  data-testid="visualizer-preview-optimise-actions"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginLeft: "auto",
                  }}
                >
                  <button
                    type="button"
                    className="anext-btn-primary"
                    data-testid="visualizer-magic-optimise-btn"
                    disabled={totalScheduled === 0 || optimiseBusy}
                    onClick={() => void runOneClickMagicOptimise()}
                    style={{
                      background: "linear-gradient(135deg, #6d28d9, #2563eb)",
                      borderColor: "#6d28d9",
                      minHeight: 40,
                      padding: "10px 18px",
                      fontSize: 14,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {optimiseBusy ? "Optimising…" : "✨ Magically Optimise"}
                  </button>
                  <button
                    type="button"
                    className="anext-btn-secondary"
                    data-testid="visualizer-optimise-rules-btn"
                    disabled={totalScheduled === 0 || optimiseBusy}
                    onClick={() => void openMagicOptimise()}
                    style={{ minHeight: 40, padding: "8px 12px", fontSize: 12.5 }}
                  >
                    Rules ▸
                  </button>
                </div>
              </div>
            </div>

            <div
              data-testid="visualizer-legend"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                fontSize: 11.5,
                color: "var(--muted)",
                marginBottom: 10,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--line-soft)",
                background: "rgb(var(--tint) / 0.02)",
              }}
            >
              <span data-testid="visualizer-legend-batch" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "#2563eb", display: "inline-block" }} />
                New batch (Visualizer)
              </span>
              <span data-testid="visualizer-legend-confirmed" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ padding: "1px 5px", borderRadius: 999, background: "rgba(79, 70, 229, 0.16)", color: "#4338ca", fontSize: 10, fontWeight: 700 }}>
                  Confirmed preview
                </span>
                Local preview
              </span>
              {showOfficialOverlay && (
                <>
                  <span data-testid="visualizer-legend-draft" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, border: "1.5px dashed #d97706", background: "rgba(217, 119, 6, 0.14)", display: "inline-block" }} />
                    Draft (5 Posts)
                  </span>
                  <span data-testid="visualizer-legend-official" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, border: "1.5px dashed #047857", background: "rgba(16, 185, 129, 0.14)", display: "inline-block" }} />
                    Scheduled (6 Schedule{officialLoading ? " · loading…" : ""})
                  </span>
                </>
              )}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ padding: "1px 5px", borderRadius: 999, background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                  Time clash
                </span>
                Exact-time conflict (&lt;30m)
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ padding: "1px 5px", borderRadius: 999, background: "rgba(217, 119, 6, 0.16)", color: "#b45309", fontSize: 10, fontWeight: 700 }}>
                  2+ posts
                </span>
                Multi-post day
              </span>
            </div>

            <div className={styles.calWeekHeaders}>
              {WEEKDAY_HEADERS.map((h) => (
                <div key={h} className={styles.calWeekHeaderCell}>
                  {h}
                </div>
              ))}
            </div>

            <div className={styles.calMonthGrid} data-testid="visualizer-grid">
              {monthCells.map((ymd) => {
                const inMonth = ymd.startsWith(monthPrefix);
                const dayNum = Number(ymd.slice(8, 10));
                const dayPosts = slotsByDate.get(ymd) ?? [];
                const dayOfficial = officialByDate.get(ymd) ?? [];
                const dayDrafts = draftByDate.get(ymd) ?? [];
                const totalDayCount = dayPosts.length + dayOfficial.length + dayDrafts.length;
                const dayHasTimeClash = dayPosts.some(({ slot }) =>
                  clashReport.clashingSlotIds.has(slot.id),
                );
                const isMultiPostDay = totalDayCount > 1;
                return (
                  <div
                    key={ymd}
                    data-testid={`vis-day-${ymd}`}
                    className={`${styles.calDayCell} ${inMonth ? "" : styles.calDayCellMuted
                      }`}
                  >
                    <div className={styles.calDayTop}>
                      <span>{dayNum}</span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {dayHasTimeClash && (
                          <span
                            data-testid={`vis-time-clash-${ymd}`}
                            style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              padding: "1px 5px",
                              borderRadius: 999,
                              background: "#dc2626",
                              color: "#ffffff",
                            }}
                          >
                            Time clash
                          </span>
                        )}
                        {isMultiPostDay && (
                          <span
                            className={styles.calCollisionBadge}
                            data-testid={`vis-collision-${ymd}`}
                          >
                            {totalDayCount} posts
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={styles.calDayList}>
                      {dayOfficial.map((op) => (
                        <div
                          key={`official-${op.id}`}
                          data-testid="visualizer-official-pill"
                          title={`Already scheduled (${op.channelName}): ${op.title}`}
                          style={{
                            padding: "4px 6px",
                            borderRadius: 6,
                            border: "1px dashed #047857",
                            background: "rgba(16, 185, 129, 0.10)",
                            fontSize: 10.5,
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 700, color: "#047857" }}>
                            <span>{op.time}</span>
                            <span style={{ fontSize: 9.5, textTransform: "uppercase" }}>Scheduled · 6 Schedule</span>
                          </div>
                          <span className={styles.calSlotSnippet} style={{ color: "var(--fg)" }}>
                            {op.title}
                          </span>
                        </div>
                      ))}
                      {dayDrafts.map((dp) => (
                        <div
                          key={`draft-${dp.id}`}
                          data-testid="visualizer-draft-pill"
                          title={`Saved draft in 5 Posts (${dp.channelName}): ${dp.title}`}
                          style={{
                            padding: "4px 6px",
                            borderRadius: 6,
                            border: "1px dashed #d97706",
                            background: "rgba(217, 119, 6, 0.10)",
                            fontSize: 10.5,
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 700, color: "#b45309" }}>
                            <span>{dp.time}</span>
                            <span style={{ fontSize: 9.5, textTransform: "uppercase" }}>Draft · 5 Posts</span>
                          </div>
                          <span className={styles.calSlotSnippet} style={{ color: "var(--fg)" }}>
                            {dp.title}
                          </span>
                        </div>
                      ))}
                      {dayPosts.map(({ batch, slot }) => {
                        const thumb = slot.media
                          ? mediaPathToUrl(slot.media.thumbnail || slot.media.path)
                          : null;
                        const active =
                          selectedSlotRef?.batchId === batch.id &&
                          selectedSlotRef?.slotId === slot.id;
                        const hasClash = clashReport.clashingSlotIds.has(slot.id);
                        const batchChannelIds =
                          batch.channelIds && batch.channelIds.length > 0
                            ? batch.channelIds
                            : channels
                                .filter((c) => c.name === batch.channelName)
                                .map((c) => c.id);
                        const destChannels = batchChannelIds
                          .map((cid) => channels.find((c) => c.id === cid))
                          .filter((c): c is NonNullable<typeof c> => Boolean(c));
                        const primaryDest = destChannels[0];
                        const primaryRole =
                          primaryDest?.identifier === "linkedin"
                            ? "Profile"
                            : primaryDest?.identifier === "linkedin-page"
                              ? "Page"
                              : null;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            data-testid="visualizer-slot-pill"
                            onClick={() => {
                              setSelectedSlotRef({
                                batchId: batch.id,
                                slotId: slot.id,
                              });
                              setSidebarCollapsed(false);
                            }}
                            className={styles.calSlotPill}
                            style={{
                              borderLeft: `3px solid ${hasClash ? "#dc2626" : batch.color}`,
                              outline: active
                                ? `2px solid ${batch.color}`
                                : hasClash
                                ? "1px solid rgba(220, 38, 38, 0.65)"
                                : undefined,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 10,
                                fontWeight: 700,
                                color: batch.color,
                              }}
                            >
                              <span>{slot.time}</span>
                              {slot.locked && <span title="Locked slot">🔒</span>}
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {batch.label}
                              </span>
                              {hasClash && (
                                <span
                                  data-testid="visualizer-slot-clash-badge"
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: "1px 4px",
                                    borderRadius: 999,
                                    background: "#dc2626",
                                    color: "#ffffff",
                                    marginLeft: "auto",
                                  }}
                                >
                                  Clash
                                </span>
                              )}
                              {!hasClash && (slot.reusedCopy || slot.reusedMedia) && (
                                <span style={{ color: "#b45309", marginLeft: "auto" }}>
                                  Repeated
                                </span>
                              )}
                              {isConfirmed && (
                                <span
                                  data-testid="visualizer-slot-confirmed-badge"
                                  style={{
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    padding: "1px 5px",
                                    borderRadius: 999,
                                    background: "rgba(79, 70, 229, 0.16)",
                                    color: "#4338ca",
                                    marginLeft: hasClash || slot.reusedCopy || slot.reusedMedia ? 4 : "auto",
                                  }}
                                >
                                  Confirmed preview
                                </span>
                              )}
                            </div>
                            <div
                              data-testid="visualizer-slot-destination"
                              title={
                                destChannels.length > 0
                                  ? destChannels
                                      .map((d) =>
                                        d.identifier === "linkedin"
                                          ? `${d.name} (Profile)`
                                          : d.identifier === "linkedin-page"
                                            ? `${d.name} (Page)`
                                            : d.name,
                                      )
                                      .join(", ")
                                  : batch.channelName || "No destination"
                              }
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 10,
                                color: primaryDest ? "var(--fg)" : "#dc2626",
                                minWidth: 0,
                              }}
                            >
                              {primaryDest ? (
                                <>
                                  <PlatformIcon platform={primaryDest.platform} size={14} />
                                  <span
                                    style={{
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {primaryDest.name}
                                  </span>
                                  {primaryRole && (
                                    <span
                                      style={{
                                        fontSize: 9,
                                        fontWeight: 700,
                                        padding: "0px 4px",
                                        borderRadius: 999,
                                        background:
                                          primaryRole === "Profile"
                                            ? "rgba(3, 105, 161, 0.14)"
                                            : "rgba(109, 40, 217, 0.14)",
                                        color:
                                          primaryRole === "Profile" ? "#0369a1" : "#6d28d9",
                                        flexShrink: 0,
                                      }}
                                    >
                                      {primaryRole}
                                    </span>
                                  )}
                                  {destChannels.length > 1 && (
                                    <span
                                      style={{
                                        fontSize: 9,
                                        fontWeight: 700,
                                        color: "var(--muted)",
                                        flexShrink: 0,
                                      }}
                                    >
                                      +{destChannels.length - 1}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span style={{ fontWeight: 700 }}>
                                  {batch.channelName || "Missing destination"}
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              {thumb && (
                                <img
                                  src={thumb}
                                  alt=""
                                  style={{
                                    width: 18,
                                    height: 18,
                                    objectFit: "cover",
                                    borderRadius: 3,
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              <span className={styles.calSlotSnippet}>
                                {slot.body}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {optimiseOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" data-testid="visualizer-optimise-modal">
          <div className={styles.modalCard} style={{ maxWidth: 680, maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>✨ Magically Optimise Schedule</h2>
              <button
                type="button"
                className="anext-btn-secondary"
                style={{ padding: "3px 8px", fontSize: 12 }}
                onClick={() => {
                  setOptimiseOpen(false);
                  setOptimiseProposal(null);
                }}
              >
                Close
              </button>
            </div>
            <p style={{ margin: "6px 0 12px", fontSize: 12.5, color: "var(--muted)" }}>
              Finds open gaps around your officially scheduled posts ({officialPosts.length} loaded) and locked slots without modifying live 6 Schedule.
            </p>

            {optimiseError && (
              <div
                role="alert"
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #dc2626",
                  background: "rgba(220, 38, 38, 0.1)",
                  color: "#dc2626",
                  fontSize: 12.5,
                  marginBottom: 10,
                }}
              >
                {optimiseError}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <span>Start date</span>
                <input
                  type="date"
                  className={styles.input}
                  value={optimiseStartDate}
                  onChange={(e) => setOptimiseStartDate(e.target.value)}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <span>End date</span>
                <input
                  type="date"
                  className={styles.input}
                  value={optimiseEndDate}
                  onChange={(e) => setOptimiseEndDate(e.target.value)}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <span>Weekly target (posts/wk)</span>
                <input
                  type="number"
                  min={1}
                  max={28}
                  className={styles.input}
                  data-testid="visualizer-optimise-weekly-target"
                  value={optimiseWeeklyTarget}
                  onChange={(e) => setOptimiseWeeklyTarget(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <span>Window start</span>
                <input
                  type="time"
                  className={styles.input}
                  value={optimiseTimeStart}
                  onChange={(e) => setOptimiseTimeStart(e.target.value)}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <span>Window end</span>
                <input
                  type="time"
                  className={styles.input}
                  value={optimiseTimeEnd}
                  onChange={(e) => setOptimiseTimeEnd(e.target.value)}
                />
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={optimiseVaryTime}
                  onChange={(e) => setOptimiseVaryTime(e.target.checked)}
                />
                Vary posting times within window
              </label>
              <button
                type="button"
                className="anext-btn-secondary"
                data-testid="visualizer-optimise-recalc-btn"
                disabled={optimiseBusy}
                onClick={() => void recalculateOptimisePreview()}
              >
                {optimiseBusy ? "Calculating…" : "Recalculate Preview"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {batches.map((b) => {
                const checked = optimiseBatchIds.includes(b.id);
                return (
                  <label
                    key={b.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: `1px solid ${b.color}`,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setOptimiseBatchIds((prev) =>
                          e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id),
                        )
                      }
                    />
                    {b.label} ({b.slots.length})
                  </label>
                );
              })}
            </div>

            {optimiseProposal?.shortfallSummary && (
              <div
                data-testid="visualizer-optimise-shortfall"
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d97706",
                  background: "rgba(217, 119, 6, 0.12)",
                  color: "#b45309",
                  fontSize: 12.5,
                  marginBottom: 10,
                }}
              >
                {optimiseProposal.shortfallSummary}
              </div>
            )}

            {optimiseProposal && (
              <div
                data-testid="visualizer-optimise-preview-list"
                style={{
                  border: "1px solid var(--line-soft)",
                  borderRadius: 8,
                  maxHeight: 240,
                  overflowY: "auto",
                  padding: "6px 10px",
                  marginBottom: 12,
                  fontSize: 12,
                }}
              >
                {optimiseProposal.changes.map((c) => (
                  <div
                    key={c.slotId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "5px 0",
                      borderBottom: "1px solid var(--line-soft)",
                    }}
                  >
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <strong>{c.batchLabel}</strong>: {c.bodyPreview}
                    </span>
                    <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {c.oldDate} {c.oldTime} →{" "}
                      <strong style={{ color: c.changed ? "var(--accent)" : "var(--fg)" }}>
                        {c.newDate} {c.newTime}
                      </strong>
                      {c.locked ? " (Locked)" : ""}
                      {c.unplacedReason ? " (Unplaced)" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className="anext-btn-secondary"
                data-testid="visualizer-optimise-cancel-btn"
                onClick={() => {
                  setOptimiseOpen(false);
                  setOptimiseProposal(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                data-testid="visualizer-optimise-apply-btn"
                disabled={optimiseBusy || !optimiseProposal}
                onClick={() => void applyOptimiseChanges()}
              >
                {optimiseBusy ? "Checking clashes…" : "Apply changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
