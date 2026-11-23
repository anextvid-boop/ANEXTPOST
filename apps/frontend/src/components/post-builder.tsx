"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./post-builder.module.css";
import { WorkspaceBadge } from "./workspace-badge";
import { useAuth } from "@/lib/auth-context";
import { useChannels } from "@/lib/use-channels";
import { CreatePostModal, type NewPostInput } from "./create-post-modal";
import { PlatformIcon } from "./platform-icon";
import { FORMAT_TAB_THEMES, isFormatForTab } from "@/lib/format-tab-theme";
import { DestinationFilterChips, groupChannelsByPlatform } from "./destination-filter-chips";
import { createPost, fetchCalendarPosts, type BackendPost } from "@/lib/posts";
import {
  fetchMedia,
  fetchMediaCollections,
  mediaPathToUrl,
  uploadMedia,
  type BackendMedia,
  type MediaCollectionSummary,
} from "@/lib/media-api";
import { PostVisualizer } from "./post-visualizer";
import {
  BATCH_COLOR_PALETTE,
  buildMagicPairSuggestions,
  exportBatchesToCsvFile,
  extractStoryId,
  formatDestinationRole,
  generateBatchDrafts,
  generateScheduleDates,
  loadMatchProvenance,
  loadWorkingPlan,
  prioritizeUnusedMedia,
  registerPostProvenance,
  resolvePostProvenance,
  saveWorkingPlan,
  scheduleDraftsIntoSlots,
  toBatchMediaRef,
  type BatchDraftItem,
  type BatchMediaRef,
  type ConfirmedMatchPlan,
  type MagicPairResult,
  type MatchProvenanceStore,
  type VisualizerBatch,
  type VisualizerFrequency,
} from "@/lib/builder-batch";
import {
  assemblePostText,
  BUILTIN_FORMULAS,
  createBuilderCollection,
  createBuilderPostType,
  createBuilderVariations,
  deleteBuilderVariation,
  deleteSampleExamples,
  fetchBuilderState,
  loadSampleExamples,
  renameBuilderCollection,
  renameBuilderPostType,
  SECTION_ROLE_META,
  type BuilderCollection,
  type BuilderLength,
  type BuilderPostType,
  type BuilderSection,
  type BuilderStateResponse,
  type SectionRole,
} from "@/lib/builder-api";

function GroupedDestinationBadges({
  destList,
  batchId,
}: {
  destList: { id: string; name: string; platform: string; identifier?: string }[];
  batchId?: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => groupChannelsByPlatform(destList), [destList]);
  if (destList.length === 0) return null;

  return (
    <>
      {groups.map((group) => {
        const [primary, ...rest] = group.items;
        const isOpen = !!expanded[group.key];
        const renderPill = (ch: (typeof destList)[number], isPrimary: boolean) => {
          const role = formatDestinationRole(ch.identifier);
          return (
            <span
              key={ch.id}
              data-testid={batchId ? `batch-group-dest-${batchId}-${ch.id}` : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 7px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                border: "1px solid var(--line-soft)",
                background: "var(--bg)",
                color: "var(--fg)",
              }}
            >
              <PlatformIcon platform={ch.platform} size={12} />
              <span>{ch.name}</span>
              {role && (
                <span style={{ fontWeight: 700, color: role === "Profile" ? "#0369a1" : "#6d28d9" }}>
                  {role}
                </span>
              )}
              {isPrimary && rest.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((prev) => ({ ...prev, [group.key]: !prev[group.key] }));
                  }}
                  aria-expanded={isOpen}
                  style={{
                    marginLeft: 2,
                    padding: "0 5px",
                    height: 16,
                    borderRadius: 999,
                    border: "1px solid var(--line)",
                    background: isOpen ? "var(--fg)" : "var(--page)",
                    color: isOpen ? "var(--bg)" : "var(--fg)",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {isOpen ? `▴ -${rest.length}` : `▾ +${rest.length}`}
                </button>
              )}
            </span>
          );
        };
        return (
          <Fragment key={group.key}>
            {renderPill(primary, true)}
            {isOpen && rest.map((ch) => renderPill(ch, false))}
          </Fragment>
        );
      })}
    </>
  );
}

type BuilderFormatTab = "social" | "video" | "blogger" | "x";

const BLOGGER_BUILDER_ROLE_LABELS: Record<SectionRole, string> = {
  hook: "1. SEO Headline (Line 1 = Blog Title)",
  context: "2. Story / Pain Intro + Early Link",
  body: "3. Scannable H2 Body + Authority Links",
  proof: "4. Soft Product Placement + Proof",
  takeaway: "5. Lead Magnet Bridge / Takeaway",
  question: "6. Primary CTA + Next-Read Link",
  signoff: "7. Author Bio & Brand Links",
  hashtags: "8. Blog Labels / Topics",
  graphic_note: "Featured Image / Visual Anchor",
};

const X_BUILDER_ROLE_LABELS: Record<SectionRole, string> = {
  hook: "Opening Hook (1 line)",
  context: "Quick Setup",
  body: "Core Take (Short)",
  proof: "1-Line Proof",
  takeaway: "Punchline / Takeaway",
  question: "Reply CTA",
  signoff: "Short Sign-off",
  hashtags: "Tags (0–2)",
  graphic_note: "Media / Alt Note",
};

function getBuilderRoleLabel(
  tab: BuilderFormatTab,
  role: SectionRole,
  fallback: string,
): string {
  if (tab === "blogger") return BLOGGER_BUILDER_ROLE_LABELS[role] ?? fallback;
  if (tab === "x") return X_BUILDER_ROLE_LABELS[role] ?? fallback;
  return fallback;
}

function getBuilderCollectionFormatTab(col: BuilderCollection): BuilderFormatTab {
  const name = col.name || "";
  const desc = col.description || "";
  if (name.startsWith("Blogger:") || desc.includes("[format:blogger]")) {
    return "blogger";
  }
  if (name.startsWith("X:") || desc.includes("[format:x]")) {
    return "x";
  }
  if (
    name.startsWith("Video:") ||
    name.toLowerCase().includes("youtube") ||
    name.toLowerCase().includes("tiktok") ||
    name.toLowerCase().includes("short-form video") ||
    desc.includes("[format:video]")
  ) {
    return "video";
  }
  return "social";
}

export function PostBuilder() {
  const router = useRouter();
  const { user } = useAuth();
  const activeOrgName =
    user?.organizations?.find((o) => o.id === user.orgId)?.name ??
    "this workspace";
  const { channels } = useChannels();
  const [state, setState] = useState<BuilderStateResponse>({
    collections: [],
    postTypes: [],
    formulas: [],
    variations: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [activeFormatTab, setActiveFormatTab] =
    useState<BuilderFormatTab>("social");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [selectedPostTypeId, setSelectedPostTypeId] = useState<string>("");
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>(
    BUILTIN_FORMULAS[0].id,
  );
  const [length, setLength] = useState<BuilderLength>("standard");
  const [sections, setSections] = useState<BuilderSection[]>(() =>
    BUILTIN_FORMULAS[0].sequences.standard.map((s) => ({ ...s, text: "" })),
  );
  const [addRole, setAddRole] = useState<SectionRole>("proof");
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);

  // Dialogs for Collection CRUD, Post Type CRUD, Batch Paste, and Composer
  const [collectionDialog, setCollectionDialog] = useState<{
    mode: "create" | "rename";
    target?: BuilderCollection;
    name: string;
  } | null>(null);
  const [postTypeDialog, setPostTypeDialog] = useState<{
    mode: "create" | "rename";
    target?: BuilderPostType;
    name: string;
  } | null>(null);
  const [pasteDialog, setPasteDialog] = useState<{
    role: SectionRole;
    raw: string;
  } | null>(null);
  const [deleteExamplesOpen, setDeleteExamplesOpen] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<"builder" | "visualizer">("builder");
  const [builderMode, setBuilderMode] = useState<"single" | "batch">("batch");
  const [mediaCollections, setMediaCollections] = useState<MediaCollectionSummary[]>([]);
  const [libraryMedia, setLibraryMedia] = useState<BackendMedia[]>([]);
  const [selectedMediaCollectionId, setSelectedMediaCollectionId] = useState<string>("");
  const [expandedMediaCollectionIds, setExpandedMediaCollectionIds] = useState<Record<string, boolean>>({});
  const [expandedWritingCollectionIds, setExpandedWritingCollectionIds] = useState<Record<string, boolean>>({});
  const [writingBankSearch, setWritingBankSearch] = useState<string>("");
  const [swapDraftId, setSwapDraftId] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState<number>(12);
  const [batchLabel, setBatchLabel] = useState<string>("");
  const [batchColor, setBatchColor] = useState<string>(BATCH_COLOR_PALETTE[0]);
  const [batchFrequency, setBatchFrequency] = useState<VisualizerFrequency>("weekdays");
  const [batchEveryNDays, setBatchEveryNDays] = useState<number>(3);
  const [batchMonthlyDay, setBatchMonthlyDay] = useState<number>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.getDate();
  });
  const [batchStartDate, setBatchStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [batchTime, setBatchTime] = useState<string>("09:00");
  const [batchTimeEnd, setBatchTimeEnd] = useState<string>("10:00");
  const [singleScheduleDate, setSingleScheduleDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [singleScheduleTime, setSingleScheduleTime] = useState<string>("09:00");
  const [batchDrafts, setBatchDrafts] = useState<BatchDraftItem[]>([]);
  const [batchWarnings, setBatchWarnings] = useState<string[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [mediaSwapOpen, setMediaSwapOpen] = useState(false);
  const [visualizerBatches, setVisualizerBatches] = useState<VisualizerBatch[]>([]);
  const [confirmedMatches, setConfirmedMatches] = useState<ConfirmedMatchPlan[]>([]);
  const [planConfirmedAt, setPlanConfirmedAt] = useState<string | null>(null);
  const [planConfirmedHash, setPlanConfirmedHash] = useState<string | null>(null);
  const [trayCollapsed, setTrayCollapsed] = useState(false);
  const [pairingCollapsed, setPairingCollapsed] = useState(false);
  const [postingSettingsOpen, setPostingSettingsOpen] = useState(false);
  const [expandedBatchPreviewIds, setExpandedBatchPreviewIds] = useState<Record<string, boolean>>({});
  const [writingPreviewSeeds, setWritingPreviewSeeds] = useState<Record<string, number>>({});
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<Record<string, boolean>>({});
  const [scheduledPosts, setScheduledPosts] = useState<BackendPost[]>([]);
  const [provenanceStore, setProvenanceStore] = useState<MatchProvenanceStore>({
    byPostId: {},
    byGroup: {},
  });
  const [scheduledMatchesCollapsed, setScheduledMatchesCollapsed] = useState(false);
  const [expandedPassSections, setExpandedPassSections] = useState<Record<string, boolean>>({});
  const [fullPreviewMatchId, setFullPreviewMatchId] = useState<string | null>(null);
  const [pendingTrimConfirm, setPendingTrimConfirm] = useState<{
    pairId: string;
    patch: Partial<ConfirmedMatchPlan>;
    batchLabel: string;
    protectedSlots: Array<{ index: number; id: string; date: string; time: string; body: string; locked?: boolean; manualEdited?: boolean }>;
  } | null>(null);
  const [magicPairModal, setMagicPairModal] = useState<MagicPairResult | null>(null);

  useEffect(() => {
    setProvenanceStore(loadMatchProvenance(user?.orgId));
    const plan = loadWorkingPlan(user?.orgId);
    setConfirmedMatches(plan.matches);
    setVisualizerBatches(plan.batches);
    setPlanConfirmedAt(plan.confirmedAt);
    setPlanConfirmedHash(plan.confirmedHash);
    if (plan.batches.length > 0) {
      const restoredDrafts: BatchDraftItem[] = [];
      let idx = 1;
      for (const b of plan.batches) {
        for (const s of b.slots) {
          restoredDrafts.push({
            id: s.draftId || s.id,
            index: idx++,
            body: s.body,
            media: s.media,
            reusedCopy: Boolean(s.reusedCopy),
            reusedMedia: Boolean(s.reusedMedia),
          });
        }
      }
      setBatchDrafts(restoredDrafts);
      setSelectedDraftId(restoredDrafts[0]?.id ?? null);
    }
  }, [user?.orgId]);

  const persistWorkingPlanState = useCallback(
    (
      nextMatches: ConfirmedMatchPlan[],
      nextBatches: VisualizerBatch[],
      keepConfirmation = false,
    ) => {
      const nextConfirmedAt = keepConfirmation ? planConfirmedAt : null;
      const nextConfirmedHash = keepConfirmation ? planConfirmedHash : null;
      setPlanConfirmedAt(nextConfirmedAt);
      setPlanConfirmedHash(nextConfirmedHash);
      saveWorkingPlan(user?.orgId, {
        matches: nextMatches,
        batches: nextBatches,
        confirmedAt: nextConfirmedAt,
        confirmedHash: nextConfirmedHash,
      });
    },
    [user?.orgId, planConfirmedAt, planConfirmedHash],
  );

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const startIso = new Date(Date.now() - 30 * 86400_000).toISOString();
      const endIso = new Date(Date.now() + 365 * 86400_000).toISOString();
      const [data, mc, mediaPage, calendarRows] = await Promise.all([
        fetchBuilderState(),
        fetchMediaCollections().catch(() => ({ collections: [] })),
        fetchMedia(1, undefined, undefined, 250).catch(() => ({ results: [] })),
        fetchCalendarPosts(startIso, endIso).catch(() => [] as BackendPost[]),
      ]);
      setState(data);
      setMediaCollections(mc.collections ?? []);
      setLibraryMedia(mediaPage.results ?? []);
      setScheduledPosts(calendarRows ?? []);
      setProvenanceStore(loadMatchProvenance(user?.orgId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Post Builder");
    } finally {
      setLoading(false);
    }
  }, [user?.orgId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const applyFormulaAndLength = (
    formulaId: string,
    nextLength: BuilderLength,
    preserveText = true,
  ) => {
    const preset = BUILTIN_FORMULAS.find((f) => f.id === formulaId);
    let template: Omit<BuilderSection, "text">[] = [];
    if (preset) {
      template = preset.sequences[nextLength];
    } else {
      const saved = state.formulas.find((f) => f.id === formulaId);
      if (saved) {
        try {
          template = JSON.parse(saved.sectionsJson) as Omit<
            BuilderSection,
            "text"
          >[];
        } catch {
          template = BUILTIN_FORMULAS[0].sequences[nextLength];
        }
      } else {
        template = BUILTIN_FORMULAS[0].sequences[nextLength];
      }
    }

    setSections((prev) => {
      const textByRole = new Map<string, string>();
      if (preserveText) {
        for (const s of prev) {
          if (s.text?.trim() && !textByRole.has(s.role)) {
            textByRole.set(s.role, s.text);
          }
        }
      }
      return template.map((slot, idx) => ({
        ...slot,
        id: `${slot.id}-${idx}`,
        text: textByRole.get(slot.role) ?? "",
      }));
    });
  };

  const handleFormulaChange = (formulaId: string) => {
    setSelectedFormulaId(formulaId);
    setOpenPickerId(null);
    const saved = state.formulas.find((f) => f.id === formulaId);
    const nextLen = saved ? (saved.length === "short" ? "short" : "standard") : length;
    if (saved) setLength(nextLen);
    applyFormulaAndLength(formulaId, nextLen, true);
  };

  const handleLengthChange = (nextLength: BuilderLength) => {
    if (nextLength === length) return;
    setLength(nextLength);
    setOpenPickerId(null);
    applyFormulaAndLength(selectedFormulaId, nextLength, true);
  };

  const updateSectionText = (id: string, text: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  };

  const toggleSkipSection = (id: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, skipped: !s.skipped } : s)),
    );
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    setSections((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const removeSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const addSection = () => {
    const meta = SECTION_ROLE_META[addRole];
    setSections((prev) => [
      ...prev,
      {
        id: `custom-${addRole}-${Date.now()}`,
        role: addRole,
        label: meta.label,
        optional: true,
        includeInCaption: meta.includeInCaption,
        text: "",
      },
    ]);
  };

  const saveSingleVariation = async (section: BuilderSection) => {
    const content = (section.text ?? "").trim();
    if (!content) return;
    setError(null);
    try {
      await createBuilderVariations([
        {
          sectionRole: section.role,
          title: content.slice(0, 48),
          content,
          collectionId: selectedCollectionId || null,
          postTypeId: selectedPostTypeId || null,
          lengthHint: length,
        },
      ]);
      setNotice(`Saved variation to ${section.label}.`);
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save variation");
    }
  };

  const submitBatchPaste = async () => {
    if (!pasteDialog) return;
    const chunks = pasteDialog.raw
      .split(/\n\s*---+\s*\n|\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (chunks.length === 0) return;
    setDialogBusy(true);
    setError(null);
    try {
      await createBuilderVariations(
        chunks.map((content) => ({
          sectionRole: pasteDialog.role,
          title: content.slice(0, 48),
          content,
          collectionId: selectedCollectionId || null,
          postTypeId: selectedPostTypeId || null,
          lengthHint: length,
        })),
      );
      setPasteDialog(null);
      setNotice(
        `Saved ${chunks.length} variation${chunks.length === 1 ? "" : "s"} to ${SECTION_ROLE_META[pasteDialog.role].label}.`,
      );
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save variations");
    } finally {
      setDialogBusy(false);
    }
  };

  const submitCollectionDialog = async () => {
    if (!collectionDialog || !collectionDialog.name.trim()) return;
    setDialogBusy(true);
    setError(null);
    try {
      if (collectionDialog.mode === "create") {
        const formatTag =
          activeFormatTab === "blogger"
            ? "[format:blogger] Long-format Blogger collection"
            : activeFormatTab === "x"
              ? "[format:x] Short-format X collection"
              : undefined;
        const created = await createBuilderCollection(
          collectionDialog.name.trim(),
          formatTag,
        );
        setSelectedCollectionId(created.id);
      } else if (collectionDialog.target) {
        await renameBuilderCollection(
          collectionDialog.target.id,
          collectionDialog.name.trim(),
        );
      }
      setCollectionDialog(null);
      await loadState();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save collection",
      );
    } finally {
      setDialogBusy(false);
    }
  };

  const submitPostTypeDialog = async () => {
    if (!postTypeDialog || !postTypeDialog.name.trim()) return;
    setDialogBusy(true);
    setError(null);
    try {
      if (postTypeDialog.mode === "create") {
        const created = await createBuilderPostType(postTypeDialog.name.trim());
        setSelectedPostTypeId(created.id);
      } else if (postTypeDialog.target) {
        await renameBuilderPostType(
          postTypeDialog.target.id,
          postTypeDialog.name.trim(),
        );
      }
      setPostTypeDialog(null);
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save post type");
    } finally {
      setDialogBusy(false);
    }
  };

  const assembledText = useMemo(() => assemblePostText(sections), [sections]);

  const selectedCollection = useMemo(
    () => state.collections.find((c) => c.id === selectedCollectionId) ?? null,
    [state.collections, selectedCollectionId],
  );

  const tabCollections = useMemo(
    () =>
      state.collections.filter(
        (c) => getBuilderCollectionFormatTab(c) === activeFormatTab,
      ),
    [state.collections, activeFormatTab],
  );
  const tabCollectionIds = useMemo(
    () => new Set(tabCollections.map((c) => c.id)),
    [tabCollections],
  );
  const tabVariationCount = useMemo(
    () =>
      state.variations.filter(
        (v) => v.collectionId && tabCollectionIds.has(v.collectionId),
      ).length,
    [state.variations, tabCollectionIds],
  );
  const socialCount = useMemo(
    () =>
      state.collections.filter(
        (c) => getBuilderCollectionFormatTab(c) === "social",
      ).length,
    [state.collections],
  );
  const videoCount = useMemo(
    () =>
      state.collections.filter(
        (c) => getBuilderCollectionFormatTab(c) === "video",
      ).length,
    [state.collections],
  );
  const bloggerCount = useMemo(
    () =>
      state.collections.filter(
        (c) => getBuilderCollectionFormatTab(c) === "blogger",
      ).length,
    [state.collections],
  );
  const xCount = useMemo(
    () =>
      state.collections.filter((c) => getBuilderCollectionFormatTab(c) === "x")
        .length,
    [state.collections],
  );

  const handleFormatTabChange = (tab: BuilderFormatTab) => {
    setActiveFormatTab(tab);
    setSelectedCollectionId("");
    const targetIds = new Set(
      state.collections
        .filter((c) => getBuilderCollectionFormatTab(c) === tab)
        .map((c) => c.id),
    );
    const matchedFormula = state.formulas.find(
      (f) => f.collectionId && targetIds.has(f.collectionId),
    );
    if (tab === "blogger") {
      const bloggerFormula = matchedFormula?.id ?? "builtin-blogger-article";
      setSelectedFormulaId(bloggerFormula);
      setLength("standard");
      applyFormulaAndLength(bloggerFormula, "standard", false);
    } else if (tab === "video") {
      const videoFormula = matchedFormula?.id ?? "builtin-video-shorts";
      setSelectedFormulaId(videoFormula);
      setLength("standard");
      applyFormulaAndLength(videoFormula, "standard", false);
    } else if (tab === "x") {
      const xFormula = matchedFormula?.id ?? "builtin-x-single";
      setSelectedFormulaId(xFormula);
      setLength("short");
      applyFormulaAndLength(xFormula, "short", false);
    } else {
      const socialFormula = BUILTIN_FORMULAS[0].id;
      setSelectedFormulaId(socialFormula);
      setLength("standard");
      applyFormulaAndLength(socialFormula, "standard", false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param === "blogger" || param === "x" || param === "video" || param === "social") {
      setActiveFormatTab(param);
      if (param === "blogger") {
        setSelectedFormulaId("builtin-blogger-article");
        setLength("standard");
        applyFormulaAndLength("builtin-blogger-article", "standard", true);
      } else if (param === "video") {
        setSelectedFormulaId("builtin-video-shorts");
        setLength("standard");
        applyFormulaAndLength("builtin-video-shorts", "standard", true);
      } else if (param === "x") {
        setSelectedFormulaId("builtin-x-single");
        setLength("short");
        applyFormulaAndLength("builtin-x-single", "short", true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selectedPostType = useMemo(
    () => state.postTypes.find((p) => p.id === selectedPostTypeId) ?? null,
    [state.postTypes, selectedPostTypeId],
  );

  const variationsForRole = useCallback(
    (role: SectionRole) => {
      return state.variations.filter((v) => v.sectionRole === role);
    },
    [state.variations],
  );

  const sampleCounts = useMemo(() => {
    const collections = state.collections.filter((c) => c.isSampleExample).length;
    const postTypes = state.postTypes.filter((p) => p.isSampleExample).length;
    const formulas = state.formulas.filter((f) => f.isSampleExample).length;
    const variations = state.variations.filter((v) => v.isSampleExample).length;
    return {
      collections,
      postTypes,
      formulas,
      variations,
      total: collections + postTypes + formulas + variations,
    };
  }, [state]);

  const handleLoadExamples = async () => {
    setDialogBusy(true);
    setError(null);
    try {
      const res = await loadSampleExamples();
      await loadState();
      setNotice(
        res.createdCollections + res.createdPostTypes + res.createdFormulas + res.createdVariations === 0
          ? "ANEXTVID starter examples are already loaded in this workspace."
          : `Loaded ${res.createdCollections} collections, ${res.createdPostTypes} post types, ${res.createdFormulas} formulas, and ${res.createdVariations} variations.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load examples");
    } finally {
      setDialogBusy(false);
    }
  };

  const handleDeleteExamples = async () => {
    setDialogBusy(true);
    setError(null);
    try {
      const res = await deleteSampleExamples();
      setDeleteExamplesOpen(false);
      if (selectedCollection?.isSampleExample) setSelectedCollectionId("");
      if (selectedPostType?.isSampleExample) setSelectedPostTypeId("");
      if (state.formulas.some((f) => f.id === selectedFormulaId && f.isSampleExample)) {
        setSelectedFormulaId(BUILTIN_FORMULAS[0].id);
        applyFormulaAndLength(BUILTIN_FORMULAS[0].id, length, true);
      }
      await loadState();
      setNotice(
        `Removed ${res.deletedCollections} collections, ${res.deletedPostTypes} post types, ${res.deletedFormulas} formulas, and ${res.deletedVariations} sample variations from ${activeOrgName}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete examples");
    } finally {
      setDialogBusy(false);
    }
  };

  const submitToComposer = async (
    post: NewPostInput,
    mode: "draft" | "schedule" | "now",
  ) => {
    setError(null);
    try {
      const isoDate =
        post.date && post.time
          ? new Date(`${post.date}T${post.time}:00`).toISOString()
          : new Date().toISOString();

      const uploadedMedia: { id: string; path: string }[] = [];
      for (const m of post.media) {
        if (m.backendId) {
          uploadedMedia.push({ id: m.backendId, path: m.url });
        } else {
          const res = await fetch(m.url);
          if (!res.ok) {
            throw new Error(`Could not load media "${m.name || "attachment"}" (${res.status})`);
          }
          const blob = await res.blob();
          const file = new File([blob], m.name || "attachment.png", {
            type: blob.type || "image/png",
          });
          const uploaded = await uploadMedia(file);
          uploadedMedia.push({ id: uploaded.id ?? uploaded.path, path: uploaded.path });
        }
      }

      const effectiveChannelIds =
        post.channelIds.length > 0
          ? post.channelIds
          : channels[0]
            ? [channels[0].id]
            : [];
      if (effectiveChannelIds.length === 0) {
        throw new Error("Connect at least one channel before saving a draft");
      }

      const created = await createPost({
        type: mode,
        date: isoDate,
        channelIds: effectiveChannelIds,
        body: (post.body ?? "").trim(),
        perChannelBody: post.perChannelBody ?? {},
        threadParts: post.threadParts ?? [],
        firstComment: post.firstComment,
        media: uploadedMedia,
        shortLink: false,
        tags: [],
        perChannelSettings: post.perChannelSettings,
      });
      if (selectedCollectionId || selectedMediaCollectionId) {
        const wCol = state.collections.find((c) => c.id === selectedCollectionId);
        const mCol = mediaCollections.find((mc) => mc.id === selectedMediaCollectionId);
        const label = batchLabel || activeCollectionLabel || "Post Builder";
        const batchId = `builder-${label}-${Date.now()}`;
        registerPostProvenance(
          user?.orgId,
          created.map((c) => ({
            postId: c.postId,
            record: {
              matchId: batchId,
              batchId,
              batchLabel: label,
              writingCollectionId: selectedCollectionId,
              writingCollectionName: wCol?.name ?? "All Writing",
              mediaCollectionId: selectedMediaCollectionId,
              mediaCollectionName: mCol?.name ?? "All Media",
            },
          })),
        );
        setProvenanceStore(loadMatchProvenance(user?.orgId));
      }
      setComposerOpen(false);
      setNotice(
        mode === "draft"
          ? "Saved unpublished draft to Posts."
          : mode === "schedule"
            ? "Scheduled post."
            : "Published post.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save post");
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  const selectedFormulaSections = useMemo(() => {
    const custom = state.formulas.find((f) => f.id === selectedFormulaId);
    if (custom) {
      try {
        const parsed = JSON.parse(custom.sectionsJson) as Array<{
          id?: string;
          role: SectionRole;
          label?: string;
          optional?: boolean;
          includeInCaption?: boolean;
          skipped?: boolean;
        }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((slot, idx) => {
            const meta = SECTION_ROLE_META[slot.role];
            return {
              id: slot.id ?? `${slot.role}-${idx}`,
              role: slot.role,
              label: slot.label ?? meta?.label ?? slot.role,
              optional: slot.optional ?? false,
              includeInCaption: slot.includeInCaption ?? meta?.includeInCaption ?? true,
              skipped: slot.skipped ?? false,
            };
          });
        }
      } catch {
        // fallback below
      }
    }
    const preset =
      BUILTIN_FORMULAS.find((f) => f.id === selectedFormulaId) ??
      BUILTIN_FORMULAS[0];
    return (preset.sequences[length] ?? preset.sequences.standard ?? []).map((slot) => ({
      ...slot,
      label: slot.label ?? SECTION_ROLE_META[slot.role]?.label ?? slot.role,
    }));
  }, [state.formulas, selectedFormulaId, length]);

  const tabPostTypes = useMemo(() => {
    const filtered = state.postTypes.filter((pt) =>
      isFormatForTab(activeFormatTab, pt.name),
    );
    return filtered.length > 0 ? filtered : state.postTypes;
  }, [state.postTypes, activeFormatTab]);

  const tabBuiltinFormulas = useMemo(() => {
    if (activeFormatTab === "blogger") {
      return BUILTIN_FORMULAS.filter((f) => f.id === "builtin-blogger-article");
    }
    if (activeFormatTab === "video") {
      return BUILTIN_FORMULAS.filter((f) => f.id === "builtin-video-shorts");
    }
    if (activeFormatTab === "x") {
      return BUILTIN_FORMULAS.filter((f) => f.id.startsWith("builtin-x-"));
    }
    return BUILTIN_FORMULAS.filter(
      (f) =>
        f.id !== "builtin-blogger-article" &&
        f.id !== "builtin-video-shorts" &&
        !f.id.startsWith("builtin-x-"),
    );
  }, [activeFormatTab]);

  const tabCustomFormulas = useMemo(
    () =>
      state.formulas.filter((f) =>
        isFormatForTab(activeFormatTab, f.name),
      ),
    [state.formulas, activeFormatTab],
  );

  const batchPoolVariations = useMemo(() => {
    return state.variations.filter((v) => {
      if (selectedCollectionId && v.collectionId !== selectedCollectionId) {
        return false;
      }
      if (selectedPostTypeId && v.postTypeId && v.postTypeId !== selectedPostTypeId) {
        return false;
      }
      return true;
    });
  }, [state.variations, selectedCollectionId, selectedPostTypeId]);

  const selectedMediaAssets = useMemo(() => {
    if (!selectedMediaCollectionId) return [];
    return libraryMedia.filter((m) => m.collectionId === selectedMediaCollectionId);
  }, [libraryMedia, selectedMediaCollectionId]);

  const selectedDraft = useMemo(
    () => batchDrafts.find((d) => d.id === selectedDraftId) ?? batchDrafts[0] ?? null,
    [batchDrafts, selectedDraftId],
  );

  const activeCollectionLabel = useMemo(() => {
    if (confirmedMatches.length > 0) {
      return confirmedMatches
        .slice(0, 2)
        .map((m) => `${m.writingName} × ${m.mediaName}`)
        .join(" + ");
    }
    const col = state.collections.find((c) => c.id === selectedCollectionId);
    const mc = mediaCollections.find((m) => m.id === selectedMediaCollectionId);
    if (col && mc) return `${col.name} · ${mc.name}`;
    return col?.name || mc?.name || "Batch";
  }, [confirmedMatches, state.collections, mediaCollections, selectedCollectionId, selectedMediaCollectionId]);

  const inBatchWritingIds = useMemo(
    () => new Set(confirmedMatches.map((m) => m.writingCollectionId)),
    [confirmedMatches],
  );
  const inBatchMediaIds = useMemo(
    () => new Set(confirmedMatches.map((m) => m.mediaCollectionId)),
    [confirmedMatches],
  );
  const writingUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of visualizerBatches) {
      for (const id of b.writingCollectionIds ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    for (const m of confirmedMatches) {
      if (!counts.has(m.writingCollectionId)) {
        counts.set(m.writingCollectionId, 1);
      }
    }
    return counts;
  }, [visualizerBatches, confirmedMatches]);
  const mediaUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of visualizerBatches) {
      for (const id of b.mediaCollectionIds ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    for (const m of confirmedMatches) {
      if (!counts.has(m.mediaCollectionId)) {
        counts.set(m.mediaCollectionId, 1);
      }
    }
    return counts;
  }, [visualizerBatches, confirmedMatches]);
  const usedAssetIdsInBatch = useMemo(
    () =>
      new Set(
        batchDrafts
          .map((d) => d.media?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    [batchDrafts],
  );
  const stagedAssetIds = useMemo(
    () =>
      new Set(
        visualizerBatches.flatMap((b) =>
          b.slots
            .map((s) => s.media?.id)
            .filter((id): id is string => Boolean(id)),
        ),
      ),
    [visualizerBatches],
  );
  const stagedMediaCollectionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of visualizerBatches) {
      for (const mcId of b.mediaCollectionIds ?? []) ids.add(mcId);
    }
    for (const m of libraryMedia) {
      if (m.collectionId && stagedAssetIds.has(m.id)) {
        ids.add(m.collectionId);
      }
    }
    return ids;
  }, [visualizerBatches, libraryMedia, stagedAssetIds]);

  const scheduledQueuePosts = useMemo(
    () =>
      scheduledPosts.filter(
        (p) => p.state === "QUEUE" || p.state === "PUBLISHED",
      ),
    [scheduledPosts],
  );

  const scheduledWritingBatchIds = useMemo(() => {
    const byCollection = new Map<string, Set<string>>();
    for (const p of scheduledQueuePosts) {
      const prov = resolvePostProvenance(provenanceStore, p);
      if (!prov?.writingCollectionId) continue;
      const batchKey = prov.batchId || prov.matchId;
      if (!batchKey) continue;
      const set = byCollection.get(prov.writingCollectionId) ?? new Set<string>();
      set.add(batchKey);
      byCollection.set(prov.writingCollectionId, set);
    }
    return byCollection;
  }, [scheduledQueuePosts, provenanceStore]);

  const scheduledMediaBatchIds = useMemo(() => {
    const byCollection = new Map<string, Set<string>>();
    for (const p of scheduledQueuePosts) {
      const prov = resolvePostProvenance(provenanceStore, p);
      if (!prov?.mediaCollectionId) continue;
      const batchKey = prov.batchId || prov.matchId;
      if (!batchKey) continue;
      const set = byCollection.get(prov.mediaCollectionId) ?? new Set<string>();
      set.add(batchKey);
      byCollection.set(prov.mediaCollectionId, set);
    }
    return byCollection;
  }, [scheduledQueuePosts, provenanceStore]);

  const scheduledMatchGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        batchId: string;
        batchLabel: string;
        writingCollectionId: string;
        writingCollectionName: string;
        mediaCollectionId: string;
        mediaCollectionName: string;
        destinations: Map<string, { id: string; name: string; providerIdentifier: string }>;
        scheduledCount: number;
        earliestDate: string;
        latestDate: string;
      }
    >();
    for (const p of scheduledQueuePosts) {
      const prov = resolvePostProvenance(provenanceStore, p);
      if (!prov) continue;
      const batchKey = prov.batchId || prov.matchId;
      const key = `${batchKey}::${prov.writingCollectionId}::${prov.mediaCollectionId}`;
      const existing = map.get(key) ?? {
        key,
        batchId: batchKey,
        batchLabel: prov.batchLabel || "Scheduled Batch",
        writingCollectionId: prov.writingCollectionId,
        writingCollectionName:
          state.collections.find((c) => c.id === prov.writingCollectionId)?.name ||
          prov.writingCollectionName ||
          "Writing Collection",
        mediaCollectionId: prov.mediaCollectionId,
        mediaCollectionName:
          mediaCollections.find((mc) => mc.id === prov.mediaCollectionId)?.name ||
          prov.mediaCollectionName ||
          "Media Collection",
        destinations: new Map(),
        scheduledCount: 0,
        earliestDate: p.publishDate.slice(0, 10),
        latestDate: p.publishDate.slice(0, 10),
      };
      existing.scheduledCount += 1;
      const ymd = p.publishDate.slice(0, 10);
      if (ymd < existing.earliestDate) existing.earliestDate = ymd;
      if (ymd > existing.latestDate) existing.latestDate = ymd;
      if (p.integration?.id) {
        existing.destinations.set(p.integration.id, {
          id: p.integration.id,
          name: p.integration.name,
          providerIdentifier: p.integration.providerIdentifier,
        });
      }
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [scheduledQueuePosts, provenanceStore, state.collections, mediaCollections]);
  const stagedWritingCollectionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of visualizerBatches) {
      for (const wcId of b.writingCollectionIds ?? []) ids.add(wcId);
    }
    return ids;
  }, [visualizerBatches]);

  const getDefaultChannelsForTab = useCallback(
    (tab: BuilderFormatTab) => {
      if (channels.length === 0) return { channelIds: [] as string[], channelName: "" };
      if (tab === "blogger") {
        const bloggers = channels.filter(
          (ch) =>
            ch.identifier?.toLowerCase() === "blogger" ||
            ch.platform?.toLowerCase() === "blogger",
        );
        const picked = bloggers.length > 0 ? bloggers : [channels[0]];
        return {
          channelIds: picked.map((c) => c.id),
          channelName: picked.map((c) => c.name).join(", "),
        };
      }
      if (tab === "video") {
        const videos = channels.filter((ch) => {
          const id = (ch.identifier ?? ch.platform ?? "").toLowerCase();
          return id === "youtube" || id === "tiktok";
        });
        const picked = videos.length > 0 ? videos : [channels[0]];
        return {
          channelIds: picked.map((c) => c.id),
          channelName: picked.map((c) => c.name).join(", "),
        };
      }
      if (tab === "x") {
        const xs = channels.filter(
          (ch) =>
            ch.identifier?.toLowerCase() === "x" ||
            ch.platform?.toLowerCase() === "x",
        );
        const picked = xs.length > 0 ? xs : [channels[0]];
        return {
          channelIds: picked.map((c) => c.id),
          channelName: picked.map((c) => c.name).join(", "),
        };
      }
      const li = channels.find((ch) =>
        (ch.identifier ?? ch.platform ?? "").toLowerCase().includes("linkedin"),
      );
      const picked = li ?? channels[0];
      return { channelIds: [picked.id], channelName: picked.name };
    },
    [channels],
  );

  const getSectionsForWritingCollection = useCallback(
    (writingColId: string): BuilderSection[] => {
      if (writingColId) {
        const saved = state.formulas.find((f) => f.collectionId === writingColId);
        if (saved) {
          try {
            const parsed = JSON.parse(saved.sectionsJson) as Array<{
              role: SectionRole;
              optional?: boolean;
            }>;
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed.map((slot, idx) => {
                const meta = SECTION_ROLE_META[slot.role];
                return {
                  id: `${slot.role}-${idx}`,
                  role: slot.role,
                  label: meta?.label ?? slot.role,
                  optional: slot.optional ?? false,
                  includeInCaption: meta?.includeInCaption ?? true,
                  skipped: false,
                  text: "",
                };
              });
            }
          } catch {
            // fallback below
          }
        }
      }
      return selectedFormulaSections;
    },
    [state.formulas, selectedFormulaSections],
  );

  const buildSamplePreviewForPair = (
    writingColId: string,
    mediaColId: string,
  ) => {
    const pairVariations = state.variations.filter((v) => {
      if (writingColId && v.collectionId !== writingColId) return false;
      if (selectedPostTypeId && v.postTypeId !== selectedPostTypeId) return false;
      return true;
    });
    const rawMedia = mediaColId
      ? libraryMedia.filter((m) => m.collectionId === mediaColId)
      : [];
    const prioritized = prioritizeUnusedMedia(
      rawMedia,
      new Set([...usedAssetIdsInBatch, ...stagedAssetIds]),
    );
    const { drafts } = generateBatchDrafts({
      sections: getSectionsForWritingCollection(writingColId),
      variations: pairVariations,
      mediaAssets: prioritized,
      count: 1,
    });
    return {
      previewCaption:
        drafts[0]?.body || "Select or add writing blocks to preview caption.",
      previewMedia: drafts[0]?.media ?? null,
    };
  };

  const handleAddMatch = () => {
    const writingCol = state.collections.find((c) => c.id === selectedCollectionId);
    const mediaCol = mediaCollections.find((m) => m.id === selectedMediaCollectionId);
    const { previewCaption, previewMedia } = buildSamplePreviewForPair(
      selectedCollectionId,
      selectedMediaCollectionId,
    );
    const pair: ConfirmedMatchPlan = {
      id: `pair-${crypto.randomUUID().slice(0, 8)}`,
      writingCollectionId: selectedCollectionId,
      writingName: writingCol?.name ?? "All / General",
      mediaCollectionId: selectedMediaCollectionId,
      mediaName: mediaCol?.name ?? "None (text only)",
      mediaCoverPath: mediaCol?.coverPath ?? null,
      previewCaption,
      previewMedia,
      batchCount: Math.max(1, batchCount || 12),
      frequency: batchFrequency,
      everyNDays: Math.max(1, batchEveryNDays || 3),
      monthlyDay: Math.max(1, Math.min(31, batchMonthlyDay || 4)),
      startDate: batchStartDate || new Date().toISOString().slice(0, 10),
      timeStart: batchTime || "09:00",
      timeEnd: batchTimeEnd || batchTime || "10:00",
      color:
        BATCH_COLOR_PALETTE[confirmedMatches.length % BATCH_COLOR_PALETTE.length],
      ...getDefaultChannelsForTab(activeFormatTab),
    };
    const nextMatches = [...confirmedMatches, pair];
    setConfirmedMatches(nextMatches);
    persistWorkingPlanState(nextMatches, visualizerBatches);
    setNotice(`Matched "${pair.writingName}" with "${pair.mediaName}".`);
  };

  const handleMoveMatch = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= confirmedMatches.length) return;
    const copy = [...confirmedMatches];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    setConfirmedMatches(copy);
    persistWorkingPlanState(copy, visualizerBatches);
  };

  const handleRemoveMatch = (pairId: string) => {
    const nextMatches = confirmedMatches.filter((p) => p.id !== pairId);
    const nextBatches = visualizerBatches.filter((b) => b.id !== pairId);
    setConfirmedMatches(nextMatches);
    setVisualizerBatches(nextBatches);
    persistWorkingPlanState(nextMatches, nextBatches);
  };

  const handleUpdateMatch = (
    pairId: string,
    patch: Partial<ConfirmedMatchPlan>,
    forceTrim = false,
  ) => {
    const existingBatch = visualizerBatches.find((b) => b.id === pairId);
    if (
      patch.batchCount !== undefined &&
      existingBatch &&
      patch.batchCount < existingBatch.slots.length &&
      !forceTrim
    ) {
      const targetCount = Math.max(1, patch.batchCount);
      const dropped = existingBatch.slots.slice(targetCount);
      const protectedSlots = dropped
        .map((s, idx) => ({
          index: targetCount + idx + 1,
          id: s.id,
          date: s.date,
          time: s.time,
          body: s.body,
          locked: s.locked,
          manualEdited: s.manualEdited,
        }))
        .filter((s) => s.locked || s.manualEdited);
      if (protectedSlots.length > 0) {
        setPendingTrimConfirm({
          pairId,
          patch,
          batchLabel: existingBatch.label,
          protectedSlots,
        });
        return;
      }
    }

    const nextMatches = confirmedMatches.map((m) =>
      m.id === pairId ? { ...m, ...patch } : m,
    );
    setConfirmedMatches(nextMatches);
    const updatedMatch = nextMatches.find((m) => m.id === pairId);
    let nextBatches = visualizerBatches;

    if (updatedMatch && existingBatch) {
      const targetCount = Math.max(1, updatedMatch.batchCount || 1);
      const keptSlots = existingBatch.slots.slice(0, targetCount);

      let extraDrafts: BatchDraftItem[] = [];
      if (targetCount > keptSlots.length) {
        const pairVariations = state.variations.filter((v) => {
          if (updatedMatch.writingCollectionId && v.collectionId !== updatedMatch.writingCollectionId) {
            return false;
          }
          if (selectedPostTypeId && v.postTypeId !== selectedPostTypeId) return false;
          return true;
        });
        const pairMedia = updatedMatch.mediaCollectionId
          ? libraryMedia.filter((m) => m.collectionId === updatedMatch.mediaCollectionId)
          : [];
        const usedIds = new Set(
          keptSlots.map((s) => s.media?.id).filter((id): id is string => Boolean(id)),
        );
        const prioritizedMedia = prioritizeUnusedMedia(pairMedia, usedIds);
        const generated = generateBatchDrafts({
          sections: getSectionsForWritingCollection(updatedMatch.writingCollectionId),
          variations: pairVariations,
          mediaAssets: prioritizedMedia,
          count: targetCount - keptSlots.length,
        });
        extraDrafts = generated.drafts;
      }

      const combinedDrafts: BatchDraftItem[] = [
        ...keptSlots.map((s, idx) => ({
          id: s.draftId || s.id,
          index: idx + 1,
          body: s.body,
          media: s.media,
          reusedCopy: Boolean(s.reusedCopy),
          reusedMedia: Boolean(s.reusedMedia),
        })),
        ...extraDrafts.map((d, idx) => ({
          ...d,
          id: `${pairId}-extra-${Date.now()}-${idx}`,
          index: keptSlots.length + idx + 1,
        })),
      ];

      const resampledSlots = scheduleDraftsIntoSlots({
        batchId: pairId,
        drafts: combinedDrafts,
        frequency: updatedMatch.frequency,
        everyNDays: updatedMatch.everyNDays,
        monthlyDay: updatedMatch.monthlyDay,
        startDate: updatedMatch.startDate,
        time: updatedMatch.timeStart,
        timeEnd: updatedMatch.timeEnd,
      }).map((slot, idx) => {
        const orig = keptSlots[idx];
        if (!orig) return slot;
        return {
          ...slot,
          id: orig.id,
          draftId: orig.draftId || slot.draftId,
          body: orig.body,
          media: orig.media,
          reusedCopy: orig.reusedCopy,
          reusedMedia: orig.reusedMedia,
          manualEdited: orig.manualEdited,
          locked: orig.locked,
          date: orig.locked ? orig.date : slot.date,
          time: orig.locked ? orig.time : slot.time,
        };
      });

      nextBatches = visualizerBatches.map((b) =>
        b.id === pairId
          ? {
              ...b,
              channelIds: updatedMatch.channelIds ?? b.channelIds,
              channelName: updatedMatch.channelName ?? b.channelName,
              frequency: updatedMatch.frequency,
              everyNDays: updatedMatch.everyNDays,
              monthlyDay: updatedMatch.monthlyDay,
              startDate: updatedMatch.startDate,
              time: updatedMatch.timeStart,
              timeEnd: updatedMatch.timeEnd,
              slots: resampledSlots,
            }
          : b,
      );
      setVisualizerBatches(nextBatches);

      const syncedDrafts: BatchDraftItem[] = [];
      let dIdx = 1;
      for (const b of nextBatches) {
        for (const s of b.slots) {
          syncedDrafts.push({
            id: s.draftId || s.id,
            index: dIdx++,
            body: s.body,
            media: s.media,
            reusedCopy: Boolean(s.reusedCopy),
            reusedMedia: Boolean(s.reusedMedia),
          });
        }
      }
      setBatchDrafts(syncedDrafts);
    }
    persistWorkingPlanState(nextMatches, nextBatches);
  };

  const handleGenerateBatch = async (sendAfter = false) => {
    let allDrafts: BatchDraftItem[] = [];
    const allWarnings: string[] = [];
    const nextBatches: VisualizerBatch[] = [];
    const usedIdsThisRun = new Set<string>(stagedAssetIds);

    if (confirmedMatches.length > 0) {
      for (const pair of confirmedMatches) {
        const pairCount = Math.max(1, pair.batchCount || 1);
        const pairVariations = state.variations.filter((v) => {
          if (pair.writingCollectionId && v.collectionId !== pair.writingCollectionId) {
            return false;
          }
          if (selectedPostTypeId && v.postTypeId !== selectedPostTypeId) return false;
          return true;
        });

        let pairMedia: BackendMedia[] = [];
        if (pair.mediaCollectionId) {
          pairMedia = libraryMedia.filter((m) => m.collectionId === pair.mediaCollectionId);
          if (pairMedia.length === 0) {
            const page = await fetchMedia(1, undefined, pair.mediaCollectionId, 250).catch(
              () => ({ results: [] }),
            );
            pairMedia = page.results ?? [];
          }
        }
        const prioritizedMedia = prioritizeUnusedMedia(pairMedia, usedIdsThisRun);

        const { drafts: subDrafts, warnings } = generateBatchDrafts({
          sections: getSectionsForWritingCollection(pair.writingCollectionId),
          variations: pairVariations,
          mediaAssets: prioritizedMedia,
          count: pairCount,
        });
        for (const d of subDrafts) {
          if (d.media?.id) usedIdsThisRun.add(d.media.id);
        }
        for (const w of warnings) {
          if (!allWarnings.includes(w)) allWarnings.push(w);
        }

        const slots = scheduleDraftsIntoSlots({
          batchId: pair.id,
          drafts: subDrafts,
          frequency: pair.frequency,
          everyNDays: pair.everyNDays,
          monthlyDay: pair.monthlyDay,
          startDate: pair.startDate,
          time: pair.timeStart || "09:00",
          timeEnd: pair.timeEnd || pair.timeStart || "14:00",
        });

        const resolvedChannelIds =
          pair.channelIds && pair.channelIds.length > 0
            ? pair.channelIds
            : channels[0]
              ? [channels[0].id]
              : [];
        const resolvedChannelNames = resolvedChannelIds
          .map((cid) => channels.find((c) => c.id === cid)?.name)
          .filter((n): n is string => Boolean(n));
        const resolvedChannelName =
          resolvedChannelNames.length > 0
            ? resolvedChannelNames.join(", ")
            : pair.channelName || channels[0]?.name || "Your channel name";

        nextBatches.push({
          id: pair.id,
          label: `${pair.writingName} × ${pair.mediaName}`,
          color: pair.color,
          channelName: resolvedChannelName,
          channelIds: resolvedChannelIds,
          frequency: pair.frequency,
          everyNDays: pair.everyNDays,
          monthlyDay: pair.monthlyDay,
          startDate: pair.startDate,
          endDate: "",
          time: pair.timeStart || "09:00",
          timeEnd: pair.timeEnd || pair.timeStart || "14:00",
          slots,
          writingCollectionIds: pair.writingCollectionId ? [pair.writingCollectionId] : [],
          mediaCollectionIds: pair.mediaCollectionId ? [pair.mediaCollectionId] : [],
        });

        allDrafts.push(...subDrafts);
      }

      allDrafts = allDrafts.map((d, idx) => ({
        ...d,
        index: idx + 1,
      }));
    } else {
      let mediaAssets = selectedMediaAssets;
      if (selectedMediaCollectionId && mediaAssets.length === 0) {
        const page = await fetchMedia(1, undefined, selectedMediaCollectionId, 250).catch(
          () => ({ results: [] }),
        );
        mediaAssets = page.results ?? [];
      }
      const prioritizedMedia = prioritizeUnusedMedia(mediaAssets, usedIdsThisRun);
      const { drafts, warnings } = generateBatchDrafts({
        sections: selectedFormulaSections,
        variations: batchPoolVariations,
        mediaAssets: prioritizedMedia,
        count: batchCount,
      });
      allDrafts = drafts;
      allWarnings.push(...warnings);

      const singleBatchId = `vbatch-single-${activeFormatTab}`;
      const tabDefaults = getDefaultChannelsForTab(activeFormatTab);
      const startDate = batchStartDate || new Date().toISOString().slice(0, 10);
      nextBatches.push({
        id: singleBatchId,
        label: batchLabel.trim() || activeCollectionLabel,
        color: batchColor || BATCH_COLOR_PALETTE[0],
        channelName: tabDefaults.channelName || channels[0]?.name || "Your channel name",
        channelIds: tabDefaults.channelIds,
        frequency: batchFrequency,
        everyNDays: batchEveryNDays,
        monthlyDay: batchMonthlyDay,
        startDate,
        endDate: "",
        time: batchTime || "09:00",
        timeEnd: batchTimeEnd || batchTime || "10:00",
        slots: scheduleDraftsIntoSlots({
          batchId: singleBatchId,
          drafts,
          frequency: batchFrequency,
          everyNDays: batchEveryNDays,
          monthlyDay: batchMonthlyDay,
          startDate,
          time: batchTime || "09:00",
          timeEnd: batchTimeEnd || batchTime || "10:00",
        }),
        writingCollectionIds: selectedCollectionId ? [selectedCollectionId] : [],
        mediaCollectionIds: selectedMediaCollectionId ? [selectedMediaCollectionId] : [],
      });
    }

    const replacedIds = new Set(nextBatches.map((b) => b.id));
    const mergedBatches = [
      ...visualizerBatches.filter((b) => !replacedIds.has(b.id)),
      ...nextBatches,
    ];

    setBatchDrafts(allDrafts);
    setBatchWarnings(allWarnings);
    setSelectedDraftId(allDrafts[0]?.id ?? null);
    setMediaSwapOpen(false);
    setVisualizerBatches(mergedBatches);
    persistWorkingPlanState(confirmedMatches, mergedBatches);
    setNotice(
      `Staged ${allDrafts.length} draft posts (${mergedBatches.reduce((sum, b) => sum + b.slots.length, 0)} total in 4 Post Visualizer).`,
    );
    if (sendAfter && allDrafts.length > 0) {
      router.push("/visualizer");
    }
  };

  const handleSendSingleToVisualizer = () => {
    const body = assembledText.trim();
    if (!body) return;
    const singlePostBatchId = `vbatch-single-post-${activeFormatTab}`;
    const tabDefaults = getDefaultChannelsForTab(activeFormatTab);
    const targetDate = singleScheduleDate || todayStr;
    const targetTime = singleScheduleTime || "09:00";
    const existingBatch = visualizerBatches.find((b) => b.id === singlePostBatchId);
    const newSlot = {
      id: `${singlePostBatchId}-slot-${Date.now()}`,
      batchId: singlePostBatchId,
      draftId: `single-${Date.now()}`,
      index: (existingBatch?.slots.length ?? 0) + 1,
      date: targetDate,
      time: targetTime,
      body,
      media: null,
      reusedCopy: false,
      reusedMedia: false,
      manualEdited: true,
      locked: true,
    };
    const updatedBatch: VisualizerBatch = existingBatch
      ? {
          ...existingBatch,
          channelIds:
            existingBatch.channelIds?.length ? existingBatch.channelIds : tabDefaults.channelIds,
          channelName:
            existingBatch.channelName || tabDefaults.channelName || channels[0]?.name || "Your channel name",
          slots: [...existingBatch.slots, newSlot],
        }
      : {
          id: singlePostBatchId,
          label: `${FORMAT_TAB_THEMES[activeFormatTab].label} · Single`,
          color:
            activeFormatTab === "blogger"
              ? "#f97316"
              : activeFormatTab === "x"
                ? "#06b6d4"
                : BATCH_COLOR_PALETTE[0],
          channelName: tabDefaults.channelName || channels[0]?.name || "Your channel name",
          channelIds: tabDefaults.channelIds,
          frequency: batchFrequency,
          everyNDays: 1,
          monthlyDay: 1,
          startDate: targetDate,
          endDate: "",
          time: targetTime,
          timeEnd: targetTime,
          slots: [newSlot],
          writingCollectionIds: selectedCollectionId ? [selectedCollectionId] : [],
          mediaCollectionIds: [],
        };

    const mergedBatches = [
      ...visualizerBatches.filter((b) => b.id !== singlePostBatchId),
      updatedBatch,
    ];
    setVisualizerBatches(mergedBatches);
    persistWorkingPlanState(confirmedMatches, mergedBatches, true);
    router.push("/visualizer");
  };

  const syncBatchDraftUpdate = (
    draftId: string,
    patch: { body?: string; media?: BatchMediaRef | null },
  ) => {
    setBatchDrafts((prev) =>
      prev.map((item) => (item.id === draftId ? { ...item, ...patch } : item)),
    );
    if (visualizerBatches.length > 0) {
      const nextBatches = visualizerBatches.map((batch) => ({
        ...batch,
        slots: batch.slots.map((slot) =>
          slot.draftId === draftId || slot.id === draftId
            ? {
                ...slot,
                ...(patch.body !== undefined
                  ? { body: patch.body, manualEdited: true }
                  : {}),
                ...(patch.media !== undefined ? { media: patch.media } : {}),
              }
            : slot,
        ),
      }));
      setVisualizerBatches(nextBatches);
      persistWorkingPlanState(confirmedMatches, nextBatches);
    }
  };

  const syncBatchDraftRemove = (draftId: string) => {
    setBatchDrafts((prev) => prev.filter((item) => item.id !== draftId));
    if (visualizerBatches.length > 0) {
      const nextBatches = visualizerBatches
        .map((batch) => ({
          ...batch,
          slots: batch.slots.filter(
            (slot) => slot.draftId !== draftId && slot.id !== draftId,
          ),
        }))
        .filter((batch) => batch.slots.length > 0);
      setVisualizerBatches(nextBatches);
      persistWorkingPlanState(confirmedMatches, nextBatches);
    }
  };

  const handleUpdateBatchDraftSchedule = (
    draftId: string,
    patch: { date?: string; time?: string },
  ) => {
    const nextBatches = visualizerBatches.map((batch) => ({
      ...batch,
      slots: batch.slots.map((slot) =>
        slot.draftId === draftId || slot.id === draftId
          ? {
              ...slot,
              ...(patch.date !== undefined ? { date: patch.date } : {}),
              ...(patch.time !== undefined ? { time: patch.time } : {}),
              locked: true,
            }
          : slot,
      ),
    }));
    setVisualizerBatches(nextBatches);
    persistWorkingPlanState(confirmedMatches, nextBatches);
  };

  const addDraftsToVisualizer = (_draftsToAdd: BatchDraftItem[], _label: string) => {
    if (visualizerBatches.length > 0) {
      persistWorkingPlanState(confirmedMatches, visualizerBatches, true);
      router.push("/visualizer");
      return;
    }
    void handleGenerateBatch(true);
  };

  const handleExportBatchCsv = () => {
    if (batchDrafts.length === 0 && visualizerBatches.length === 0) return;
    const csvBatches =
      visualizerBatches.length > 0
        ? visualizerBatches.map((b) => ({
            channelName: b.channelName || channels[0]?.name || "Your channel name",
            channelIds: b.channelIds,
            label: b.label,
            color: b.color,
            items: b.slots.map((s) => ({
              body: s.body,
              media: s.media,
              date: s.date,
              time: s.time,
            })),
          }))
        : [
            {
              channelName: channels[0]?.name || "Your channel name",
              channelIds: channels[0] ? [channels[0].id] : [],
              label: activeCollectionLabel,
              color: BATCH_COLOR_PALETTE[0],
              items: batchDrafts.map((d) => ({
                body: d.body,
                media: d.media,
              })),
            },
          ];
    const totalCount = csvBatches.reduce((sum, b) => sum + b.items.length, 0);
    exportBatchesToCsvFile(
      `anextpost-batch-${new Date().toISOString().slice(0, 10)}.csv`,
      csvBatches,
    );
    setNotice(
      `Exported ${totalCount} posts to CSV. Import via Posts → Import Posts when ready.`,
    );
  };

  const toggleExpandMediaCollection = async (mcId: string) => {
    const nextOpen = !expandedMediaCollectionIds[mcId];
    setExpandedMediaCollectionIds((prev) => ({ ...prev, [mcId]: nextOpen }));
    if (nextOpen && !libraryMedia.some((m) => m.collectionId === mcId)) {
      const page = await fetchMedia(1, undefined, mcId, 24).catch(() => ({ results: [] }));
      if (page.results?.length) {
        setLibraryMedia((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...page.results.filter((x) => !seen.has(x.id))];
        });
      }
    }
  };

  const activeFormatTheme = FORMAT_TAB_THEMES[activeFormatTab];

  return (
    <section
      className={styles.root}
      data-testid={`builder-workspace-${activeFormatTab}`}
      style={{
        background: activeFormatTheme.backgroundWash,
        border: `1px solid ${activeFormatTheme.borderColor}`,
        borderRadius: 16,
        padding: 18,
        transition: "background 0.2s ease, border-color 0.2s ease",
      }}
    >
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className={styles.eyebrow}>3 Post Builder</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                background: activeFormatTheme.badgeBackground,
                color: activeFormatTheme.badgeText,
                border: `1px solid ${activeFormatTheme.borderColor}`,
              }}
            >
              {activeFormatTheme.label}
            </span>
            <WorkspaceBadge compact />
          </div>
          <h1 className={styles.h1}>Visual batch &amp; pairing workspace</h1>
          <p className={styles.subtitle}>
            Pick a formula, switch Short or Standard sequences, mix saved variations with your own copy, and open as an unpublished draft.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {sampleCounts.total === 0 ? (
            <button
              type="button"
              data-testid="builder-load-examples-btn"
              className="anext-btn-secondary"
              disabled={dialogBusy}
              onClick={() => void handleLoadExamples()}
            >
              Load starter examples
            </button>
          ) : (
            <button
              type="button"
              data-testid="builder-delete-examples-btn"
              className="anext-btn-secondary"
              style={{ color: "var(--danger-bright, var(--danger))" }}
              disabled={dialogBusy}
              onClick={() => setDeleteExamplesOpen(true)}
            >
              Delete all imported examples ({sampleCounts.variations})
            </button>
          )}
          <button
            type="button"
            className="anext-btn-primary"
            data-testid="builder-header-send-visualizer-btn"
            onClick={() => {
              if (visualizerBatches.length > 0) {
                persistWorkingPlanState(confirmedMatches, visualizerBatches, true);
                router.push("/visualizer");
              } else if (builderMode === "single" && assembledText.trim()) {
                handleSendSingleToVisualizer();
              } else {
                void handleGenerateBatch(true);
              }
            }}
          >
            Send to 4 Post Visualizer
            {visualizerBatches.length > 0
              ? ` (${visualizerBatches.reduce((sum, b) => sum + b.slots.length, 0)})`
              : ""}{" "}
            →
          </button>
          <button
            type="button"
            className={`anext-btn-secondary ${styles.jumpPreviewBtn}`}
            onClick={() => previewRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            Jump to Preview
          </button>
        </div>
      </header>

      {/* Format Tabs: LinkedIn/FB/IG (Feed) · Blogger (Long Format) · X (Short Format) */}
      <div
        role="tablist"
        aria-label="Builder format"
        data-testid="builder-format-tabs"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeFormatTab === "social"}
            data-testid="builder-tab-social"
            onClick={() => handleFormatTabChange("social")}
            className={
              activeFormatTab === "social"
                ? "anext-btn-primary"
                : "anext-btn-secondary"
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              fontSize: 13,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <PlatformIcon platform="LinkedIn" size={16} />
              <PlatformIcon platform="Facebook" size={14} />
              <PlatformIcon platform="Instagram" size={14} />
            </span>
            <span>Feed · LI · FB · IG · GMB</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>({socialCount})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFormatTab === "video"}
            data-testid="builder-tab-video"
            onClick={() => handleFormatTabChange("video")}
            className={
              activeFormatTab === "video"
                ? "anext-btn-primary"
                : "anext-btn-secondary"
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              fontSize: 13,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <PlatformIcon platform="YouTube" size={16} />
              <PlatformIcon platform="TikTok" size={14} />
            </span>
            <span>Video · YT · TikTok · Shorts</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>({videoCount})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFormatTab === "blogger"}
            data-testid="builder-tab-blogger"
            onClick={() => handleFormatTabChange("blogger")}
            className={
              activeFormatTab === "blogger"
                ? "anext-btn-primary"
                : "anext-btn-secondary"
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              fontSize: 13,
            }}
          >
            <PlatformIcon platform="Blogger" size={16} />
            <span>Blogger · Long Format</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>({bloggerCount})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFormatTab === "x"}
            data-testid="builder-tab-x"
            onClick={() => handleFormatTabChange("x")}
            className={
              activeFormatTab === "x"
                ? "anext-btn-primary"
                : "anext-btn-secondary"
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              fontSize: 13,
            }}
          >
            <PlatformIcon platform="X" size={15} />
            <span>X · Short Format</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>({xCount})</span>
          </button>
        </div>

        {activeFormatTab === "blogger" && (
          <div
            data-testid="builder-blogger-blueprint"
            style={{
              border: "1px solid rgba(249, 115, 22, 0.35)",
              borderLeft: "4px solid #f97316",
              borderRadius: 10,
              padding: "10px 14px",
              background: "rgba(249, 115, 22, 0.06)",
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <strong>Blogger Long-Format Mode:</strong> Developing structured articles (Headline → Intro → H2 Body → Example → Takeaway → Reader CTA → Labels). Select a Blogger bank below to build &amp; pair with media.
            </div>
          </div>
        )}

        {activeFormatTab === "x" && (
          <div
            data-testid="builder-x-blueprint"
            style={{
              border: "1px solid rgba(100, 116, 139, 0.35)",
              borderLeft: "4px solid #0f172a",
              borderRadius: 10,
              padding: "10px 14px",
              background: "rgba(15, 23, 42, 0.05)",
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <strong>X Short-Format Mode (280 chars):</strong> Developing tight 1-liners, punchy takes, and thread openers (Hook → Core Take → 1-Line CTA). Select an X bank below to build &amp; pair.
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          style={{
            padding: "9px 14px",
            borderRadius: 10,
            border: "1px solid var(--line-soft)",
            background: "rgb(var(--tint) / 0.04)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span>{notice}</span>
          <button
            type="button"
            className="anext-btn-secondary"
            style={{ padding: "2px 8px", fontSize: 11.5 }}
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {activeTab === "builder" && (
          <div className={styles.segmented} role="tablist" aria-label="Builder mode">
            <button
              type="button"
              role="tab"
              data-testid="mode-single-btn"
              aria-selected={builderMode === "single"}
              className={
                styles.segment +
                (builderMode === "single" ? " " + styles.segmentActive : "")
              }
              onClick={() => setBuilderMode("single")}
            >
              Single
            </button>
            <button
              type="button"
              role="tab"
              data-testid="mode-batch-btn"
              aria-selected={builderMode === "batch"}
              className={
                styles.segment +
                (builderMode === "batch" ? " " + styles.segmentActive : "")
              }
              onClick={() => setBuilderMode("batch")}
            >
              Batch
            </button>
          </div>
        )}
      </div>

      {activeTab === "visualizer" ? (
        <PostVisualizer
          batches={visualizerBatches}
          onChangeBatches={setVisualizerBatches}
          channels={channels.map((c) => ({
            id: c.id,
            name: c.name,
            platform: c.platform,
            identifier: c.identifier,
          }))}
          pendingBatchDrafts={batchDrafts}
          pendingBatchLabel={activeCollectionLabel}
          onAddPendingBatch={() =>
            addDraftsToVisualizer(batchDrafts, activeCollectionLabel)
          }
          onBackToBuilder={() => {
            setActiveTab("builder");
            setBuilderMode("batch");
          }}
        />
      ) : (
        <>
          <div
            className={styles.toolbar}
            data-testid="builder-scheduled-matches"
            style={{
              flexDirection: "column",
              alignItems: "stretch",
              gap: 10,
              borderColor: "rgba(4, 120, 87, 0.35)",
              background: "rgba(4, 120, 87, 0.05)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>
                  Scheduled Matches
                </span>
                <span
                  data-testid="scheduled-matches-count-badge"
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: "#047857",
                    color: "#ffffff",
                  }}
                >
                  {scheduledMatchGroups.length}{" "}
                  {scheduledMatchGroups.length === 1 ? "match" : "matches"}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  Live posts from 6 Schedule linked by saved match provenance.
                </span>
              </div>
              <button
                type="button"
                className={styles.smallBtn}
                data-testid="builder-scheduled-matches-toggle"
                aria-expanded={!scheduledMatchesCollapsed}
                onClick={() => setScheduledMatchesCollapsed((prev) => !prev)}
              >
                {scheduledMatchesCollapsed ? "Expand ▸" : "Collapse ▾"}
              </button>
            </div>
            {!scheduledMatchesCollapsed &&
              (scheduledMatchGroups.length === 0 ? (
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--muted)",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px dashed var(--line-soft)",
                  }}
                >
                  No officially scheduled matches found in 6 Schedule yet.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                  }}
                  data-testid="scheduled-matches-grid"
                >
                  {scheduledMatchGroups.map((sm) => {
                    const destList = Array.from(sm.destinations.values());
                    return (
                      <div
                        key={sm.key}
                        data-testid={`scheduled-match-card-${sm.batchId}`}
                        style={{
                          padding: "7px 11px",
                          borderRadius: 9,
                          border: "1px solid rgba(4, 120, 87, 0.35)",
                          background: "var(--bg)",
                          display: "inline-flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <strong style={{ fontSize: 12, color: "var(--fg)" }}>
                          {sm.batchLabel}
                        </strong>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 999,
                            background: "rgba(4, 120, 87, 0.14)",
                            color: "#047857",
                          }}
                        >
                          {sm.scheduledCount} scheduled
                        </span>
                        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                          {sm.writingCollectionName} ↔ {sm.mediaCollectionName}
                        </span>
                        <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                          {destList.map((d) => {
                            const role = formatDestinationRole(d.providerIdentifier);
                            const platformName =
                              d.providerIdentifier === "linkedin"
                                ? "LinkedIn"
                                : d.providerIdentifier === "linkedin-page"
                                  ? "LinkedInPage"
                                  : d.providerIdentifier.charAt(0).toUpperCase() +
                                    d.providerIdentifier.slice(1);
                            return (
                              <span
                                key={d.id}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontSize: 11,
                                  padding: "2px 7px",
                                  borderRadius: 999,
                                  border: "1px solid var(--line-soft)",
                                  background: "var(--bg-muted, rgba(148,163,184,0.12))",
                                  color: "var(--fg)",
                                }}
                              >
                                <PlatformIcon platform={platformName} size={12} />
                                <span>{d.name}</span>
                                {role && (
                                  <span style={{ fontWeight: 700, color: "#0369a1" }}>
                                    {role}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>
                          {sm.earliestDate === sm.latestDate
                            ? sm.earliestDate
                            : `${sm.earliestDate} – ${sm.latestDate}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>

          <div
            className={styles.toolbar}
            data-testid="builder-confirmed-matches-tray"
            style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>
                  Confirmed Matches
                </span>
                <span
                  data-testid="confirmed-matches-count-badge"
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: "var(--accent)",
                    color: "#ffffff",
                  }}
                >
                  {confirmedMatches.length} {confirmedMatches.length === 1 ? "pair" : "pairs"}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  Select a Writing collection (left) and Media collection (right), then click Match.
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {visualizerBatches.length > 0 && (
                  <button
                    type="button"
                    className="anext-btn-primary"
                    data-testid="builder-open-visualizer-btn"
                    style={{ padding: "5px 12px", fontSize: 12 }}
                    onClick={() => router.push("/visualizer")}
                  >
                    Open Post Visualizer ({visualizerBatches.reduce((a, b) => a + b.slots.length, 0)}) →
                  </button>
                )}
                <button
                  type="button"
                  className={styles.smallBtn}
                  data-testid="builder-confirmed-matches-toggle"
                  aria-expanded={!trayCollapsed}
                  onClick={() => setTrayCollapsed((prev) => !prev)}
                >
                  {trayCollapsed ? "Expand tray ▸" : "Collapse tray ▾"}
                </button>
              </div>
            </div>
            {!trayCollapsed && (confirmedMatches.length === 0 ? (
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--muted)",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px dashed var(--line-soft)",
                }}
              >
                No confirmed pairs yet — click <strong>Match ↔</strong> between Writing and Media below (or generate directly from your current selection).
              </div>
            ) : (
              <div className={styles.confirmedMatchesGrid} data-testid="confirmed-matches-grid">
                {confirmedMatches.map((pair, idx) => {
                  const thumb = pair.mediaCoverPath ? mediaPathToUrl(pair.mediaCoverPath) : null;
                  const previewImg = (pair.previewMedia?.thumbnail || pair.previewMedia?.path)
                    ? mediaPathToUrl(pair.previewMedia?.thumbnail || pair.previewMedia?.path)
                    : thumb;
                  return (
                    <div
                      key={pair.id}
                      data-testid="confirmed-match-pair"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        borderTop: "1px solid var(--line-soft)",
                        borderRight: "1px solid var(--line-soft)",
                        borderBottom: "1px solid var(--line-soft)",
                        borderLeft: `4px solid ${pair.color}`,
                        background: "var(--bg)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
                            #{idx + 1}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
                            {pair.writingName}
                          </span>
                          <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>↔</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
                            {pair.mediaName}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            className="anext-btn-secondary"
                            data-testid={`match-pair-full-preview-btn-${idx}`}
                            style={{ padding: "3px 9px", fontSize: 11.5 }}
                            onClick={() => setFullPreviewMatchId(pair.id)}
                          >
                            Full post
                          </button>
                          <button
                            type="button"
                            className="anext-btn-secondary"
                            data-testid={`match-pair-up-${idx}`}
                            aria-label={`Move pair ${idx + 1} up`}
                            disabled={idx === 0}
                            style={{ padding: "3px 8px", fontSize: 12 }}
                            onClick={() => handleMoveMatch(idx, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="anext-btn-secondary"
                            data-testid={`match-pair-down-${idx}`}
                            aria-label={`Move pair ${idx + 1} down`}
                            disabled={idx === confirmedMatches.length - 1}
                            style={{ padding: "3px 8px", fontSize: 12 }}
                            onClick={() => handleMoveMatch(idx, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="anext-btn-secondary"
                            data-testid={`match-pair-remove-${idx}`}
                            aria-label={`Remove pair ${idx + 1}`}
                            style={{ padding: "3px 9px", fontSize: 12 }}
                            onClick={() => handleRemoveMatch(pair.id)}
                          >
                            Remove ×
                          </button>
                        </div>
                      </div>

                      <div
                        data-testid="match-pair-preview"
                        role="button"
                        tabIndex={0}
                        onClick={() => setFullPreviewMatchId(pair.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFullPreviewMatchId(pair.id);
                          }
                        }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid var(--line-soft)",
                          background: "rgb(var(--tint) / 0.025)",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--fg)",
                            lineHeight: 1.4,
                            whiteSpace: "pre-wrap",
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {pair.previewCaption}
                        </div>
                        {previewImg && (
                          <img
                            src={previewImg}
                            alt={pair.mediaName}
                            style={{
                              width: "100%",
                              height: 110,
                              objectFit: "cover",
                              borderRadius: 8,
                              border: "1px solid var(--line-soft)",
                              background: "rgb(var(--tint) / 0.03)",
                            }}
                          />
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="anext-btn-secondary"
                            data-testid={`match-pair-open-full-${idx}`}
                            style={{ padding: "3px 10px", fontSize: 11.5, fontWeight: 600 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFullPreviewMatchId(pair.id);
                            }}
                          >
                            Open Full Post ⤢
                          </button>
                        </div>
                      </div>

                      {channels.length > 0 && (
                        <div
                          data-testid={`match-pair-destinations-${idx}`}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>
                            Destinations:
                          </span>
                          <DestinationFilterChips
                            channels={channels.map((ch) => ({
                              id: ch.id,
                              name: ch.name,
                              platform: ch.platform,
                              identifier: ch.identifier ?? ch.platform.toLowerCase(),
                            }))}
                            selectedChannelIds={
                              pair.channelIds && pair.channelIds.length > 0
                                ? pair.channelIds
                                : channels[0]
                                  ? [channels[0].id]
                                  : []
                            }
                            onChange={(nextIds) => {
                              if (nextIds.length === 0) return;
                              const nextNames = nextIds
                                .map((id) => channels.find((c) => c.id === id)?.name)
                                .filter((n): n is string => Boolean(n))
                                .join(", ");
                              handleUpdateMatch(pair.id, {
                                channelIds: nextIds,
                                channelName: nextNames,
                              });
                            }}
                            showAllOption={false}
                            allowEmpty={false}
                            variant="inline"
                            testIdPrefix={`match-pair-dest-${idx}`}
                            chipTestId={(ch) => `match-pair-dest-chip-${idx}-${ch.id}`}
                          />
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-end",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--muted)" }}>
                          Count
                          <input
                            type="number"
                            min={1}
                            max={60}
                            data-testid={`match-pair-count-${idx}`}
                            className={styles.select}
                            style={{ width: 66, padding: "4px 6px", fontSize: 12 }}
                            value={pair.batchCount}
                            onChange={(e) =>
                              handleUpdateMatch(pair.id, {
                                batchCount: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--muted)" }}>
                          Frequency
                          <select
                            data-testid={`match-pair-freq-${idx}`}
                            className={styles.select}
                            style={{ padding: "4px 6px", fontSize: 12 }}
                            value={pair.frequency}
                            onChange={(e) =>
                              handleUpdateMatch(pair.id, {
                                frequency: e.target.value as VisualizerFrequency,
                              })
                            }
                          >
                            <option value="weekdays">Weekdays</option>
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Biweekly</option>
                            <option value="every_n_days">Every N days</option>
                            <option value="monthly_day">1 per month</option>
                            <option value="twice_monthly">2 per month</option>
                          </select>
                        </label>
                        {pair.frequency === "every_n_days" && (
                          <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--muted)" }}>
                            Every N days
                            <input
                              type="number"
                              min={1}
                              max={90}
                              data-testid={`match-pair-every-${idx}`}
                              className={styles.select}
                              style={{ width: 66, padding: "4px 6px", fontSize: 12 }}
                              value={pair.everyNDays}
                              onChange={(e) =>
                                handleUpdateMatch(pair.id, {
                                  everyNDays: Math.max(1, Number(e.target.value) || 1),
                                })
                              }
                            />
                          </label>
                        )}
                        {(pair.frequency === "monthly_day" || pair.frequency === "twice_monthly") && (
                          <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--muted)" }}>
                            Day of month
                            <input
                              type="number"
                              min={1}
                              max={31}
                              data-testid={`match-pair-monthly-day-${idx}`}
                              className={styles.select}
                              style={{ width: 66, padding: "4px 6px", fontSize: 12 }}
                              value={pair.monthlyDay}
                              onChange={(e) =>
                                handleUpdateMatch(pair.id, {
                                  monthlyDay: Math.max(1, Math.min(31, Number(e.target.value) || 1)),
                                })
                              }
                            />
                          </label>
                        )}
                        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--muted)" }}>
                          Start date
                          <input
                            type="date"
                            data-testid={`match-pair-start-${idx}`}
                            className={styles.select}
                            style={{ padding: "4px 6px", fontSize: 12 }}
                            value={pair.startDate}
                            onChange={(e) => {
                              const nextStart = e.target.value;
                              const dayFromStart = Number(nextStart.slice(8, 10));
                              handleUpdateMatch(pair.id, {
                                startDate: nextStart,
                                ...(Number.isFinite(dayFromStart) && dayFromStart >= 1 && dayFromStart <= 31
                                  ? { monthlyDay: dayFromStart }
                                  : {}),
                              });
                            }}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--muted)" }}>
                          Window start
                          <input
                            type="time"
                            data-testid={`match-pair-timestart-${idx}`}
                            className={styles.select}
                            style={{ padding: "4px 6px", fontSize: 12 }}
                            value={pair.timeStart}
                            onChange={(e) =>
                              handleUpdateMatch(pair.id, { timeStart: e.target.value })
                            }
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--muted)" }}>
                          Window end
                          <input
                            type="time"
                            data-testid={`match-pair-timeend-${idx}`}
                            className={styles.select}
                            style={{ padding: "4px 6px", fontSize: 12 }}
                            value={pair.timeEnd}
                            onChange={(e) =>
                              handleUpdateMatch(pair.id, { timeEnd: e.target.value })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div
            className={styles.toolbar}
            style={{ justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className={styles.fieldLabel}>
                Writing ↔ Media Pairing
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {state.collections.length} writing · {mediaCollections.length} media
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {visualizerBatches.length > 0 && (
                <button
                  type="button"
                  className={styles.smallBtn}
                  data-testid="jump-to-generated-batches-btn"
                  onClick={() => {
                    document
                      .querySelector('[data-testid^="batch-group-section-"]')
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Jump to Generated Batches ↓
                </button>
              )}
              <button
                type="button"
                className={styles.smallBtn}
                data-testid="builder-pairing-toggle"
                aria-expanded={!pairingCollapsed}
                onClick={() => setPairingCollapsed((prev) => !prev)}
              >
                {pairingCollapsed ? "Expand pairing ▸" : "Collapse pairing ▾"}
              </button>
            </div>
          </div>

          {!pairingCollapsed && (
          <div
            className={`${styles.pairingStage} ${
              activeFormatTab === "blogger" || activeFormatTab === "x"
                ? styles.pairingStageTextFirst
                : ""
            }`}
            data-testid="builder-pairing-stage"
          >
            <div className={styles.pairingColumn} data-testid="builder-writing-groups">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span className={styles.fieldLabel}>
                  1. Writing Collections ({tabCollections.length} banks)
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="search"
                    aria-label="Search writing banks"
                    data-testid="builder-writing-search"
                    placeholder="Filter banks…"
                    value={writingBankSearch}
                    onChange={(e) => setWritingBankSearch(e.target.value)}
                    style={{
                      padding: "3px 8px",
                      borderRadius: 7,
                      border: "1px solid var(--line-soft)",
                      background: "var(--bg)",
                      color: "var(--fg)",
                      fontSize: 12,
                      width: 135,
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: selectedCollectionId ? "var(--accent)" : "var(--muted)" }}>
                    {selectedCollectionId
                      ? `Selected: ${state.collections.find((c) => c.id === selectedCollectionId)?.name ?? ""}`
                      : "Selected: All / General"}
                  </span>
                  <button
                    type="button"
                    className="anext-btn-secondary"
                    style={{ padding: "3px 9px", fontSize: 12 }}
                    onClick={() => setCollectionDialog({ mode: "create", name: "" })}
                  >
                    + New
                  </button>
                </div>
              </div>
              <div
                className={styles.pairingScrollGrid}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  data-testid="writing-group-all"
                  onClick={() => setSelectedCollectionId("")}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: 12,
                    borderRadius: 10,
                    border:
                      selectedCollectionId === ""
                        ? "2px solid var(--accent)"
                        : "1px solid var(--line-soft)",
                    background:
                      selectedCollectionId === ""
                        ? "var(--selection-bg)"
                        : "var(--bg)",
                    color: "var(--fg)",
                    cursor: "pointer",
                    textAlign: "left",
                    minHeight: 124,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>All / General</span>
                    {inBatchWritingIds.has("") && (
                      <span
                        data-testid="in-batch-badge"
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: "#b45309",
                          color: "#ffffff",
                        }}
                      >
                        In batch
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>
                    Combine blocks from across every writing collection.
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {tabVariationCount} blocks{selectedCollectionId === "" ? " · Selected" : ""}
                  </div>
                </button>
                {(() => {
                  const q = writingBankSearch.trim().toLowerCase();
                  const filteredTabCollections = q
                    ? tabCollections.filter((c) => c.name.toLowerCase().includes(q))
                    : tabCollections;
                  const writingPassMap = new Map<number, typeof state.collections>();
                  for (const c of filteredTabCollections) {
                    const passNum = (scheduledWritingBatchIds.get(c.id)?.size ?? 0) + 1;
                    const bucket = writingPassMap.get(passNum) ?? [];
                    bucket.push(c);
                    writingPassMap.set(passNum, bucket);
                  }
                  const pass1 = writingPassMap.get(1) ?? [];
                  const pass2 = writingPassMap.get(2) ?? [];
                  const extraPasses = Array.from(writingPassMap.entries())
                    .filter(([passNum]) => passNum >= 3)
                    .sort((a, b) => a[0] - b[0]);
                  const renderWritingCards = (items: typeof state.collections) =>
                    items.map((c) => {
                      const colVars = state.variations.filter((v) => v.collectionId === c.id);
                      const count = colVars.length;
                      const active = selectedCollectionId === c.id;
                      const expanded = Boolean(expandedWritingCollectionIds[c.id]);
                      const inBatch = inBatchWritingIds.has(c.id);
                      const isStaged = stagedWritingCollectionIds.has(c.id);
                      const scheduledBatchCount = scheduledWritingBatchIds.get(c.id)?.size ?? 0;
                  const hookCount = colVars.filter((v) => v.sectionRole === "hook").length;
                  const bodyCount = colVars.filter((v) => v.sectionRole === "body").length;
                  const questionCount = colVars.filter((v) => v.sectionRole === "question").length;
                  const signoffCount = colVars.filter((v) => v.sectionRole === "signoff").length;
                  const hashtagCount = colVars.filter((v) => v.sectionRole === "hashtags").length;
                  const sampleLine =
                    colVars.find((v) => v.sectionRole === "hook")?.content ||
                    colVars[0]?.content ||
                    "No blocks yet — add in 2 Copywriting.";
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 6,
                        padding: "9px 11px",
                        borderRadius: 10,
                        borderTop: active
                          ? "2px solid var(--accent)"
                          : inBatch
                            ? "2px solid #d97706"
                            : "1px solid var(--line-soft)",
                        borderRight: active
                          ? "2px solid var(--accent)"
                          : inBatch
                            ? "2px solid #d97706"
                            : "1px solid var(--line-soft)",
                        borderBottom: active
                          ? "2px solid var(--accent)"
                          : inBatch
                            ? "2px solid #d97706"
                            : "1px solid var(--line-soft)",
                        borderLeft: active
                          ? "2px solid var(--accent)"
                          : inBatch
                            ? "5px solid #d97706"
                            : "1px solid var(--line-soft)",
                        background: active
                          ? "var(--selection-bg)"
                          : inBatch
                            ? "rgba(217, 119, 6, 0.10)"
                            : "var(--bg)",
                        gridColumn: expanded ? "1 / -1" : undefined,
                        minHeight: 74,
                      }}
                    >
                      <button
                        type="button"
                        data-testid={`writing-group-${c.id}`}
                        onClick={() => setSelectedCollectionId(c.id)}
                        style={{
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          cursor: "pointer",
                          textAlign: "left",
                          color: "var(--fg)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</span>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {(inBatch || (writingUsageCounts.get(c.id) ?? 0) > 0) && (
                              <span
                                data-testid="in-batch-badge"
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 999,
                                  background: "#b45309",
                                  color: "#ffffff",
                                }}
                                title="Reuse warning: currently in Confirmed Matches or working batch"
                              >
                                In batch
                                {(writingUsageCounts.get(c.id) ?? 0) > 0
                                  ? ` · ${writingUsageCounts.get(c.id)}`
                                  : ""}
                              </span>
                            )}
                            {isStaged && (
                              <span
                                data-testid="staged-badge"
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 999,
                                  background: "#6d28d9",
                                  color: "#ffffff",
                                }}
                                title="Reuse warning: staged in 4 Post Visualizer"
                              >
                                Staged
                              </span>
                            )}
                            {scheduledBatchCount > 0 && (
                              <span
                                data-testid="scheduled-pass-badge"
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 999,
                                  background: "#047857",
                                  color: "#ffffff",
                                }}
                              >
                                Scheduled · {scheduledBatchCount} batch{scheduledBatchCount === 1 ? "" : "es"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--muted)",
                            lineHeight: 1.4,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          “{sampleLine}”
                        </div>
                      </button>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                          {count} blocks{active ? " · Selected" : ""}
                        </span>
                        <button
                          type="button"
                          className="anext-btn-secondary"
                          data-testid={`writing-collection-expand-${c.id}`}
                          aria-label={expanded ? `Collapse ${c.name}` : `Expand ${c.name}`}
                          style={{ padding: "2px 7px", fontSize: 11 }}
                          onClick={() =>
                            setExpandedWritingCollectionIds((prev) => ({
                              ...prev,
                              [c.id]: !prev[c.id],
                            }))
                          }
                        >
                          {expanded ? "Hide ▾" : "Preview ▸"}
                        </button>
                      </div>

                      {expanded && (() => {
                        const seed = writingPreviewSeeds[c.id] ?? 0;
                        const colFormulaSections = getSectionsForWritingCollection(c.id);
                        const assembledPreview = assemblePostText(
                          colFormulaSections.map((sec, sIdx) => {
                            const matching = colVars.filter((v) => v.sectionRole === sec.role);
                            const picked =
                              matching.length > 0
                                ? matching[(seed + sIdx) % matching.length]
                                : null;
                            return {
                              ...sec,
                              text: picked?.content ?? "",
                            };
                          }),
                        );
                        return (
                          <div
                            data-testid={`writing-collection-preview-${c.id}`}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                              fontSize: 12,
                              color: "var(--muted)",
                              paddingTop: 8,
                              borderTop: "1px solid var(--line-soft)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
                              <span
                                data-testid={`writing-preview-status-${c.id}`}
                                style={{ fontWeight: 600, color: "var(--fg)", fontSize: 11.5 }}
                              >
                                Previewing #{seed + 1} (browsing only)
                              </span>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="anext-btn-secondary"
                                  data-testid={`writing-prev-preview-${c.id}`}
                                  style={{ padding: "2px 7px", fontSize: 11 }}
                                  onClick={() =>
                                    setWritingPreviewSeeds((prev) => ({
                                      ...prev,
                                      [c.id]: Math.max(0, (prev[c.id] ?? 0) - 1),
                                    }))
                                  }
                                >
                                  ◀ Prev
                                </button>
                                <button
                                  type="button"
                                  className="anext-btn-secondary"
                                  data-testid={`writing-next-preview-${c.id}`}
                                  style={{ padding: "2px 7px", fontSize: 11 }}
                                  onClick={() =>
                                    setWritingPreviewSeeds((prev) => ({
                                      ...prev,
                                      [c.id]: (prev[c.id] ?? 0) + 1,
                                    }))
                                  }
                                >
                                  Next ▶
                                </button>
                                <button
                                  type="button"
                                  className="anext-btn-secondary"
                                  data-testid={`writing-randomise-preview-${c.id}`}
                                  style={{ padding: "2px 8px", fontSize: 11 }}
                                  onClick={() =>
                                    setWritingPreviewSeeds((prev) => ({
                                      ...prev,
                                      [c.id]: (prev[c.id] ?? 0) + 1 + Math.floor(Math.random() * 5),
                                    }))
                                  }
                                >
                                  🎲 Randomise
                                </button>
                                {batchDrafts.length > 0 && assembledPreview && (
                                  <button
                                    type="button"
                                    className="anext-btn-primary"
                                    data-testid={`writing-apply-to-post-${c.id}`}
                                    style={{ padding: "2px 8px", fontSize: 11 }}
                                    onClick={() => {
                                      const targetId = selectedDraftId || batchDrafts[0]?.id;
                                      if (!targetId) return;
                                      syncBatchDraftUpdate(targetId, { body: assembledPreview });
                                      setNotice("Applied previewed caption to selected post.");
                                    }}
                                  >
                                    Apply to post
                                  </button>
                                )}
                              </div>
                            </div>
                            <div
                              data-testid={`writing-assembled-caption-${c.id}`}
                              style={{
                                color: "var(--fg)",
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.45,
                                padding: "8px 10px",
                                borderRadius: 8,
                                border: "1px solid var(--line-soft)",
                                background: "var(--bg)",
                              }}
                            >
                              {assembledPreview || "Add modular blocks to preview an assembled caption."}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                    });
                  return (
                    <>
                      <div
                        data-testid="writing-pass-1-heading"
                        style={{
                          gridColumn: "1 / -1",
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: "var(--muted)",
                          paddingTop: 4,
                          borderTop: "1px solid var(--line-soft)",
                        }}
                      >
                        Pass 1 — Unused ({pass1.length})
                      </div>
                      {renderWritingCards(pass1)}
                      <div
                        data-testid="writing-pass-2-heading"
                        style={{
                          gridColumn: "1 / -1",
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: "#047857",
                          paddingTop: 6,
                          borderTop: "1px solid var(--line-soft)",
                        }}
                      >
                        Pass 2 — Used once ({pass2.length})
                      </div>
                      {renderWritingCards(pass2)}
                      {extraPasses.map(([passNum, items]) => {
                        const key = `writing-pass-${passNum}`;
                        const isOpen = Boolean(expandedPassSections[key]);
                        const usedCount = passNum - 1;
                        return (
                          <Fragment key={key}>
                            <button
                              type="button"
                              data-testid={`writing-pass-${passNum}-heading`}
                              aria-expanded={isOpen}
                              onClick={() =>
                                setExpandedPassSections((prev) => ({
                                  ...prev,
                                  [key]: !prev[key],
                                }))
                              }
                              style={{
                                gridColumn: "1 / -1",
                                textAlign: "left",
                                border: "none",
                                background: "transparent",
                                padding: "6px 0 0",
                                borderTop: "1px solid var(--line-soft)",
                                fontSize: 11.5,
                                fontWeight: 700,
                                color: "var(--muted)",
                                cursor: "pointer",
                              }}
                            >
                              {isOpen ? "▾" : "▸"} Pass {passNum} — Used {usedCount} times ({items.length})
                            </button>
                            {isOpen && renderWritingCards(items)}
                          </Fragment>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>

            <div className={styles.matchCenter} data-testid="builder-match-center">
              <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.35 }}>
                <strong style={{ color: "var(--fg)" }}>
                  {state.collections.find((c) => c.id === selectedCollectionId)?.name ?? "All / General"}
                </strong>
                <div>↔</div>
                <strong style={{ color: "var(--fg)" }}>
                  {mediaCollections.find((m) => m.id === selectedMediaCollectionId)?.name ?? "None (text only)"}
                </strong>
              </div>
              <button
                type="button"
                className="anext-btn-primary"
                data-testid="builder-match-btn"
                onClick={handleAddMatch}
                style={{ width: "100%", padding: "8px 12px", fontSize: 13, fontWeight: 700 }}
              >
                Match ↔
              </button>
              <button
                type="button"
                className="anext-btn-secondary"
                data-testid="builder-magic-pair-btn"
                onClick={() => {
                  const schedWCounts = new Map<string, number>();
                  scheduledWritingBatchIds.forEach((set, id) => schedWCounts.set(id, set.size));
                  const schedMCounts = new Map<string, number>();
                  scheduledMediaBatchIds.forEach((set, id) => schedMCounts.set(id, set.size));
                  const existingPairKeys = new Set(
                    confirmedMatches.map((m) => `${m.writingCollectionId}::${m.mediaCollectionId}`),
                  );
                  const res = buildMagicPairSuggestions({
                    writingCollections: tabCollections.map((c) => {
                      const vars = state.variations.filter((v) => v.collectionId === c.id);
                      return {
                        id: c.id,
                        name: c.name,
                        description: c.description,
                        variationCount: vars.length,
                        hasStoryLocks: vars.some((v) => Boolean(extractStoryId(v.title))),
                      };
                    }),
                    mediaCollections: mediaCollections.map((mc) => ({
                      id: mc.id,
                      name: mc.name,
                      assetCount: mc.count ?? libraryMedia.filter((m) => m.collectionId === mc.id).length,
                    })),
                    scheduledWritingCounts: schedWCounts,
                    scheduledMediaCounts: schedMCounts,
                    existingPairKeys,
                    stagedWritingIds: stagedWritingCollectionIds,
                    stagedMediaIds: stagedMediaCollectionIds,
                  });
                  setMagicPairModal(res);
                }}
                style={{ width: "100%", padding: "7px 12px", fontSize: 12.5, fontWeight: 700 }}
              >
                ✨ Magic Pair
              </button>
            </div>

            <div className={styles.pairingColumn} data-testid="builder-media-groups">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span className={styles.fieldLabel}>
                  2. Media Collections ({mediaCollections.length} sets
                  {activeFormatTab === "blogger"
                    ? " · Optional featured image"
                    : activeFormatTab === "x"
                      ? " · Optional media"
                      : ""}
                  )
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: selectedMediaCollectionId ? "var(--accent)" : "var(--muted)" }}>
                  {selectedMediaCollectionId
                    ? `Selected: ${mediaCollections.find((m) => m.id === selectedMediaCollectionId)?.name ?? ""} (${selectedMediaAssets.length} assets)`
                    : "Selected: None (text only)"}
                </span>
              </div>
              <div
                className={styles.pairingScrollGrid}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  data-testid="media-group-none"
                  onClick={() => setSelectedMediaCollectionId("")}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: 10,
                    borderRadius: 10,
                    border:
                      selectedMediaCollectionId === ""
                        ? "2px solid var(--accent)"
                        : "1px solid var(--line-soft)",
                    background:
                      selectedMediaCollectionId === ""
                        ? "var(--selection-bg)"
                        : "var(--bg)",
                    color: "var(--fg)",
                    cursor: "pointer",
                    textAlign: "left",
                    minHeight: 148,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: 84,
                      borderRadius: 7,
                      border: "1px dashed var(--line-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      color: "var(--muted)",
                    }}
                  >
                    Text only
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>None</span>
                    {inBatchMediaIds.has("") ? (
                      <span
                        data-testid="in-batch-badge"
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: "#b45309",
                          color: "#ffffff",
                        }}
                      >
                        In batch
                      </span>
                    ) : (
                      selectedMediaCollectionId === "" && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)" }}>Selected</span>
                      )
                    )}
                  </div>
                </button>
                {(() => {
                  const mediaPassMap = new Map<number, typeof mediaCollections>();
                  for (const mc of mediaCollections) {
                    const passNum = (scheduledMediaBatchIds.get(mc.id)?.size ?? 0) + 1;
                    const bucket = mediaPassMap.get(passNum) ?? [];
                    bucket.push(mc);
                    mediaPassMap.set(passNum, bucket);
                  }
                  const pass1 = mediaPassMap.get(1) ?? [];
                  const pass2 = mediaPassMap.get(2) ?? [];
                  const extraPasses = Array.from(mediaPassMap.entries())
                    .filter(([passNum]) => passNum >= 3)
                    .sort((a, b) => a[0] - b[0]);
                  const renderMediaCards = (items: typeof mediaCollections) =>
                    items.map((mc) => {
                      const active = selectedMediaCollectionId === mc.id;
                      const scheduledBatchCount = scheduledMediaBatchIds.get(mc.id)?.size ?? 0;
                  const expanded = Boolean(expandedMediaCollectionIds[mc.id]);
                  const inBatch = inBatchMediaIds.has(mc.id);
                  const isStaged = stagedMediaCollectionIds.has(mc.id);
                  const cover = mc.coverPath ? mediaPathToUrl(mc.coverPath) : null;
                  const thumbs = prioritizeUnusedMedia(
                    libraryMedia.filter((m) => m.collectionId === mc.id),
                    new Set([...usedAssetIdsInBatch, ...stagedAssetIds]),
                  ).slice(0, 12);
                  return (
                    <div
                      key={mc.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        padding: 8,
                        borderRadius: 10,
                        borderTop: active
                          ? "2px solid var(--accent)"
                          : inBatch
                            ? "2px solid #d97706"
                            : "1px solid var(--line-soft)",
                        borderRight: active
                          ? "2px solid var(--accent)"
                          : inBatch
                            ? "2px solid #d97706"
                            : "1px solid var(--line-soft)",
                        borderBottom: active
                          ? "2px solid var(--accent)"
                          : inBatch
                            ? "2px solid #d97706"
                            : "1px solid var(--line-soft)",
                        borderLeft: active
                          ? "2px solid var(--accent)"
                          : inBatch
                            ? "5px solid #d97706"
                            : "1px solid var(--line-soft)",
                        background: active
                          ? "var(--selection-bg)"
                          : inBatch
                            ? "rgba(217, 119, 6, 0.10)"
                            : "var(--bg)",
                        gridColumn: expanded ? "1 / -1" : undefined,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button
                          type="button"
                          data-testid={`media-group-${mc.id}`}
                          onClick={() => setSelectedMediaCollectionId(mc.id)}
                          style={{
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            cursor: "pointer",
                            textAlign: "left",
                            color: "var(--fg)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          {cover ? (
                            <img
                              src={cover}
                              alt={mc.name}
                              style={{
                                width: "100%",
                                height: 84,
                                borderRadius: 7,
                                objectFit: "cover",
                                border: "1px solid var(--line-soft)",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: 84,
                                borderRadius: 7,
                                border: "1px dashed var(--line-soft)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11.5,
                                color: "var(--muted)",
                              }}
                            >
                              No cover
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              lineHeight: 1.25,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={mc.name}
                          >
                            {mc.name}
                          </div>
                        </button>
                        {(inBatch || isStaged || scheduledBatchCount > 0 || (mediaUsageCounts.get(mc.id) ?? 0) > 0) && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {(inBatch || (mediaUsageCounts.get(mc.id) ?? 0) > 0) && (
                              <span
                                data-testid="in-batch-badge"
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 999,
                                  background: "#b45309",
                                  color: "#ffffff",
                                }}
                                title="Reuse warning: currently in Confirmed Matches or working batch"
                              >
                                In batch
                                {(mediaUsageCounts.get(mc.id) ?? 0) > 0
                                  ? ` · ${mediaUsageCounts.get(mc.id)}`
                                  : ""}
                              </span>
                            )}
                            {isStaged && (
                              <span
                                data-testid="staged-badge"
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 999,
                                  background: "#6d28d9",
                                  color: "#ffffff",
                                }}
                                title="Reuse warning: staged in 4 Post Visualizer"
                              >
                                Staged
                              </span>
                            )}
                            {scheduledBatchCount > 0 && (
                              <span
                                data-testid="scheduled-pass-badge"
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 999,
                                  background: "#047857",
                                  color: "#ffffff",
                                }}
                              >
                                Scheduled · {scheduledBatchCount} batch{scheduledBatchCount === 1 ? "" : "es"}
                              </span>
                            )}
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                            {mc.count} assets{active ? " · Selected" : ""}
                          </span>
                          <button
                            type="button"
                            className="anext-btn-secondary"
                            data-testid={`media-collection-expand-${mc.id}`}
                            aria-label={expanded ? `Collapse ${mc.name}` : `Expand ${mc.name}`}
                            style={{ padding: "2px 7px", fontSize: 11 }}
                            onClick={() => void toggleExpandMediaCollection(mc.id)}
                          >
                            {expanded ? "Hide ▾" : "View ▸"}
                          </button>
                        </div>
                      </div>
                      {expanded && (
                        <div
                          data-testid={`media-collection-preview-${mc.id}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
                            gap: 8,
                            paddingTop: 6,
                            borderTop: "1px solid var(--line-soft)",
                          }}
                        >
                          {thumbs.length === 0 ? (
                            <span style={{ fontSize: 12, color: "var(--muted)" }}>
                              No preview thumbnails in this collection yet.
                            </span>
                          ) : (
                            thumbs.map((asset) => {
                              const assetUsedInBatch = usedAssetIdsInBatch.has(asset.id);
                              const assetStaged = stagedAssetIds.has(asset.id);
                              return (
                                <div
                                  key={asset.id}
                                  data-testid={`media-asset-thumb-${asset.id}`}
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 3,
                                    alignItems: "center",
                                  }}
                                >
                                  <img
                                    src={mediaPathToUrl(asset.thumbnail || asset.path) ?? undefined}
                                    alt={asset.name}
                                    style={{
                                      width: "100%",
                                      height: 62,
                                      objectFit: "cover",
                                      borderRadius: 6,
                                      border: assetUsedInBatch
                                        ? "2px solid #2563eb"
                                        : "1px solid var(--line-soft)",
                                    }}
                                  />
                                  <span
                                    style={{
                                      fontSize: 10.5,
                                      color: "var(--muted)",
                                      width: "100%",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {asset.name}
                                  </span>
                                  {(assetUsedInBatch || assetStaged) && (
                                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                      {assetUsedInBatch && (
                                        <span
                                          data-testid="asset-in-batch-badge"
                                          style={{
                                            fontSize: 9.5,
                                            fontWeight: 700,
                                            padding: "1px 5px",
                                            borderRadius: 999,
                                            background: "rgba(37, 99, 235, 0.14)",
                                            color: "#1d4ed8",
                                          }}
                                        >
                                          In batch
                                        </span>
                                      )}
                                      {assetStaged && (
                                        <span
                                          data-testid="asset-staged-badge"
                                          style={{
                                            fontSize: 9.5,
                                            fontWeight: 700,
                                            padding: "1px 5px",
                                            borderRadius: 999,
                                            background: "rgba(16, 185, 129, 0.15)",
                                            color: "#047857",
                                          }}
                                        >
                                          Staged
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                    });
                  return (
                    <>
                      <div
                        data-testid="media-pass-1-heading"
                        style={{
                          gridColumn: "1 / -1",
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: "var(--muted)",
                          paddingTop: 4,
                          borderTop: "1px solid var(--line-soft)",
                        }}
                      >
                        Pass 1 — Unused ({pass1.length})
                      </div>
                      {renderMediaCards(pass1)}
                      <div
                        data-testid="media-pass-2-heading"
                        style={{
                          gridColumn: "1 / -1",
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: "#047857",
                          paddingTop: 6,
                          borderTop: "1px solid var(--line-soft)",
                        }}
                      >
                        Pass 2 — Used once ({pass2.length})
                      </div>
                      {renderMediaCards(pass2)}
                      {extraPasses.map(([passNum, items]) => {
                        const key = `media-pass-${passNum}`;
                        const isOpen = Boolean(expandedPassSections[key]);
                        const usedCount = passNum - 1;
                        return (
                          <Fragment key={key}>
                            <button
                              type="button"
                              data-testid={`media-pass-${passNum}-heading`}
                              aria-expanded={isOpen}
                              onClick={() =>
                                setExpandedPassSections((prev) => ({
                                  ...prev,
                                  [key]: !prev[key],
                                }))
                              }
                              style={{
                                gridColumn: "1 / -1",
                                textAlign: "left",
                                border: "none",
                                background: "transparent",
                                padding: "6px 0 0",
                                borderTop: "1px solid var(--line-soft)",
                                fontSize: 11.5,
                                fontWeight: 700,
                                color: "var(--muted)",
                                cursor: "pointer",
                              }}
                            >
                              {isOpen ? "▾" : "▸"} Pass {passNum} — Used {usedCount} times ({items.length})
                            </button>
                            {isOpen && renderMediaCards(items)}
                          </Fragment>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
          )}

          <div className={styles.toolbar}>
            <div className={styles.toolbarGroup}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="builder-collection">
                  Collection
                </label>
                <div className={styles.controlRow}>
                  <select
                    id="builder-collection"
                    data-testid="builder-collection-select"
                    className={styles.select}
                    value={selectedCollectionId}
                    onChange={(e) => setSelectedCollectionId(e.target.value)}
                  >
                    <option value="">All / General</option>
                    {tabCollections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid="builder-new-collection-btn"
                    className="anext-btn-secondary"
                    style={{ padding: "5px 9px", fontSize: 12 }}
                    onClick={() => setCollectionDialog({ mode: "create", name: "" })}
                  >
                    + New
                  </button>
                  {selectedCollection && (
                    <button
                      type="button"
                      data-testid="builder-rename-collection-btn"
                      className="anext-btn-secondary"
                      style={{ padding: "5px 9px", fontSize: 12 }}
                      onClick={() =>
                        setCollectionDialog({
                          mode: "rename",
                          target: selectedCollection,
                          name: selectedCollection.name,
                        })
                      }
                    >
                      Rename
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="builder-post-type">
                  Post Type
                </label>
                <div className={styles.controlRow}>
                  <select
                    id="builder-post-type"
                    data-testid="builder-post-type-select"
                    className={styles.select}
                    value={selectedPostTypeId}
                    onChange={(e) => setSelectedPostTypeId(e.target.value)}
                  >
                    <option value="">Any type</option>
                    {tabPostTypes.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid="builder-new-type-btn"
                    className="anext-btn-secondary"
                    style={{ padding: "5px 9px", fontSize: 12 }}
                    onClick={() => setPostTypeDialog({ mode: "create", name: "" })}
                  >
                    + New Type
                  </button>
                  {selectedPostType && (
                    <button
                      type="button"
                      data-testid="builder-rename-type-btn"
                      className="anext-btn-secondary"
                      style={{ padding: "5px 9px", fontSize: 12 }}
                      onClick={() =>
                        setPostTypeDialog({
                          mode: "rename",
                          target: selectedPostType,
                          name: selectedPostType.name,
                        })
                      }
                    >
                      Rename Type
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="builder-formula">
                  Formula
                </label>
                <select
                  id="builder-formula"
                  data-testid="builder-formula-select"
                  className={styles.select}
                  value={selectedFormulaId}
                  onChange={(e) => handleFormulaChange(e.target.value)}
                >
                  {tabBuiltinFormulas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                  {tabCustomFormulas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Length</span>
              <div className={styles.segmented} role="tablist" aria-label="Post length">
                <button
                  type="button"
                  role="tab"
                  aria-selected={length === "short"}
                  className={
                    styles.segment + (length === "short" ? " " + styles.segmentActive : "")
                  }
                  onClick={() => handleLengthChange("short")}
                >
                  Short
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={length === "standard"}
                  className={
                    styles.segment +
                    (length === "standard" ? " " + styles.segmentActive : "")
                  }
                  onClick={() => handleLengthChange("standard")}
                >
                  Standard
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading builder…</div>
          ) : builderMode === "batch" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                className={styles.controlBar}
                data-testid="builder-posting-strip"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  background: "rgb(var(--tint) / 0.04)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", flex: 1 }}>
                    <div className={styles.field} style={{ width: 88, flex: "0 0 auto" }}>
                      <label className={styles.fieldLabel}>Posts</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        data-testid="batch-count-input"
                        className={styles.input}
                        value={batchCount}
                        onChange={(e) =>
                          setBatchCount(
                            Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                          )
                        }
                      />
                    </div>

                    <div className={styles.field} style={{ minWidth: 150, flex: "0 1 auto" }}>
                      <label className={styles.fieldLabel}>Frequency</label>
                      <select
                        className={styles.select}
                        data-testid="batch-frequency-select"
                        value={batchFrequency}
                        onChange={(e) =>
                          setBatchFrequency(e.target.value as VisualizerFrequency)
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

                    {batchFrequency === "every_n_days" && (
                      <div className={styles.field} style={{ width: 76, flex: "0 0 auto" }}>
                        <label className={styles.fieldLabel}>Every N d</label>
                        <input
                          type="number"
                          min={1}
                          max={90}
                          className={styles.input}
                          value={batchEveryNDays}
                          onChange={(e) =>
                            setBatchEveryNDays(Math.max(1, Number(e.target.value) || 1))
                          }
                        />
                      </div>
                    )}

                    {(batchFrequency === "monthly_day" || batchFrequency === "twice_monthly") && (
                      <div className={styles.field} style={{ width: 96, flex: "0 0 auto" }}>
                        <label className={styles.fieldLabel}>Day of month</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          data-testid="batch-monthly-day-input"
                          className={styles.input}
                          value={batchMonthlyDay}
                          onChange={(e) =>
                            setBatchMonthlyDay(
                              Math.max(1, Math.min(31, Number(e.target.value) || 1)),
                            )
                          }
                        />
                      </div>
                    )}

                    <div className={styles.field} style={{ width: 144, flex: "0 0 auto" }}>
                      <label className={styles.fieldLabel}>Start date</label>
                      <input
                        type="date"
                        data-testid="batch-start-date-input"
                        className={styles.input}
                        value={batchStartDate}
                        onChange={(e) => {
                          const nextStart = e.target.value;
                          setBatchStartDate(nextStart);
                          const dayFromStart = Number(nextStart.slice(8, 10));
                          if (Number.isFinite(dayFromStart) && dayFromStart >= 1 && dayFromStart <= 31) {
                            setBatchMonthlyDay(dayFromStart);
                          }
                        }}
                      />
                    </div>

                    <div className={styles.field} style={{ width: 108, flex: "0 0 auto" }}>
                      <label className={styles.fieldLabel}>Window start</label>
                      <input
                        type="time"
                        data-testid="batch-time-start-input"
                        className={styles.input}
                        value={batchTime}
                        onChange={(e) => setBatchTime(e.target.value)}
                      />
                    </div>

                    <div className={styles.field} style={{ width: 108, flex: "0 0 auto" }}>
                      <label className={styles.fieldLabel}>Window end</label>
                      <input
                        type="time"
                        data-testid="batch-time-end-input"
                        className={styles.input}
                        value={batchTimeEnd}
                        onChange={(e) => setBatchTimeEnd(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      data-testid="builder-posting-settings-toggle"
                      aria-expanded={postingSettingsOpen}
                      onClick={() => setPostingSettingsOpen((prev) => !prev)}
                    >
                      {postingSettingsOpen ? "Less ▾" : "Label & colour ▸"}
                    </button>
                    <button
                      type="button"
                      className="anext-btn-secondary"
                      data-testid="batch-generate-btn"
                      onClick={() => void handleGenerateBatch(false)}
                    >
                      Generate {batchCount} posts
                    </button>
                    <button
                      type="button"
                      className="anext-btn-primary"
                      data-testid="batch-generate-send-btn"
                      onClick={() => void handleGenerateBatch(true)}
                    >
                      Generate &amp; Send to Visualizer
                    </button>
                  </div>
                </div>

                {(batchFrequency === "monthly_day" || batchFrequency === "twice_monthly") && (
                  <div
                    data-testid="builder-upcoming-dates-preview"
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <strong style={{ color: "var(--fg)" }}>Upcoming dates (on/after {batchStartDate}):</strong>
                    <span>
                      {generateScheduleDates({
                        count: Math.min(6, Math.max(1, batchCount)),
                        frequency: batchFrequency,
                        everyNDays: batchEveryNDays,
                        monthlyDay: batchMonthlyDay,
                        startDate: batchStartDate,
                      }).join(" · ")}
                    </span>
                  </div>
                )}

                {postingSettingsOpen && (
                <div className={styles.controlRow} style={{ flexWrap: "wrap", gap: 12, paddingTop: 8, borderTop: "1px solid var(--line-soft)" }}>
                  <div className={styles.field} style={{ minWidth: 180 }}>
                    <label className={styles.fieldLabel}>Batch label</label>
                    <input
                      type="text"
                      data-testid="batch-label-input"
                      className={styles.input}
                      placeholder={activeCollectionLabel}
                      value={batchLabel}
                      onChange={(e) => setBatchLabel(e.target.value)}
                    />
                  </div>

                  <div className={styles.field} style={{ flex: "0 0 auto" }}>
                    <label className={styles.fieldLabel}>Colour</label>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 34 }}>
                      {BATCH_COLOR_PALETTE.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          data-testid={`batch-color-${hex}`}
                          aria-label={`Batch color ${hex}`}
                          onClick={() => setBatchColor(hex)}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            background: hex,
                            border:
                              batchColor === hex
                                ? "2px solid var(--fg)"
                                : "1px solid var(--border)",
                            cursor: "pointer",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                )}

                {batchWarnings.length > 0 && (
                  <div
                    data-testid="batch-warnings"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--line-soft)",
                      background: "rgb(245 158 11 / 0.1)",
                      fontSize: 12.5,
                      color: "var(--fg)",
                    }}
                  >
                    {batchWarnings.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </div>
                )}
              </div>

              {batchDrafts.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span className={styles.fieldLabel}>
                      4. Paired Preview Cards ({batchDrafts.length} pairs)
                    </span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="anext-btn-secondary"
                        data-testid="batch-export-csv-btn"
                        onClick={handleExportBatchCsv}
                      >
                        Export CSV ({batchDrafts.length})
                      </button>
                      <button
                        type="button"
                        className="anext-btn-primary"
                        data-testid="batch-send-visualizer-btn"
                        onClick={() =>
                          addDraftsToVisualizer(
                            batchDrafts,
                            batchLabel.trim() || activeCollectionLabel,
                          )
                        }
                      >
                        Send to 4 Post Visualizer ({batchDrafts.length}) →
                      </button>
                    </div>
                  </div>

                  {visualizerBatches.length > 0 ? (
                    <div data-testid="builder-grouped-batches" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {visualizerBatches.map((batch) => {
                        const batchOpen = Boolean(expandedBatchPreviewIds[batch.id]);
                        const firstDate = batch.slots[0]?.date ?? "";
                        const lastDate = batch.slots[batch.slots.length - 1]?.date ?? "";
                        return (
                          <section
                            key={batch.id}
                            data-testid={`batch-group-section-${batch.id}`}
                            style={{
                              borderTop: "1px solid var(--line-soft)",
                              borderRight: "1px solid var(--line-soft)",
                              borderBottom: "1px solid var(--line-soft)",
                              borderLeft: `4px solid ${batch.color}`,
                              borderRadius: 12,
                              background: "var(--bg-elevated, var(--bg))",
                              padding: "10px 14px",
                              display: "flex",
                              flexDirection: "column",
                              gap: 10,
                            }}
                          >
                            <div
                              data-testid={`batch-group-header-${batch.id}`}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <strong style={{ fontSize: 13.5 }}>{batch.label}</strong>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: `${batch.color}22`,
                                    color: batch.color,
                                  }}
                                >
                                  {batch.slots.length} {batch.slots.length === 1 ? "post" : "posts"}
                                </span>
                                {firstDate && (
                                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                    {firstDate}{lastDate && lastDate !== firstDate ? ` → ${lastDate}` : ""} · {batch.frequency}
                                  </span>
                                )}
                                {(() => {
                                  const destIds =
                                    batch.channelIds && batch.channelIds.length > 0
                                      ? batch.channelIds
                                      : [];
                                  const destList = destIds
                                    .map((id) => channels.find((c) => c.id === id))
                                    .filter((c): c is NonNullable<typeof c> => Boolean(c));
                                  return <GroupedDestinationBadges destList={destList} batchId={batch.id} />;
                                })()}
                              </div>
                              <button
                                type="button"
                                className={styles.smallBtn}
                                data-testid={`batch-group-toggle-${batch.id}`}
                                aria-expanded={batchOpen}
                                onClick={() =>
                                  setExpandedBatchPreviewIds((prev) => ({
                                    ...prev,
                                    [batch.id]: !prev[batch.id],
                                  }))
                                }
                              >
                                {batchOpen ? "Collapse batch ▾" : "Expand batch ▸"}
                              </button>
                            </div>

                            {batchOpen && (
                              <div
                                data-testid={`batch-group-grid-${batch.id}`}
                                className={styles.expandedBatchGrid}
                              >
                                {batch.slots.map((slot, sIdx) => {
                                  const thumb = slot.media ? mediaPathToUrl(slot.media.thumbnail || slot.media.path) : null;
                                  return (
                                    <article
                                      key={slot.id}
                                      data-testid="paired-preview-card"
                                      style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 10,
                                        width: "100%",
                                        padding: 12,
                                        borderRadius: 10,
                                        border: "1px solid var(--line-soft)",
                                        background: "var(--bg)",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                          <span className={styles.stepBadge}>#{sIdx + 1}</span>
                                          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                                            {slot.date} {slot.time} · {slot.body.length} chars
                                          </span>
                                          {slot.manualEdited && (
                                            <span
                                              style={{
                                                fontSize: 10.5,
                                                fontWeight: 700,
                                                padding: "1px 6px",
                                                borderRadius: 999,
                                                background: "rgb(14 165 233 / 0.14)",
                                                color: "#0369a1",
                                              }}
                                            >
                                              Edited
                                            </span>
                                          )}
                                          {slot.locked && (
                                            <span
                                              style={{
                                                fontSize: 10.5,
                                                fontWeight: 700,
                                                padding: "1px 6px",
                                                borderRadius: 999,
                                                background: "rgb(245 158 11 / 0.16)",
                                                color: "#b45309",
                                              }}
                                            >
                                              Locked
                                            </span>
                                          )}
                                          {(() => {
                                            const destIds =
                                              batch.channelIds && batch.channelIds.length > 0
                                                ? batch.channelIds
                                                : [];
                                            return destIds
                                              .map((id) => channels.find((c) => c.id === id))
                                              .filter((c): c is NonNullable<typeof c> => Boolean(c))
                                              .map((ch) => {
                                                const role = formatDestinationRole(ch.identifier);
                                                return (
                                                  <span
                                                    key={ch.id}
                                                    style={{
                                                      display: "inline-flex",
                                                      alignItems: "center",
                                                      gap: 4,
                                                      padding: "1px 6px",
                                                      borderRadius: 999,
                                                      fontSize: 10.5,
                                                      fontWeight: 600,
                                                      border: "1px solid var(--line-soft)",
                                                      background: "var(--surface)",
                                                    }}
                                                  >
                                                    <PlatformIcon platform={ch.platform} size={11} />
                                                    <span>{ch.name}</span>
                                                    {role && (
                                                      <span style={{ fontWeight: 700, color: role === "Profile" ? "#0369a1" : "#6d28d9" }}>
                                                        {role}
                                                      </span>
                                                    )}
                                                  </span>
                                                );
                                              });
                                          })()}
                                        </div>
                                        <button
                                          type="button"
                                          className="anext-btn-secondary"
                                          style={{ padding: "3px 8px", fontSize: 11.5, color: "var(--danger)" }}
                                          onClick={() => {
                                            const nextBatches = visualizerBatches
                                              .map((b) =>
                                                b.id === batch.id
                                                  ? { ...b, slots: b.slots.filter((x) => x.id !== slot.id) }
                                                  : b,
                                              )
                                              .filter((b) => b.slots.length > 0);
                                            setVisualizerBatches(nextBatches);
                                            setBatchDrafts((prev) =>
                                              prev.filter((d) => d.id !== (slot.draftId || slot.id)),
                                            );
                                            persistWorkingPlanState(confirmedMatches, nextBatches);
                                          }}
                                        >
                                          Remove
                                        </button>
                                      </div>

                                      <div
                                        style={{
                                          fontSize: 13,
                                          lineHeight: 1.5,
                                          color: "var(--fg)",
                                          whiteSpace: "pre-wrap",
                                        }}
                                      >
                                        {slot.body}
                                      </div>

                                      <textarea
                                        className={styles.textarea}
                                        style={{ minHeight: 76 }}
                                        data-testid={`batch-slot-textarea-${sIdx}`}
                                        aria-label={`Edit post #${sIdx + 1}`}
                                        value={slot.body}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const nextBatches = visualizerBatches.map((b) =>
                                            b.id === batch.id
                                              ? {
                                                  ...b,
                                                  slots: b.slots.map((x) =>
                                                    x.id === slot.id ? { ...x, body: val, manualEdited: true } : x,
                                                  ),
                                                }
                                              : b,
                                          );
                                          setVisualizerBatches(nextBatches);
                                          setBatchDrafts((prev) =>
                                            prev.map((d) =>
                                              d.id === (slot.draftId || slot.id) ? { ...d, body: val } : d,
                                            ),
                                          );
                                          persistWorkingPlanState(confirmedMatches, nextBatches);
                                        }}
                                      />

                                      {thumb ? (
                                        <img
                                          src={thumb}
                                          alt={slot.media?.name || ""}
                                          style={{
                                            width: "100%",
                                            height: "auto",
                                            maxHeight: 320,
                                            objectFit: "contain",
                                            borderRadius: 8,
                                            border: "1px solid var(--line-soft)",
                                            background: "rgb(var(--tint) / 0.03)",
                                          }}
                                        />
                                      ) : (
                                        <div
                                          style={{
                                            width: "100%",
                                            height: 56,
                                            borderRadius: 8,
                                            border: "1px dashed var(--line-soft)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 11.5,
                                            color: "var(--muted)",
                                          }}
                                        >
                                          Text only
                                        </div>
                                      )}
                                    </article>
                                  );
                                })}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                  <div
                    data-testid="paired-preview-list"
                    className={
                      activeFormatTab === "blogger"
                        ? styles.pairedPreviewGridWide
                        : activeFormatTab === "x"
                          ? styles.pairedPreviewGridX
                          : styles.pairedPreviewGrid
                    }
                  >
                    {batchDrafts.map((d, idx) => {
                      const thumb = d.media ? mediaPathToUrl(d.media.path) : null;
                      const isSwapping = swapDraftId === d.id;
                      const isExpanded = Boolean(expandedPreviewIds[d.id]);
                      const swappablePool =
                        selectedMediaAssets.length > 0
                          ? selectedMediaAssets
                          : libraryMedia;
                      return (
                        <article
                          key={d.id}
                          data-testid="paired-preview-card"
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            width: "100%",
                            padding: 12,
                            borderRadius: 12,
                            border: "1px solid var(--line-soft)",
                            background: "var(--bg-elevated, var(--bg))",
                            gridColumn: isExpanded ? "1 / -1" : undefined,
                            maxWidth: isExpanded ? 540 : undefined,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span className={styles.stepBadge}>#{idx + 1}</span>
                              {(d.reusedCopy || d.reusedMedia) && (
                                <span
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: 600,
                                    color: "#b45309",
                                    padding: "1px 6px",
                                    borderRadius: 999,
                                    border: "1px solid rgb(245 158 11 / 0.4)",
                                  }}
                                >
                                  Reused
                                </span>
                              )}
                              {activeFormatTab === "x" ? (
                                <span
                                  data-testid={`pair-x-meter-${idx}`}
                                  style={{
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    color:
                                      d.body.length > 280
                                        ? "#f87171"
                                        : d.body.length > 260
                                          ? "#fbbf24"
                                          : "#34d399",
                                  }}
                                >
                                  {d.body.length}/280 chars{d.body.length > 280 ? " (thread)" : ""}
                                </span>
                              ) : activeFormatTab === "blogger" ? (
                                <span
                                  data-testid={`pair-blogger-stats-${idx}`}
                                  style={{ fontSize: 11.5, color: "#fdba74", fontWeight: 600 }}
                                >
                                  {d.body.trim().split(/\s+/).filter(Boolean).length} words ·{" "}
                                  {(d.body.match(/^##\s+/gm) ?? []).length} H2
                                </span>
                              ) : (
                                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                                  {d.body.length} chars
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                type="button"
                                className="anext-btn-secondary"
                                data-testid={`pair-expand-btn-${idx}`}
                                aria-expanded={isExpanded}
                                style={{ padding: "3px 8px", fontSize: 11.5 }}
                                onClick={() =>
                                  setExpandedPreviewIds((prev) => ({
                                    ...prev,
                                    [d.id]: !prev[d.id],
                                  }))
                                }
                              >
                                {isExpanded ? "Collapse ▾" : "Expand ▸"}
                              </button>
                              <button
                                type="button"
                                className="anext-btn-secondary"
                                data-testid={`pair-remove-btn-${idx}`}
                                style={{ padding: "3px 8px", fontSize: 11.5, color: "var(--danger)" }}
                                onClick={() => syncBatchDraftRemove(d.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>

                          {(() => {
                            const matchedSlot = visualizerBatches
                              .flatMap((b) => b.slots)
                              .find((s) => s.draftId === d.id || s.id === d.id);
                            if (!matchedSlot) return null;
                            return (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  fontSize: 11,
                                  color: "var(--muted)",
                                }}
                              >
                                <input
                                  type="date"
                                  aria-label={`Schedule date for post #${idx + 1}`}
                                  data-testid={`pair-date-input-${idx}`}
                                  value={matchedSlot.date}
                                  onChange={(e) =>
                                    handleUpdateBatchDraftSchedule(d.id, { date: e.target.value })
                                  }
                                  style={{
                                    padding: "2px 6px",
                                    borderRadius: 6,
                                    border: "1px solid var(--line-soft)",
                                    background: "var(--bg)",
                                    color: "var(--fg)",
                                    fontSize: 11,
                                  }}
                                />
                                <input
                                  type="time"
                                  aria-label={`Schedule time for post #${idx + 1}`}
                                  data-testid={`pair-time-input-${idx}`}
                                  value={matchedSlot.time}
                                  onChange={(e) =>
                                    handleUpdateBatchDraftSchedule(d.id, { time: e.target.value })
                                  }
                                  style={{
                                    padding: "2px 6px",
                                    borderRadius: 6,
                                    border: "1px solid var(--line-soft)",
                                    background: "var(--bg)",
                                    color: "var(--fg)",
                                    fontSize: 11,
                                  }}
                                />
                              </div>
                            );
                          })()}

                          {d.graphicNote && (
                            <div
                              style={{
                                fontSize: 11.5,
                                color: "var(--muted)",
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "1px dashed var(--line-soft)",
                                overflow: isExpanded ? "visible" : "hidden",
                                textOverflow: isExpanded ? "clip" : "ellipsis",
                                whiteSpace: isExpanded ? "normal" : "nowrap",
                              }}
                            >
                              On-graphic: <strong>{d.graphicNote}</strong>
                            </div>
                          )}

                          <div
                            data-testid={`pair-linkedin-caption-${idx}`}
                            style={{
                              fontSize: 13,
                              lineHeight: 1.45,
                              color: "var(--fg)",
                              whiteSpace: "pre-wrap",
                              ...(isExpanded
                                ? {}
                                : {
                                    display: "-webkit-box",
                                    WebkitLineClamp: activeFormatTab === "blogger" ? 6 : 3,
                                    WebkitBoxOrient: "vertical" as const,
                                    overflow: "hidden",
                                  }),
                            }}
                          >
                            {d.body}
                          </div>

                          {isExpanded && (
                            <textarea
                              className={styles.textarea}
                              style={{ minHeight: 88 }}
                              data-testid={`pair-caption-textarea-${idx}`}
                              aria-label={`Edit caption #${idx + 1}`}
                              value={d.body}
                              onChange={(e) => {
                                syncBatchDraftUpdate(d.id, { body: e.target.value });
                              }}
                            />
                          )}

                          {thumb ? (
                            <img
                              src={thumb}
                              alt={d.media?.name || ""}
                              style={{
                                width: "100%",
                                height: isExpanded ? "auto" : 140,
                                maxHeight: isExpanded ? 420 : 140,
                                objectFit: isExpanded ? "contain" : "cover",
                                borderRadius: 8,
                                border: "1px solid var(--line-soft)",
                                background: "rgb(var(--tint) / 0.03)",
                              }}
                            />
                          ) : activeFormatTab === "social" ? (
                            <div
                              style={{
                                width: "100%",
                                height: isExpanded ? 84 : 44,
                                borderRadius: 8,
                                border: "1px dashed var(--line-soft)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11.5,
                                color: "var(--muted)",
                              }}
                            >
                              Text only
                            </div>
                          ) : null}

                          {isExpanded && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                            <span
                              style={{
                                fontSize: 11.5,
                                color: "var(--muted)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 260,
                              }}
                            >
                              {d.media ? d.media.name : "No media attached"}
                            </span>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="anext-btn-secondary"
                                data-testid={`pair-swap-media-btn-${idx}`}
                                style={{ padding: "4px 8px", fontSize: 11.5 }}
                                onClick={() => setSwapDraftId(isSwapping ? null : d.id)}
                              >
                                {isSwapping ? "Close swap" : "Swap media"}
                              </button>
                              {d.media && (
                                <button
                                  type="button"
                                  className="anext-btn-secondary"
                                  style={{ padding: "4px 8px", fontSize: 11.5 }}
                                  onClick={() => {
                                    syncBatchDraftUpdate(d.id, { media: null });
                                    setSwapDraftId(null);
                                  }}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                          )}

                          {isExpanded && isSwapping && (
                            <div
                              data-testid={`pair-swap-grid-${idx}`}
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                                maxHeight: 150,
                                overflowY: "auto",
                                padding: 6,
                                borderRadius: 8,
                                border: "1px solid var(--line-soft)",
                              }}
                            >
                              {swappablePool.slice(0, 24).map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  data-testid={`pair-swap-option-${m.id}`}
                                  title={m.name}
                                  onClick={() => {
                                    syncBatchDraftUpdate(d.id, { media: toBatchMediaRef(m) });
                                    setSwapDraftId(null);
                                  }}
                                  style={{
                                    padding: 0,
                                    border:
                                      d.media?.id === m.id
                                        ? "2px solid var(--accent)"
                                        : "1px solid var(--line-soft)",
                                    borderRadius: 6,
                                    overflow: "hidden",
                                    cursor: "pointer",
                                    background: "transparent",
                                  }}
                                >
                                  <img
                                    src={mediaPathToUrl(m.path) ?? undefined}
                                    alt={m.name}
                                    style={{ width: 42, height: 42, objectFit: "cover", display: "block" }}
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.workspaceGrid}>
              <div className={styles.sectionStack} data-testid="builder-section-stack">
                {sections.map((section, idx) => {
                  const roleVars = variationsForRole(section.role);
                  const pickerOpen = openPickerId === section.id;
                  return (
                    <article
                      key={section.id}
                      data-testid="builder-section-card"
                      data-role={section.role}
                      className={
                        styles.sectionCard +
                        (section.skipped ? " " + styles.sectionCardSkipped : "") +
                        (!section.includeInCaption ? " " + styles.sectionCardGraphic : "")
                      }
                    >
                      <div className={styles.cardHeader}>
                        <div className={styles.cardTitleGroup}>
                          <span className={styles.stepBadge}>{idx + 1}</span>
                          <span className={styles.cardTitle}>
                            {getBuilderRoleLabel(activeFormatTab, section.role, section.label)}
                          </span>
                          <span className={styles.roleChip}>{section.role}</span>
                          {section.optional && (
                            <span className={styles.roleChip}>Optional</span>
                          )}
                        </div>

                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            className="anext-btn-secondary"
                            style={{ padding: "3px 8px", fontSize: 12 }}
                            aria-label={`Move ${section.label} up`}
                            disabled={idx === 0}
                            onClick={() => moveSection(idx, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="anext-btn-secondary"
                            style={{ padding: "3px 8px", fontSize: 12 }}
                            aria-label={`Move ${section.label} down`}
                            disabled={idx === sections.length - 1}
                            onClick={() => moveSection(idx, 1)}
                          >
                            ↓
                          </button>
                          {section.optional && (
                            <button
                              type="button"
                              className="anext-btn-secondary"
                              style={{ padding: "3px 9px", fontSize: 12 }}
                              onClick={() => toggleSkipSection(section.id)}
                            >
                              {section.skipped ? "Include" : "Skip"}
                            </button>
                          )}
                          {sections.length > 1 && section.id.startsWith("custom-") && (
                            <button
                              type="button"
                              className="anext-btn-secondary"
                              style={{ padding: "3px 8px", fontSize: 12, color: "var(--danger)" }}
                              onClick={() => removeSection(section.id)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>

                      {!section.skipped && (
                        <>
                          <textarea
                            className={styles.textarea}
                            placeholder={SECTION_ROLE_META[section.role]?.hint ?? "Write or paste copy…"}
                            value={section.text ?? ""}
                            onChange={(e) => updateSectionText(section.id, e.target.value)}
                          />

                          <div className={styles.cardFooter}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="anext-btn-secondary"
                                style={{ padding: "4px 10px", fontSize: 12 }}
                                onClick={() =>
                                  setOpenPickerId(pickerOpen ? null : section.id)
                                }
                              >
                                {pickerOpen
                                  ? "Hide variations"
                                  : `Pick variation (${roleVars.length})`}
                              </button>
                              <button
                                type="button"
                                className="anext-btn-secondary"
                                style={{ padding: "4px 10px", fontSize: 12 }}
                                onClick={() =>
                                  setPasteDialog({ role: section.role, raw: "" })
                                }
                              >
                                Paste variations
                              </button>
                            </div>

                            <button
                              type="button"
                              className="anext-btn-secondary"
                              style={{ padding: "4px 10px", fontSize: 12 }}
                              disabled={!(section.text ?? "").trim()}
                              onClick={() => void saveSingleVariation(section)}
                            >
                              Save as variation
                            </button>
                          </div>

                          {pickerOpen && (
                            <div className={styles.variationDrawer}>
                              {roleVars.length === 0 ? (
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                  No saved variations for {section.role} yet. Type above and click “Save as variation” or “Paste variations”.
                                </span>
                              ) : (
                                roleVars.map((v) => (
                                  <div
                                    key={v.id}
                                    style={{ display: "flex", alignItems: "flex-start", gap: 6 }}
                                  >
                                    <button
                                      type="button"
                                      className={styles.variationItem}
                                      onClick={() => {
                                        updateSectionText(section.id, v.content);
                                        setOpenPickerId(null);
                                      }}
                                    >
                                      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                        {v.isSampleExample && (
                                          <span
                                            data-testid="imported-example-badge"
                                            style={{
                                              alignSelf: "flex-start",
                                              fontSize: 10,
                                              fontWeight: 700,
                                              textTransform: "uppercase",
                                              letterSpacing: "0.06em",
                                              padding: "2px 6px",
                                              borderRadius: 999,
                                              background: "var(--selection-bg, rgb(10 102 194 / 0.14))",
                                              color: "var(--selection-fg, var(--accent))",
                                            }}
                                          >
                                            Imported Example
                                          </span>
                                        )}
                                        <span>{v.content}</span>
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      className="anext-btn-secondary"
                                      aria-label="Delete variation"
                                      style={{ padding: "4px 7px", fontSize: 11, flexShrink: 0 }}
                                      onClick={async () => {
                                        setError(null);
                                        try {
                                          await deleteBuilderVariation(v.id);
                                          setNotice("Deleted variation.");
                                          await loadState();
                                        } catch (err) {
                                          setError(
                                            err instanceof Error
                                              ? err.message
                                              : "Could not delete variation",
                                          );
                                        }
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </article>
                  );
                })}

                <div className={styles.addSectionRow}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Add another section</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <select
                      aria-label="Section role to add"
                      className={styles.select}
                      value={addRole}
                      onChange={(e) => setAddRole(e.target.value as SectionRole)}
                    >
                      {(Object.keys(SECTION_ROLE_META) as SectionRole[]).map((role) => (
                        <option key={role} value={role}>
                          {SECTION_ROLE_META[role].label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      data-testid="builder-add-section-btn"
                      className="anext-btn-secondary"
                      onClick={addSection}
                    >
                      + Add section
                    </button>
                  </div>
                </div>
              </div>

              <aside ref={previewRef} className={styles.previewPanel}>
                <div className={styles.previewHeader}>
                  <h2 className={styles.previewTitle}>
                    {activeFormatTab === "blogger"
                      ? "Live Blogger Article Preview"
                      : activeFormatTab === "x"
                        ? "Live X Post Preview"
                        : "Live Post Preview"}
                  </h2>
                  {activeFormatTab === "x" ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: assembledText.length > 280 ? "#dc2626" : "#059669",
                      }}
                    >
                      {assembledText.length} / 280 chars
                    </span>
                  ) : activeFormatTab === "blogger" ? (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {(() => {
                        const words = assembledText.trim()
                          ? assembledText.trim().split(/\s+/).length
                          : 0;
                        const mins = Math.max(1, Math.ceil(words / 200));
                        return `${words} words · ${words ? `${mins} min read · ` : ""}${assembledText.length} chars`;
                      })()}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {assembledText.length} / 3,000 chars
                    </span>
                  )}
                </div>

                <div
                  className={styles.previewBody}
                  data-testid="builder-preview-body"
                >
                  {assembledText ? (
                    activeFormatTab === "blogger" ? (
                      (() => {
                        const [firstLine, ...restLines] = assembledText.split("\n");
                        const restBody = restLines.join("\n").trim();
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ borderBottom: "1px solid var(--line-soft)", paddingBottom: 8 }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", marginBottom: 2 }}>
                                Blog Title (Line 1)
                              </div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)", lineHeight: 1.35 }}>
                                {firstLine}
                              </div>
                            </div>
                            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                              {restBody || <span className={styles.previewEmpty}>Add article body sections below the title…</span>}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      assembledText
                    )
                  ) : (
                    <span className={styles.previewEmpty}>
                      Write or pick variations in the section cards to preview your assembled post.
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                    paddingTop: 8,
                    borderTop: "1px solid var(--line-soft)",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                    <span>Date</span>
                    <input
                      type="date"
                      data-testid="single-schedule-date"
                      value={singleScheduleDate}
                      onChange={(e) => setSingleScheduleDate(e.target.value)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--line-soft)",
                        background: "var(--bg)",
                        color: "var(--fg)",
                        fontSize: 12,
                      }}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                    <span>Time</span>
                    <input
                      type="time"
                      data-testid="single-schedule-time"
                      value={singleScheduleTime}
                      onChange={(e) => setSingleScheduleTime(e.target.value)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--line-soft)",
                        background: "var(--bg)",
                        color: "var(--fg)",
                        fontSize: 12,
                      }}
                    />
                  </label>
                </div>

                <div className={styles.previewFooter}>
                  <button
                    type="button"
                    className="anext-btn-secondary"
                    disabled={!assembledText}
                    onClick={async () => {
                      setError(null);
                      try {
                        if (!navigator.clipboard?.writeText) {
                          throw new Error("Clipboard access is unavailable in this context.");
                        }
                        await navigator.clipboard.writeText(assembledText);
                        setNotice("Copied assembled post to clipboard.");
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not copy assembled post to clipboard",
                        );
                      }
                    }}
                  >
                    Copy text
                  </button>
                  <button
                    type="button"
                    data-testid="single-send-visualizer-btn"
                    className="anext-btn-secondary"
                    disabled={!assembledText}
                    onClick={handleSendSingleToVisualizer}
                  >
                    Send to 4 Post Visualizer →
                  </button>
                  <button
                    type="button"
                    data-testid="open-composer-draft-btn"
                    className="anext-btn-primary"
                    disabled={!assembledText}
                    onClick={() => setComposerOpen(true)}
                  >
                    Open in Composer (Draft)
                  </button>
                </div>
              </aside>
            </div>
          )}
        </>
      )}

      {collectionDialog && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              {collectionDialog.mode === "create"
                ? "New collection"
                : "Rename collection"}
            </h2>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Client Launch"
              value={collectionDialog.name}
              onChange={(e) =>
                setCollectionDialog((prev) =>
                  prev ? { ...prev, name: e.target.value } : null,
                )
              }
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid var(--line-soft)",
                background: "var(--bg)",
                color: "var(--fg)",
                fontSize: 13.5,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="anext-btn-secondary"
                onClick={() => setCollectionDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                disabled={dialogBusy || !collectionDialog.name.trim()}
                onClick={() => void submitCollectionDialog()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {postTypeDialog && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              {postTypeDialog.mode === "create"
                ? "New post type"
                : "Rename post type"}
            </h2>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Product Launch Note"
              value={postTypeDialog.name}
              onChange={(e) =>
                setPostTypeDialog((prev) =>
                  prev ? { ...prev, name: e.target.value } : null,
                )
              }
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid var(--line-soft)",
                background: "var(--bg)",
                color: "var(--fg)",
                fontSize: 13.5,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="anext-btn-secondary"
                onClick={() => setPostTypeDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                disabled={dialogBusy || !postTypeDialog.name.trim()}
                onClick={() => void submitPostTypeDialog()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {pasteDialog && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              Paste variations ({SECTION_ROLE_META[pasteDialog.role].label})
            </h2>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
              Paste one or more variations from your notes or AI tool. Separate multiple variations with a blank line or <code>---</code>.
            </p>
            <textarea
              className={styles.textarea}
              style={{ minHeight: 150 }}
              autoFocus
              placeholder={"First variation...\n\nSecond variation..."}
              value={pasteDialog.raw}
              onChange={(e) =>
                setPasteDialog((prev) =>
                  prev ? { ...prev, raw: e.target.value } : null,
                )
              }
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="anext-btn-secondary"
                onClick={() => setPasteDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                disabled={dialogBusy || !pasteDialog.raw.trim()}
                onClick={() => void submitBatchPaste()}
              >
                Save variations
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteExamplesOpen && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          data-testid="delete-examples-dialog"
        >
          <div className={styles.modalCard}>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              Delete all imported examples?
            </h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--fg)" }}>
              This will remove <strong>{sampleCounts.collections}</strong> sample collections,{" "}
              <strong>{sampleCounts.postTypes}</strong> sample post types,{" "}
              <strong>{sampleCounts.formulas}</strong> sample formulas, and{" "}
              <strong>{sampleCounts.variations}</strong> sample variations from{" "}
              <strong>{activeOrgName}</strong>.
            </p>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)" }}>
              Your own variations, custom collections/types, built-in formulas, and any posts already saved as drafts in Posts will be preserved.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="anext-btn-secondary"
                disabled={dialogBusy}
                onClick={() => setDeleteExamplesOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-delete-examples-btn"
                className="anext-btn-primary"
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                disabled={dialogBusy}
                onClick={() => void handleDeleteExamples()}
              >
                {dialogBusy ? "Deleting…" : "Delete all imported examples"}
              </button>
            </div>
          </div>
        </div>
      )}

      {fullPreviewMatchId && (() => {
        const pair = confirmedMatches.find((m) => m.id === fullPreviewMatchId);
        if (!pair) return null;
        const previewImg = pair.previewMedia?.path
          ? mediaPathToUrl(pair.previewMedia.path)
          : pair.mediaCoverPath
            ? mediaPathToUrl(pair.mediaCoverPath)
            : null;
        const selectedIds =
          pair.channelIds && pair.channelIds.length > 0
            ? pair.channelIds
            : channels[0]
              ? [channels[0].id]
              : [];
        const destChannels = selectedIds
          .map((id) => channels.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => Boolean(c));
        return (
          <div
            className={styles.modalBackdrop}
            role="dialog"
            aria-modal="true"
            data-testid="match-full-preview-modal"
            onClick={() => setFullPreviewMatchId(null)}
          >
            <div
              className={styles.modalCard}
              style={{ maxWidth: 680, width: "92vw", maxHeight: "88vh", overflowY: "auto" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <strong style={{ fontSize: 15 }}>
                  {pair.writingName} ↔ {pair.mediaName}
                </strong>
                <button
                  type="button"
                  className="anext-btn-secondary"
                  data-testid="match-full-preview-close"
                  onClick={() => setFullPreviewMatchId(null)}
                >
                  Close ✕
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                <GroupedDestinationBadges destList={destChannels} />
              </div>
              <div
                data-testid="match-full-preview-caption"
                style={{
                  marginTop: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--line-soft)",
                  background: "var(--bg)",
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  color: "var(--fg)",
                }}
              >
                {pair.previewCaption}
              </div>
              {previewImg && (
                <div style={{ marginTop: 12 }}>
                  <img
                    data-testid="match-full-preview-image"
                    src={previewImg}
                    alt={pair.mediaName}
                    style={{
                      width: "100%",
                      height: "auto",
                      maxHeight: "65vh",
                      objectFit: "contain",
                      borderRadius: 10,
                      border: "1px solid var(--line-soft)",
                      background: "rgb(var(--tint) / 0.03)",
                      display: "block",
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {pendingTrimConfirm && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          data-testid="confirm-trim-batch-modal"
          onClick={() => setPendingTrimConfirm(null)}
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              Remove {pendingTrimConfirm.protectedSlots.length} edited or locked{" "}
              {pendingTrimConfirm.protectedSlots.length === 1 ? "post" : "posts"}?
            </h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>
              Reducing <strong>{pendingTrimConfirm.batchLabel}</strong> to{" "}
              <strong>{pendingTrimConfirm.patch.batchCount}</strong>{" "}
              {pendingTrimConfirm.patch.batchCount === 1 ? "post" : "posts"} will remove:
            </p>
            <ul
              data-testid="confirm-trim-batch-list"
              style={{
                margin: 0,
                paddingLeft: 18,
                maxHeight: 200,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 12.5,
              }}
            >
              {pendingTrimConfirm.protectedSlots.map((rp) => (
                <li key={rp.id}>
                  <strong>Post #{rp.index}</strong> ({rp.date} ·{" "}
                  {[rp.manualEdited ? "edited" : null, rp.locked ? "locked" : null]
                    .filter(Boolean)
                    .join(" & ")}
                  ): {rp.body.slice(0, 72)}
                  {rp.body.length > 72 ? "…" : ""}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className="anext-btn-secondary"
                data-testid="cancel-trim-batch-btn"
                onClick={() => setPendingTrimConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                data-testid="confirm-trim-batch-btn"
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                onClick={() => {
                  const { pairId, patch } = pendingTrimConfirm;
                  setPendingTrimConfirm(null);
                  handleUpdateMatch(pairId, patch, true);
                }}
              >
                Remove posts &amp; resize
              </button>
            </div>
          </div>
        </div>
      )}

      {magicPairModal && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          data-testid="magic-pair-modal"
          onClick={() => setMagicPairModal(null)}
        >
          <div
            className={styles.modalCard}
            style={{ maxWidth: 740, width: "94vw", maxHeight: "88vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>✨ Magic Pair Suggestions</h2>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>
                  Rule-based compatibility first, then unused Pass 1 assets. Uncertain or empty collections stay unmatched.
                </p>
              </div>
              <button
                type="button"
                className="anext-btn-secondary"
                onClick={() => setMagicPairModal(null)}
              >
                Close ✕
              </button>
            </div>

            {magicPairModal.suggestions.length === 0 ? (
              <div style={{ padding: "12px 14px", borderRadius: 10, border: "1px dashed var(--line-soft)", fontSize: 13, color: "var(--muted)" }}>
                No compatible pairs found to suggest right now.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {magicPairModal.suggestions.map((sug, idx) => (
                  <div
                    key={sug.id}
                    data-testid={`magic-pair-row-${idx}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--line-soft)",
                      background: "var(--bg)",
                      opacity: sug.rejected ? 0.52 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 13 }}>
                        {sug.writingName} ↔ {sug.mediaName}
                      </strong>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <select
                          aria-label={`Swap media for ${sug.writingName}`}
                          data-testid={`magic-pair-swap-media-${idx}`}
                          className={styles.select}
                          style={{ padding: "3px 8px", fontSize: 12, maxWidth: 210 }}
                          value={sug.mediaId}
                          disabled={sug.rejected}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            const mc = mediaCollections.find((m) => m.id === nextId);
                            if (!mc) return;
                            setMagicPairModal((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    suggestions: prev.suggestions.map((s) =>
                                      s.id === sug.id
                                        ? {
                                            ...s,
                                            mediaId: mc.id,
                                            mediaName: mc.name,
                                            reason: `Manual override ↔ ${mc.name}`,
                                          }
                                        : s,
                                    ),
                                  }
                                : null,
                            );
                          }}
                        >
                          {mediaCollections
                            .filter((mc) => mc.count > 0 || libraryMedia.some((m) => m.collectionId === mc.id))
                            .map((mc) => (
                              <option key={mc.id} value={mc.id}>
                                {mc.name}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className="anext-btn-secondary"
                          data-testid={`magic-pair-reject-${idx}`}
                          style={{ padding: "3px 9px", fontSize: 12 }}
                          onClick={() =>
                            setMagicPairModal((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    suggestions: prev.suggestions.map((s) =>
                                      s.id === sug.id ? { ...s, rejected: !s.rejected } : s,
                                    ),
                                  }
                                : null,
                            )
                          }
                        >
                          {sug.rejected ? "Restore" : "Reject ✕"}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      <span
                        data-testid={`magic-pair-reason-${idx}`}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "rgba(37, 99, 235, 0.12)",
                          color: "var(--accent)",
                        }}
                      >
                        {sug.reason}
                      </span>
                      {sug.warnings.map((w, wIdx) => (
                        <span
                          key={wIdx}
                          data-testid={`magic-pair-warning-${idx}`}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: "rgba(245, 158, 11, 0.16)",
                            color: "#b45309",
                          }}
                        >
                          ⚠ {w}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {magicPairModal.unmatched.length > 0 && (
              <div
                data-testid="magic-pair-unmatched-list"
                style={{
                  marginTop: 4,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--line-soft)",
                  background: "rgb(var(--tint) / 0.03)",
                }}
              >
                <strong style={{ fontSize: 12, color: "var(--muted)" }}>
                  Left unmatched ({magicPairModal.unmatched.length}) — uncertain, missing tags, or empty:
                </strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 3, maxHeight: 140, overflowY: "auto" }}>
                  {magicPairModal.unmatched.map((u) => (
                    <li key={`${u.kind}-${u.id}`}>
                      <strong>{u.name}</strong> ({u.kind}): {u.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
              <button
                type="button"
                className="anext-btn-secondary"
                onClick={() => setMagicPairModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                data-testid="magic-pair-apply-btn"
                disabled={magicPairModal.suggestions.filter((s) => !s.rejected).length === 0}
                onClick={() => {
                  const accepted = magicPairModal.suggestions.filter((s) => !s.rejected);
                  const existingKeys = new Set(
                    confirmedMatches.map((m) => `${m.writingCollectionId}::${m.mediaCollectionId}`),
                  );
                  const {
                    channelIds: defaultChannelIds,
                    channelName: defaultChannelName,
                  } = getDefaultChannelsForTab(activeFormatTab);
                  const added: ConfirmedMatchPlan[] = [];
                  for (const s of accepted) {
                    const key = `${s.writingId}::${s.mediaId}`;
                    if (existingKeys.has(key)) continue;
                    existingKeys.add(key);
                    const { previewCaption, previewMedia } = buildSamplePreviewForPair(
                      s.writingId,
                      s.mediaId,
                    );
                    const mc = mediaCollections.find((m) => m.id === s.mediaId);
                    const idx = confirmedMatches.length + added.length;
                    added.push({
                      id: `pair-${crypto.randomUUID().slice(0, 8)}`,
                      writingCollectionId: s.writingId,
                      writingName: s.writingName,
                      mediaCollectionId: s.mediaId,
                      mediaName: s.mediaName,
                      mediaCoverPath: mc?.coverPath ?? null,
                      previewCaption,
                      previewMedia,
                      color: BATCH_COLOR_PALETTE[idx % BATCH_COLOR_PALETTE.length],
                      frequency: batchFrequency,
                      everyNDays: Math.max(1, batchEveryNDays || 3),
                      monthlyDay: Math.max(1, Math.min(31, batchMonthlyDay || 4)),
                      startDate: batchStartDate || new Date().toISOString().slice(0, 10),
                      timeStart: batchTime || "09:00",
                      timeEnd: batchTimeEnd || batchTime || "10:00",
                      batchCount: Math.max(1, batchCount || 12),
                      channelIds: defaultChannelIds,
                      channelName: defaultChannelName,
                    });
                  }
                  if (added.length > 0) {
                    const next = [...confirmedMatches, ...added];
                    setConfirmedMatches(next);
                    persistWorkingPlanState(next, visualizerBatches);
                    setNotice(`Applied ${added.length} Magic Pair suggestion${added.length === 1 ? "" : "s"}.`);
                  }
                  setMagicPairModal(null);
                }}
              >
                Apply {magicPairModal.suggestions.filter((s) => !s.rejected).length} Pairs
              </button>
            </div>
          </div>
        </div>
      )}

      {composerOpen && (
        <CreatePostModal
          channels={channels}
          date={todayStr}
          time="09:00"
          initialBody={assembledText}
          onClose={() => setComposerOpen(false)}
          onSaveDraft={(post) => void submitToComposer(post, "draft")}
          onSchedule={(post) => void submitToComposer(post, "schedule")}
          onPublishNow={(post) => void submitToComposer(post, "now")}
        />
      )}
    </section>
  );
}
