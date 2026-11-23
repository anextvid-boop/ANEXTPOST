"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./post-builder.module.css";
import mediaStyles from "./media.module.css";
import { FORMAT_TAB_THEMES } from "@/lib/format-tab-theme";
import { WorkspaceBadge } from "./workspace-badge";
import { PlatformIcon } from "./platform-icon";
import { useAuth } from "@/lib/auth-context";
import { useChannels } from "@/lib/use-channels";
import { CreatePostModal, type NewPostInput } from "./create-post-modal";
import { createPost } from "@/lib/posts";
import { uploadMedia } from "@/lib/media-api";
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
  updateBuilderVariation,
  type BuilderCollection,
  type BuilderLength,
  type BuilderPostType,
  type BuilderSection,
  type BuilderStateResponse,
  type SectionRole,
} from "@/lib/builder-api";
import {
  downloadCopywritingTemplateCsv,
  parseCopywritingCsv,
  type ParsedCopywritingRow,
} from "@/lib/copywriting-csv";
import {
  BLOGGER_WRITING_GUIDE,
  parseBloggerMessage,
  parseInlineBloggerTokens,
  renderBloggerPreviewBlocks,
} from "@/lib/blogger-copywriting";
import {
  X_WRITING_GUIDE,
  X_TIEIN_SNIPPETS,
  type XPostMode,
  type XTieInSnippet,
  parseXMessage,
} from "@/lib/x-copywriting";

const EMPTY_STATE: BuilderStateResponse = {
  collections: [],
  postTypes: [],
  formulas: [],
  variations: [],
};

function makeSection(
  role: SectionRole,
  text = "",
  optional?: boolean,
): BuilderSection {
  const meta = SECTION_ROLE_META[role];
  return {
    id: `${role}-${crypto.randomUUID().slice(0, 8)}`,
    role,
    label: meta.label,
    optional: optional ?? (role !== "hook" && role !== "body"),
    includeInCaption: meta.includeInCaption,
    skipped: false,
    text,
  };
}

type CollectionAccent = {
  border: string;
  pillBg: string;
  pillFg: string;
  label: string;
};

const FALLBACK_COLLECTION_ACCENTS: CollectionAccent[] = [
  { border: "#0284c7", pillBg: "rgba(2, 132, 199, 0.12)", pillFg: "#0369a1", label: "Collection" },
  { border: "#7c3aed", pillBg: "rgba(124, 58, 237, 0.12)", pillFg: "#6d28d9", label: "Collection" },
  { border: "#0d9488", pillBg: "rgba(13, 148, 136, 0.12)", pillFg: "#0f766e", label: "Collection" },
  { border: "#b45309", pillBg: "rgba(180, 83, 9, 0.12)", pillFg: "#92400e", label: "Collection" },
];

function getCollectionAccent(name: string): CollectionAccent {
  const lower = name.toLowerCase();
  if (lower.includes("personal stor")) {
    return { border: "#d97706", pillBg: "rgba(217, 119, 6, 0.14)", pillFg: "#b45309", label: "Story" };
  }
  if (lower.includes("my offer") || lower.includes("offer")) {
    return { border: "#059669", pillBg: "rgba(5, 150, 105, 0.14)", pillFg: "#047857", label: "Offer" };
  }
  if (lower.includes("lead magnet")) {
    return { border: "#e11d48", pillBg: "rgba(225, 29, 72, 0.13)", pillFg: "#be123c", label: "Lead Magnet" };
  }
  if (lower.includes("website") || lower.includes("portfolio")) {
    return { border: "#2563eb", pillBg: "rgba(37, 99, 235, 0.13)", pillFg: "#1d4ed8", label: "Website" };
  }
  if (lower.includes("case breakdown")) {
    return { border: "#9333ea", pillBg: "rgba(147, 51, 234, 0.13)", pillFg: "#7e22ce", label: "Case Study" };
  }
  if (lower.includes("myth") || lower.includes("nuance")) {
    return { border: "#ea580c", pillBg: "rgba(234, 88, 12, 0.13)", pillFg: "#c2410c", label: "POV" };
  }
  if (lower.includes("behind the work")) {
    return { border: "#0891b2", pillBg: "rgba(8, 145, 178, 0.13)", pillFg: "#0e7490", label: "Process" };
  }
  if (lower.includes("founder-led") || lower.includes("founder video")) {
    return { border: "#7c3aed", pillBg: "rgba(124, 58, 237, 0.13)", pillFg: "#6d28d9", label: "Founder" };
  }
  if (lower.includes("writing") || lower.includes("content craft")) {
    return { border: "#475569", pillBg: "rgba(71, 85, 105, 0.13)", pillFg: "#334155", label: "Craft" };
  }
  if (lower.includes("buyer question") || lower.includes("objection")) {
    return { border: "#0d9488", pillBg: "rgba(13, 148, 136, 0.13)", pillFg: "#0f766e", label: "Buyer FAQ" };
  }
  if (lower.includes("service") || lower.includes("product")) {
    return { border: "#4f46e5", pillBg: "rgba(79, 70, 229, 0.14)", pillFg: "#4338ca", label: "Services & Products" };
  }
  if (lower.includes("short-form") || lower.includes("visual")) {
    return { border: "#0284c7", pillBg: "rgba(2, 132, 199, 0.13)", pillFg: "#0369a1", label: "Visual" };
  }
  if (lower.includes("discovery")) {
    return { border: "#0d9488", pillBg: "rgba(13, 148, 136, 0.13)", pillFg: "#0f766e", label: "Discovery" };
  }
  if (lower.includes("text bank")) {
    return { border: "#64748b", pillBg: "rgba(100, 116, 139, 0.14)", pillFg: "#475569", label: "Text Bank" };
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_COLLECTION_ACCENTS[hash % FALLBACK_COLLECTION_ACCENTS.length];
}

const ROLE_ACCENT_STYLES: Record<SectionRole, { bg: string; fg: string; border: string }> = {
  hook: { bg: "#b45309", fg: "#ffffff", border: "#d97706" },
  context: { bg: "#0f766e", fg: "#ffffff", border: "#0d9488" },
  body: { bg: "#1d4ed8", fg: "#ffffff", border: "#2563eb" },
  proof: { bg: "#92400e", fg: "#ffffff", border: "#b45309" },
  takeaway: { bg: "#3730a3", fg: "#ffffff", border: "#4f46e5" },
  question: { bg: "#6d28d9", fg: "#ffffff", border: "#7c3aed" },
  signoff: { bg: "#047857", fg: "#ffffff", border: "#059669" },
  hashtags: { bg: "#334155", fg: "#ffffff", border: "#475569" },
  graphic_note: { bg: "#4338ca", fg: "#ffffff", border: "#4f46e5" },
};

const ROLE_DISPLAY_LABELS: Record<SectionRole, string> = {
  hook: "Hook",
  context: "Context",
  body: "Core Message",
  proof: "Proof",
  takeaway: "Takeaway",
  question: "CTA Question",
  signoff: "Sign-off",
  hashtags: "Hashtags",
  graphic_note: "On-graphic Header",
};

type CopywritingFormatTab = "social" | "video" | "blogger" | "x";

const VIDEO_ROLE_LABELS: Record<SectionRole, string> = {
  hook: "Video Hook / SEO Title",
  context: "Intro / What You'll Learn",
  body: "Description / Key Takeaways",
  proof: "Example / Case Proof",
  takeaway: "Core Takeaway",
  question: "Primary CTA + Link",
  signoff: "Channel Bio / Links",
  hashtags: "Tags / Hashtags",
  graphic_note: "Thumbnail Text / Visual Note",
};

const BLOGGER_ROLE_LABELS: Record<SectionRole, string> = {
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

const X_ROLE_LABELS: Record<SectionRole, string> = {
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

function getCollectionFormatTab(col: BuilderCollection): CopywritingFormatTab {
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

function getRoleLabelForTab(tab: CopywritingFormatTab, role: SectionRole): string {
  if (tab === "blogger") return BLOGGER_ROLE_LABELS[role] ?? SECTION_ROLE_META[role].label;
  if (tab === "x") return X_ROLE_LABELS[role] ?? SECTION_ROLE_META[role].label;
  if (tab === "video") return VIDEO_ROLE_LABELS[role] ?? SECTION_ROLE_META[role].label;
  return ROLE_DISPLAY_LABELS[role] ?? SECTION_ROLE_META[role].label;
}

type TopicGroupKey =
  | "ANEXTVID Brand"
  | "Offers & Strategy"
  | "Production & Craft"
  | "Demo & Test"
  | "Custom";

function classifyTopicGroup(name: string): TopicGroupKey {
  const n = (name || "").toLowerCase();
  if (n.includes("[demo]") || n.includes("stage42") || n.includes("test bank")) {
    return "Demo & Test";
  }
  if (n.includes("anextvid")) {
    return "ANEXTVID Brand";
  }
  if (
    n.includes("offer") ||
    n.includes("service") ||
    n.includes("product") ||
    n.includes("lead") ||
    n.includes("website") ||
    n.includes("portfolio") ||
    n.includes("case") ||
    n.includes("buyer") ||
    n.includes("myth") ||
    n.includes("saas")
  ) {
    return "Offers & Strategy";
  }
  if (
    n.includes("story") ||
    n.includes("stories") ||
    n.includes("behind") ||
    n.includes("founder") ||
    n.includes("writing") ||
    n.includes("video") ||
    n.includes("shoot") ||
    n.includes("brand") ||
    n.includes("youtube") ||
    n.includes("listening") ||
    n.includes("start before")
  ) {
    return "Production & Craft";
  }
  return "Custom";
}

export function CopywritingStudio() {
  const { user } = useAuth();
  const { channels } = useChannels();
  const orgDisplayName = user?.orgName?.trim() || "ANEXTPOST";
  const orgDisplayHandle =
    user?.brandHandle?.trim() ||
    (user?.orgName ? `@${user.orgName.toLowerCase().replace(/[^a-z0-9_]/g, "")}` : "@anextpost");
  const orgTieInSnippets = useMemo<XTieInSnippet[]>(() => {
    const isAnextvidOrg =
      orgDisplayName.toLowerCase().includes("anextvid") ||
      orgDisplayHandle.toLowerCase().includes("anextvid");
    if (isAnextvidOrg) return X_TIEIN_SNIPPETS;
    const out: XTieInSnippet[] = [];
    if (user?.brandWebsite) {
      out.push({
        id: "org-website",
        label: "Website",
        category: "contact",
        targetRole: "signoff",
        note: "Org website link",
        text: `Learn more at ${user.brandWebsite}`,
      });
    }
    if (user?.brandEmail) {
      out.push({
        id: "org-email",
        label: "Contact Email",
        category: "contact",
        targetRole: "signoff",
        note: "Org contact email",
        text: `Questions or ideas? Reach out at ${user.brandEmail}`,
      });
    }
    if (user?.brandHandle) {
      out.push({
        id: "org-follow",
        label: "Follow CTA",
        category: "contact",
        targetRole: "signoff",
        note: "Follow handle CTA",
        text: `Follow ${user.brandHandle} for more updates.`,
      });
    }
    if (out.length === 0) {
      out.push({
        id: "org-reply-cta",
        label: "Reply CTA",
        category: "contact",
        targetRole: "question",
        note: "Generic conversation CTA",
        text: "Reply with your thoughts or questions below.",
      });
    }
    return out;
  }, [orgDisplayName, orgDisplayHandle, user?.brandWebsite, user?.brandEmail, user?.brandHandle]);

  const [state, setState] = useState<BuilderStateResponse>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [activeFormatTab, setActiveFormatTab] =
    useState<CopywritingFormatTab>("social");
  const [bloggerGuideOpen, setBloggerGuideOpen] = useState(false);
  const [bloggerPreviewMode, setBloggerPreviewMode] = useState<"formatted" | "raw">("formatted");
  const [xGuideOpen, setXGuideOpen] = useState(false);
  const [xPostMode, setXPostMode] = useState<XPostMode>("single");
  const [xPreviewMode, setXPreviewMode] = useState<"formatted" | "raw">("formatted");
  const [collectionsExpanded, setCollectionsExpanded] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [selectedPostTypeId, setSelectedPostTypeId] = useState<string>("");
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>(
    BUILTIN_FORMULAS[0].id,
  );
  const [length, setLength] = useState<BuilderLength>("short");
  const [sections, setSections] = useState<BuilderSection[]>(() =>
    BUILTIN_FORMULAS[0].sequences.short.map((s) =>
      makeSection(s.role, "", s.optional),
    ),
  );

  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [pasteTarget, setPasteTarget] = useState<{
    sectionId: string;
    role: SectionRole;
  } | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteSaving, setPasteSaving] = useState(false);

  const [collectionDialog, setCollectionDialog] = useState<{
    mode: "create" | "rename";
    initial: string;
  } | null>(null);
  const [collectionInput, setCollectionInput] = useState("");
  const [collectionBusy, setCollectionBusy] = useState(false);

  const [postTypeDialog, setPostTypeDialog] = useState<{
    mode: "create" | "rename";
    initial: string;
  } | null>(null);
  const [postTypeInput, setPostTypeInput] = useState("");
  const [postTypeBusy, setPostTypeBusy] = useState(false);

  const [addRole, setAddRole] = useState<SectionRole>("proof");
  const [composerOpen, setComposerOpen] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [confirmDeleteSamples, setConfirmDeleteSamples] = useState(false);

  const [expandedCollectionIds, setExpandedCollectionIds] = useState<Record<string, boolean>>({});
  const [buildFromScratchOpen, setBuildFromScratchOpen] = useState(false);
  const [editingVariationId, setEditingVariationId] = useState<string | null>(null);
  const [editingVariationText, setEditingVariationText] = useState("");
  const [savingVariationEdit, setSavingVariationEdit] = useState(false);
  const [inlineAddTarget, setInlineAddTarget] = useState<{ collectionId: string; role: SectionRole } | null>(null);
  const [inlineAddText, setInlineAddText] = useState("");
  const [inlineAddSaving, setInlineAddSaving] = useState(false);
  const [savingScratchCollection, setSavingScratchCollection] = useState(false);

  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvRows, setCsvRows] = useState<ParsedCopywritingRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBuilderState();
      setState(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load Copywriting Studio",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const formulas = useMemo(() => {
    const custom = state.formulas.map((f) => {
      let template: Omit<BuilderSection, "text">[] = [];
      try {
        template = JSON.parse(f.sectionsJson) as Omit<BuilderSection, "text">[];
      } catch {
        template = BUILTIN_FORMULAS[0].sequences.short;
      }
      return {
        id: f.id,
        name: f.name,
        sequences: {
          short: template,
          standard: template,
        } as Record<BuilderLength, Omit<BuilderSection, "text">[]>,
        isBuiltin: false,
      };
    });
    return [
      ...BUILTIN_FORMULAS.map((b) => ({
        id: b.id,
        name: b.name,
        sequences: b.sequences,
        isBuiltin: true,
      })),
      ...custom,
    ];
  }, [state.formulas]);

  const activeFormula = useMemo(
    () => formulas.find((f) => f.id === selectedFormulaId) ?? formulas[0],
    [formulas, selectedFormulaId],
  );

  const applyFormula = (
    formulaId: string,
    nextLength: BuilderLength = length,
  ) => {
    const f = formulas.find((item) => item.id === formulaId) ?? formulas[0];
    if (!f) return;
    const template = f.sequences[nextLength] ?? BUILTIN_FORMULAS[0].sequences[nextLength];
    setSections((prev) =>
      template.map((item) => {
        const existing = prev.find((s) => s.role === item.role);
        return makeSection(item.role, existing?.text ?? "", item.optional);
      }),
    );
  };

  const handleFormulaChange = (formulaId: string) => {
    setSelectedFormulaId(formulaId);
    applyFormula(formulaId, length);
  };

  const handleLengthChange = (nextLength: BuilderLength) => {
    setLength(nextLength);
    applyFormula(selectedFormulaId, nextLength);
  };

  const variationsForRole = useCallback(
    (role: SectionRole) => {
      return state.variations.filter((v) => {
        if (v.sectionRole !== role) return false;
        if (
          selectedCollectionId &&
          v.collectionId &&
          v.collectionId !== selectedCollectionId
        ) {
          return false;
        }
        if (
          selectedPostTypeId &&
          v.postTypeId &&
          v.postTypeId !== selectedPostTypeId
        ) {
          return false;
        }
        return true;
      });
    },
    [state.variations, selectedCollectionId, selectedPostTypeId],
  );

  const assembledText = useMemo(() => assemblePostText(sections), [sections]);
  const bloggerAnalysis = useMemo(
    () => parseBloggerMessage(assembledText),
    [assembledText],
  );
  const bloggerPreviewBlocks = useMemo(
    () => renderBloggerPreviewBlocks(bloggerAnalysis.body),
    [bloggerAnalysis.body],
  );
  const xAnalysis = useMemo(
    () => parseXMessage(assembledText, xPostMode),
    [assembledText, xPostMode],
  );

  const insertXTieInSnippet = (snippet: XTieInSnippet) => {
    setBuildFromScratchOpen(true);
    setSections((prev) => {
      const targetIdx = prev.findIndex((s) => s.role === snippet.targetRole);
      if (targetIdx !== -1) {
        return prev.map((s, idx) =>
          idx === targetIdx
            ? { ...s, includeInCaption: true, skipped: false, text: snippet.text }
            : s,
        );
      }
      return [
        ...prev,
        {
          ...makeSection(snippet.targetRole, snippet.text, true),
          includeInCaption: true,
          skipped: false,
        },
      ];
    });
    const roleLabel = getRoleLabelForTab(activeFormatTab, snippet.targetRole);
    setNotice(`Inserted "${snippet.label}" into ${roleLabel} section below.`);
    setTimeout(() => {
      document
        .querySelector('[data-testid="copywriting-build-from-scratch"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };
  const preferredComposerChannelIds = useMemo(() => {
    if (activeFormatTab === "blogger") {
      return channels.filter((c) => c.identifier === "blogger").map((c) => c.id);
    }
    if (activeFormatTab === "x") {
      return channels.filter((c) => c.identifier === "x").map((c) => c.id);
    }
    return [];
  }, [activeFormatTab, channels]);

  const sampleVariationCount = useMemo(
    () => state.variations.filter((v) => v.sampleBatch).length,
    [state.variations],
  );

  const moveSection = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    setSections((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const updateSectionText = (id: string, text: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, text } : s)),
    );
  };

  const toggleSkip = (id: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, skipped: !s.skipped } : s)),
    );
  };

  const removeSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const addSection = (role: SectionRole) => {
    setSections((prev) => [...prev, makeSection(role)]);
  };

  const saveSingleVariation = async (section: BuilderSection) => {
    const trimmed = (section.text ?? "").trim();
    if (!trimmed) return;
    setError(null);
    try {
      const res = await createBuilderVariations([
        {
          sectionRole: section.role,
          content: trimmed,
          collectionId: selectedCollectionId || null,
          postTypeId: selectedPostTypeId || null,
          lengthHint: length,
        },
      ]);
      setState((prev) => ({
        ...prev,
        variations: [...res.created, ...prev.variations],
      }));
      setNotice(`Saved "${section.label}" variation to library.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save variation",
      );
    }
  };

  const submitPasteVariations = async () => {
    if (!pasteTarget) return;
    const lines = pasteText
      .split(/\n{2,}|\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    setPasteSaving(true);
    setError(null);
    try {
      const res = await createBuilderVariations(
        lines.map((content) => ({
          sectionRole: pasteTarget.role,
          content,
          collectionId: selectedCollectionId || null,
          postTypeId: selectedPostTypeId || null,
          lengthHint: length,
        })),
      );
      setState((prev) => ({
        ...prev,
        variations: [...res.created, ...prev.variations],
      }));
      setNotice(
        `Saved ${res.count} ${SECTION_ROLE_META[pasteTarget.role].label.toLowerCase()} variations.`,
      );
      setPasteTarget(null);
      setPasteText("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save variations",
      );
    } finally {
      setPasteSaving(false);
    }
  };

  const handleDeleteVariation = async (id: string) => {
    setError(null);
    try {
      await deleteBuilderVariation(id);
      setState((prev) => ({
        ...prev,
        variations: prev.variations.filter((v) => v.id !== id),
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete variation",
      );
    }
  };

  const handleSaveVariationEdit = async (id: string) => {
    const content = editingVariationText.trim();
    if (!content) return;
    setSavingVariationEdit(true);
    setError(null);
    try {
      const updated = await updateBuilderVariation(id, { content });
      setState((prev) => ({
        ...prev,
        variations: prev.variations.map((v) => (v.id === id ? updated : v)),
      }));
      setEditingVariationId(null);
      setEditingVariationText("");
      setNotice("Updated reusable bank block.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update variation",
      );
    } finally {
      setSavingVariationEdit(false);
    }
  };

  const handleSaveInlineAdd = async () => {
    if (!inlineAddTarget) return;
    const content = inlineAddText.trim();
    if (!content) return;
    setInlineAddSaving(true);
    setError(null);
    try {
      const res = await createBuilderVariations([
        {
          sectionRole: inlineAddTarget.role,
          content,
          collectionId: inlineAddTarget.collectionId,
          postTypeId: selectedPostTypeId || null,
          lengthHint: length,
        },
      ]);
      setState((prev) => ({
        ...prev,
        variations: [...res.created, ...prev.variations],
      }));
      setInlineAddTarget(null);
      setInlineAddText("");
      setNotice(`Added new ${ROLE_DISPLAY_LABELS[inlineAddTarget.role]} block to collection.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add variation",
      );
    } finally {
      setInlineAddSaving(false);
    }
  };

  const handleSaveScratchToCollection = async () => {
    const filled = sections.filter((s) => !s.skipped && (s.text ?? "").trim().length > 0);
    if (filled.length === 0) return;
    setSavingScratchCollection(true);
    setError(null);
    try {
      const res = await createBuilderVariations(
        filled.map((s) => ({
          sectionRole: s.role,
          content: (s.text ?? "").trim(),
          collectionId: selectedCollectionId || null,
          postTypeId: selectedPostTypeId || null,
          lengthHint: length,
        })),
      );
      setState((prev) => ({
        ...prev,
        variations: [...res.created, ...prev.variations],
      }));
      setNotice(
        `Saved ${res.count} reusable block${res.count === 1 ? "" : "s"} to ${
          state.collections.find((c) => c.id === selectedCollectionId)?.name ?? "All / General"
        }.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save blocks to collection",
      );
    } finally {
      setSavingScratchCollection(false);
    }
  };

  const getFormatDescriptionTag = (tab: CopywritingFormatTab): string | undefined => {
    if (tab === "blogger") return "[format:blogger] Long-format Blogger collection";
    if (tab === "x") return "[format:x] Short-format X collection";
    if (tab === "video") return "[format:video] Video collection";
    return undefined;
  };

  const submitCollectionDialog = async () => {
    if (!collectionDialog) return;
    const name = collectionInput.trim();
    if (!name) return;
    setCollectionBusy(true);
    setError(null);
    try {
      if (collectionDialog.mode === "create") {
        const formatTag = getFormatDescriptionTag(activeFormatTab);
        const created: BuilderCollection = await createBuilderCollection(
          name,
          formatTag,
        );
        setState((prev) => ({
          ...prev,
          collections: [...prev.collections, created],
        }));
        setSelectedCollectionId(created.id);
        setNotice(`Created writing collection "${created.name}".`);
      } else if (selectedCollectionId) {
        const updated = await renameBuilderCollection(
          selectedCollectionId,
          name,
        );
        setState((prev) => ({
          ...prev,
          collections: prev.collections.map((c) =>
            c.id === updated.id ? updated : c,
          ),
        }));
        setNotice(`Renamed collection to "${updated.name}".`);
      }
      setCollectionDialog(null);
      setCollectionInput("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save collection",
      );
    } finally {
      setCollectionBusy(false);
    }
  };

  const submitPostTypeDialog = async () => {
    if (!postTypeDialog) return;
    const name = postTypeInput.trim();
    if (!name) return;
    setPostTypeBusy(true);
    setError(null);
    try {
      if (postTypeDialog.mode === "create") {
        const created: BuilderPostType = await createBuilderPostType(name);
        setState((prev) => ({
          ...prev,
          postTypes: [...prev.postTypes, created],
        }));
        setSelectedPostTypeId(created.id);
        setNotice(`Created post type "${created.name}".`);
      } else if (selectedPostTypeId) {
        const updated = await renameBuilderPostType(selectedPostTypeId, name);
        setState((prev) => ({
          ...prev,
          postTypes: prev.postTypes.map((p) =>
            p.id === updated.id ? updated : p,
          ),
        }));
        setNotice(`Renamed post type to "${updated.name}".`);
      }
      setPostTypeDialog(null);
      setPostTypeInput("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save post type",
      );
    } finally {
      setPostTypeBusy(false);
    }
  };

  const handleLoadSamples = async () => {
    setSampleBusy(true);
    setError(null);
    try {
      const res = await loadSampleExamples();
      await loadState();
      setNotice(
        res.createdVariations > 0
          ? `Loaded ${res.createdVariations} ANEXTVID Imported Example variations.`
          : "ANEXTVID Imported Examples are already loaded (no duplicates added).",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load sample examples",
      );
    } finally {
      setSampleBusy(false);
    }
  };

  const handleDeleteSamples = async () => {
    setSampleBusy(true);
    setError(null);
    try {
      const res = await deleteSampleExamples();
      setConfirmDeleteSamples(false);
      await loadState();
      setNotice(
        `Removed ${res.deletedVariations} imported example variations (your own items and drafts were kept).`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to remove imported examples",
      );
    } finally {
      setSampleBusy(false);
    }
  };

  const handleCsvFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCsvFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCopywritingCsv(text);
      setCsvRows(parsed.rows);
      setCsvErrors(parsed.errors);
    } catch (err) {
      setCsvRows([]);
      setCsvErrors([
        err instanceof Error ? err.message : "Could not read selected CSV file.",
      ]);
    }
  };

  const handleConfirmCsvImport = async () => {
    if (csvRows.length === 0) return;
    setCsvImporting(true);
    setError(null);
    try {
      const colByName = new Map(
        state.collections.map((c) => [c.name.trim().toLowerCase(), c]),
      );
      const ptByName = new Map(
        state.postTypes.map((p) => [p.name.trim().toLowerCase(), p]),
      );

      let createdCollections = 0;
      let createdPostTypes = 0;

      const formatTag = getFormatDescriptionTag(activeFormatTab);
      for (const row of csvRows) {
        if (row.collection) {
          const key = row.collection.toLowerCase();
          if (!colByName.has(key)) {
            const created = await createBuilderCollection(row.collection, formatTag);
            colByName.set(key, created);
            createdCollections += 1;
          }
        }
        if (row.postType) {
          const key = row.postType.toLowerCase();
          if (!ptByName.has(key)) {
            const created = await createBuilderPostType(row.postType);
            ptByName.set(key, created);
            createdPostTypes += 1;
          }
        }
      }

      const existingKeys = new Set(
        state.variations.map(
          (v) =>
            `${v.collectionId ?? ""}|${v.postTypeId ?? ""}|${v.sectionRole}|${v.content.trim()}`,
        ),
      );

      const toCreate: {
        sectionRole: SectionRole;
        content: string;
        collectionId: string | null;
        postTypeId: string | null;
        lengthHint: BuilderLength | null;
      }[] = [];
      let skippedDuplicates = 0;

      for (const row of csvRows) {
        const colId = row.collection
          ? colByName.get(row.collection.toLowerCase())?.id ?? null
          : null;
        const ptId = row.postType
          ? ptByName.get(row.postType.toLowerCase())?.id ?? null
          : null;
        const key = `${colId ?? ""}|${ptId ?? ""}|${row.sectionRole}|${row.content.trim()}`;
        if (existingKeys.has(key)) {
          skippedDuplicates += 1;
          continue;
        }
        existingKeys.add(key);
        toCreate.push({
          sectionRole: row.sectionRole,
          content: row.content,
          collectionId: colId,
          postTypeId: ptId,
          lengthHint: row.lengthHint,
        });
      }

      let createdCount = 0;
      if (toCreate.length > 0) {
        const res = await createBuilderVariations(toCreate);
        createdCount = res.count;
      }

      await loadState();
      const firstColName = csvRows.find((r) => r.collection)?.collection;
      if (firstColName) {
        const match = colByName.get(firstColName.toLowerCase());
        if (match) setSelectedCollectionId(match.id);
      }

      setCsvModalOpen(false);
      setCsvFileName("");
      setCsvRows([]);
      setCsvErrors([]);
      setNotice(
        `Imported ${createdCount} copywriting block${createdCount === 1 ? "" : "s"}` +
          (createdCollections > 0 ? `, ${createdCollections} collection${createdCollections === 1 ? "" : "s"}` : "") +
          (createdPostTypes > 0 ? `, ${createdPostTypes} post type${createdPostTypes === 1 ? "" : "s"}` : "") +
          (skippedDuplicates > 0 ? ` (${skippedDuplicates} duplicate${skippedDuplicates === 1 ? "" : "s"} skipped)` : "") +
          ".",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to import copywriting CSV",
      );
    } finally {
      setCsvImporting(false);
    }
  };

  const copyPreview = async () => {
    if (!assembledText) return;
    try {
      await navigator.clipboard.writeText(assembledText);
      setNotice("Copied assembled post to clipboard.");
    } catch {
      setNotice("Copy failed — select from preview instead.");
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
          const blob = await res.blob();
          const file = new File([blob], m.name || "attachment.png", {
            type: blob.type || "image/png",
          });
          const uploaded = await uploadMedia(file);
          uploadedMedia.push({
            id: uploaded.id ?? uploaded.path,
            path: uploaded.path,
          });
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

      await createPost({
        type: mode,
        date: isoDate,
        channelIds: effectiveChannelIds,
        body: (post.body ?? "").trim(),
        perChannelBody: post.perChannelBody ?? {},
        threadParts: post.threadParts ?? [],
        media: uploadedMedia,
      });
      setComposerOpen(false);
      setNotice(
        mode === "draft"
          ? "Saved as an unpublished draft in 5 Posts."
          : mode === "schedule"
            ? "Post scheduled on 6 Schedule."
            : "Post queued for immediate publishing.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit post to composer",
      );
    }
  };

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const tabCollections = useMemo(
    () =>
      state.collections.filter(
        (c) => getCollectionFormatTab(c) === activeFormatTab,
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
      state.collections.filter((c) => getCollectionFormatTab(c) === "social")
        .length,
    [state.collections],
  );
  const videoCount = useMemo(
    () =>
      state.collections.filter((c) => getCollectionFormatTab(c) === "video")
        .length,
    [state.collections],
  );
  const bloggerCount = useMemo(
    () =>
      state.collections.filter((c) => getCollectionFormatTab(c) === "blogger")
        .length,
    [state.collections],
  );
  const xCount = useMemo(
    () =>
      state.collections.filter((c) => getCollectionFormatTab(c) === "x").length,
    [state.collections],
  );

  const handleFormatTabChange = (tab: CopywritingFormatTab) => {
    setActiveFormatTab(tab);
    setSelectedCollectionId("");
    if (tab === "blogger") {
      setSelectedFormulaId("builtin-blogger-article");
      setLength("standard");
      const bloggerPreset = BUILTIN_FORMULAS.find((f) => f.id === "builtin-blogger-article");
      if (bloggerPreset) {
        setSections(
          bloggerPreset.sequences.standard.map((s) => ({
            ...makeSection(s.role, "", s.optional),
            label: s.label,
            includeInCaption: s.includeInCaption,
            skipped: s.skipped,
          })),
        );
      }
    } else if (tab === "video") {
      setSelectedFormulaId("builtin-video-shorts");
      setLength("standard");
      const videoPreset = BUILTIN_FORMULAS.find((f) => f.id === "builtin-video-shorts");
      if (videoPreset) {
        setSections(
          videoPreset.sequences.standard.map((s) => ({
            ...makeSection(s.role, "", s.optional),
            label: s.label,
            includeInCaption: s.includeInCaption,
            skipped: s.skipped,
          })),
        );
      }
    } else if (tab === "x") {
      setSelectedFormulaId("builtin-x-single");
      setLength("short");
      const xPreset = BUILTIN_FORMULAS.find((f) => f.id === "builtin-x-single");
      if (xPreset) {
        setSections(
          xPreset.sequences.short.map((s) => ({
            ...makeSection(s.role, "", s.optional),
            label: s.label,
            includeInCaption: s.includeInCaption,
            skipped: s.skipped,
          })),
        );
      }
    } else {
      setSelectedFormulaId(BUILTIN_FORMULAS[0].id);
      applyFormula(BUILTIN_FORMULAS[0].id, length);
    }
  };

  const activeTheme = FORMAT_TAB_THEMES[activeFormatTab];

  return (
    <section
      className={styles.root}
      data-testid={`copywriting-workspace-${activeFormatTab}`}
      style={{
        background: activeTheme.backgroundWash,
        border: `1px solid ${activeTheme.borderColor}`,
        borderRadius: 16,
        padding: 18,
        transition: "background 0.2s ease, border-color 0.2s ease",
      }}
    >
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className={styles.eyebrow}>2 Copywriting</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                background: activeTheme.badgeBackground,
                color: activeTheme.badgeText,
                border: `1px solid ${activeTheme.borderColor}`,
              }}
            >
              {activeTheme.label}
            </span>
            <WorkspaceBadge compact />
          </div>
          <h1 className={styles.h1}>Writing collections &amp; reusable blocks</h1>
          <p className={styles.subtitle}>
            Organise hooks, bodies, questions, sign-offs, and hashtags by collection, test single posts, or bulk-import blocks via CSV.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Link
            href={`/builder?tab=${activeFormatTab}`}
            className="anext-btn-secondary"
            data-testid="copywriting-open-builder-link"
            style={{
              textDecoration: "none",
              borderColor: activeTheme.borderColor,
              color: activeTheme.badgeText,
            }}
          >
            Build in 3 Post Builder →
          </Link>
          <button
            type="button"
            className="anext-btn-primary"
            data-testid="copywriting-import-csv-btn"
            onClick={() => {
              setCsvErrors([]);
              setCsvModalOpen(true);
            }}
          >
            Import Copywriting CSV
          </button>
          <button
            type="button"
            className="anext-btn-secondary"
            data-testid="copywriting-template-btn"
            onClick={downloadCopywritingTemplateCsv}
          >
            Download Template CSV
          </button>
          <button
            type="button"
            className="anext-btn-secondary"
            data-testid="copywriting-load-examples-btn"
            disabled={sampleBusy}
            onClick={() => void handleLoadSamples()}
          >
            {sampleBusy ? "Loading…" : "Load starter examples"}
          </button>
          {sampleVariationCount > 0 && (
            <button
              type="button"
              className="anext-btn-secondary"
              data-testid="copywriting-delete-examples-btn"
              disabled={sampleBusy}
              onClick={() => setConfirmDeleteSamples(true)}
            >
              Delete all imported examples ({sampleVariationCount})
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className={styles.noticeBanner} role="status">
          <span>{notice}</span>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Format Tabs: LinkedIn/FB/IG (Feed) · Blogger (Long Format) · X (Short Format) */}
      <div
        role="tablist"
        aria-label="Copywriting format"
        data-testid="copywriting-format-tabs"
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
            data-testid="copywriting-tab-social"
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
            data-testid="copywriting-tab-video"
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
            data-testid="copywriting-tab-blogger"
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
            data-testid="copywriting-tab-x"
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
            data-testid="copywriting-blogger-blueprint"
            style={{
              border: "1px solid rgba(249, 115, 22, 0.35)",
              borderLeft: "4px solid #f97316",
              borderRadius: 10,
              padding: "10px 14px",
              background: "rgba(249, 115, 22, 0.06)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 12.5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                <PlatformIcon platform="Blogger" size={15} />
                <span>How High-Converting Blogger Articles Are Constructed</span>
              </div>
              <button
                type="button"
                className={styles.smallBtn}
                data-testid="copywriting-blogger-guide-toggle"
                aria-expanded={bloggerGuideOpen}
                onClick={() => setBloggerGuideOpen((prev) => !prev)}
              >
                {bloggerGuideOpen ? "Hide Guide ▾" : "Writing Guide & Syntax ▸"}
              </button>
            </div>
            <div style={{ color: "var(--muted)", lineHeight: 1.55 }}>
              1. <strong>SEO Headline</strong> (Line 1 becomes Blogger Title) → 2. <strong>PAS / Story Intro + Early Internal Link</strong> → 3. <strong>Scannable H2/H3 Body + Bullets + Links</strong> (supports <code>## Heading</code>, <code>### Subheading</code>, <code>- bullet</code>, <code>**bold**</code>, <code>[Anchor](https://...)</code>) → 4. <strong>Contextual Product Placement + Proof</strong> → 5. <strong>Lead Magnet Bridge</strong> → 6. <strong>Primary CTA + Next-Read Link</strong> → 7. <strong>Author Bio</strong> → 8. <strong>Labels</strong> (<code>Labels: Tag 1, Tag 2</code>).
            </div>
            {bloggerGuideOpen && (
              <div
                data-testid="copywriting-blogger-guide-panel"
                style={{
                  marginTop: 6,
                  paddingTop: 10,
                  borderTop: "1px solid rgba(249, 115, 22, 0.22)",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: 8,
                }}
              >
                {BLOGGER_WRITING_GUIDE.map((item) => (
                  <div
                    key={item.step}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "var(--bg-elevated, var(--bg))",
                      border: "1px solid var(--line-soft)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                      <strong style={{ fontSize: 12 }}>{item.step}</strong>
                      <span style={{ fontSize: 11, color: "#c2410c", fontWeight: 600 }}>{item.target}</span>
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
                      {item.tip}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeFormatTab === "x" && (
          <div
            data-testid="copywriting-x-blueprint"
            style={{
              border: "1px solid rgba(100, 116, 139, 0.35)",
              borderLeft: "4px solid #0f172a",
              borderRadius: 10,
              padding: "10px 14px",
              background: "rgba(15, 23, 42, 0.05)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12.5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                <PlatformIcon platform="X" size={14} />
                <span>How High-Performing X Posts &amp; Threads Are Constructed (280 weighted chars)</span>
              </div>
              <button
                type="button"
                className={styles.smallBtn}
                data-testid="copywriting-x-guide-toggle"
                aria-expanded={xGuideOpen}
                onClick={() => setXGuideOpen((prev) => !prev)}
              >
                {xGuideOpen ? "Hide Guide ▾" : "Writing Guide & X Rules ▸"}
              </button>
            </div>
            <div style={{ color: "var(--muted)", lineHeight: 1.55 }}>
              1. <strong>Scroll-Stopping Hook</strong> (first ~80 chars) → 2. <strong>Tight Core Take</strong> → 3. <strong>1-Line Proof / BTS</strong> → 4. <strong>Reply-Bait CTA</strong> → 5. <strong>0–1 Tag</strong>. Every URL counts as <strong>23 chars</strong> via <code>t.co</code>; drop YouTube or Calendly links in the <strong>first reply</strong> for maximum reach.
            </div>
            <div
              data-testid="copywriting-x-tiein-bar"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
                paddingTop: 4,
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)" }}>
                Quick-insert tie-in:
              </span>
              {orgTieInSnippets.map((snippet) => (
                <button
                  key={snippet.id}
                  type="button"
                  className={styles.smallBtn}
                  title={`${snippet.note} — inserts into ${snippet.targetRole}`}
                  onClick={() => insertXTieInSnippet(snippet)}
                  style={{ fontSize: 11.5, padding: "3px 9px" }}
                >
                  + {snippet.label}
                </button>
              ))}
            </div>
            {xGuideOpen && (
              <div
                data-testid="copywriting-x-guide-panel"
                style={{
                  marginTop: 4,
                  paddingTop: 10,
                  borderTop: "1px solid rgba(100, 116, 139, 0.22)",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: 8,
                }}
              >
                {X_WRITING_GUIDE.map((item) => (
                  <div
                    key={item.step}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "var(--bg-elevated, var(--bg))",
                      border: "1px solid var(--line-soft)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                      <strong style={{ fontSize: 12 }}>{item.step}</strong>
                      <span style={{ fontSize: 11, color: "#0f172a", fontWeight: 600 }}>{item.target}</span>
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
                      {item.tip}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Writing Collections bar (compact by default, expandable grouped drawer) */}
      <div className={styles.controlBar} data-testid="copywriting-collections-bar">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span className={styles.fieldLabel}>
            Writing Collections ({tabVariationCount} blocks in tab · {state.variations.length} total)
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="search"
              aria-label="Search topics"
              data-testid="copywriting-topic-search"
              placeholder="Search topics…"
              value={collectionSearch}
              onChange={(e) => setCollectionSearch(e.target.value)}
              style={{
                padding: "4px 9px",
                borderRadius: 8,
                border: "1px solid var(--line-soft)",
                background: "var(--bg)",
                color: "var(--fg)",
                fontSize: 12,
                width: 170,
              }}
            />
            {tabCollections.length > 4 && (
              <button
                type="button"
                className={styles.smallBtn}
                data-testid="copywriting-toggle-topics-btn"
                aria-expanded={collectionsExpanded || Boolean(collectionSearch.trim())}
                onClick={() => setCollectionsExpanded((prev) => !prev)}
              >
                {collectionsExpanded || collectionSearch.trim()
                  ? "Hide topics ▴"
                  : `Show all ${tabCollections.length} topics ▾`}
              </button>
            )}
            <button
              type="button"
              className={styles.smallBtn}
              data-testid="copywriting-new-collection-btn"
              onClick={() => {
                setCollectionInput("");
                setCollectionDialog({ mode: "create", initial: "" });
              }}
            >
              + New collection
            </button>
            {selectedCollectionId && (
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => {
                  const col = state.collections.find((c) => c.id === selectedCollectionId);
                  setCollectionInput(col?.name ?? "");
                  setCollectionDialog({ mode: "rename", initial: col?.name ?? "" });
                }}
              >
                Rename
              </button>
            )}
          </div>
        </div>

        {/* Compact single-row quick strip */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setSelectedCollectionId("")}
            className={!selectedCollectionId ? "anext-btn-primary" : "anext-btn-secondary"}
            style={{ padding: "5px 10px", fontSize: 12 }}
          >
            All ({tabVariationCount})
          </button>
          {!collectionsExpanded && !collectionSearch.trim() && (() => {
            const activeCol = selectedCollectionId
              ? tabCollections.find((c) => c.id === selectedCollectionId)
              : null;
            const quickPills = activeCol
              ? [activeCol, ...tabCollections.filter((c) => c.id !== activeCol.id).slice(0, 3)]
              : tabCollections.slice(0, 4);
            return quickPills.map((c) => {
              const count = state.variations.filter((v) => v.collectionId === c.id).length;
              const active = selectedCollectionId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`copywriting-collection-pill-${c.name}`}
                  onClick={() => setSelectedCollectionId(c.id)}
                  className={active ? "anext-btn-primary" : "anext-btn-secondary"}
                  style={{ padding: "5px 10px", fontSize: 12 }}
                >
                  {c.name} ({count})
                </button>
              );
            });
          })()}
          {!collectionsExpanded && !collectionSearch.trim() && tabCollections.length > 4 && (
            <button
              type="button"
              className={styles.smallBtn}
              onClick={() => setCollectionsExpanded(true)}
              style={{ fontSize: 12, color: "var(--muted)" }}
            >
              +{tabCollections.length - 4} more…
            </button>
          )}
        </div>

        {/* Expanded grouped topic drawer */}
        {(collectionsExpanded || Boolean(collectionSearch.trim())) && (
          <div
            data-testid="copywriting-topics-drawer"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              paddingTop: 10,
              marginTop: 4,
              borderTop: "1px solid var(--line-soft)",
            }}
          >
            {(() => {
              const q = collectionSearch.trim().toLowerCase();
              const matching = q
                ? tabCollections.filter((c) => c.name.toLowerCase().includes(q))
                : tabCollections;
              if (matching.length === 0) {
                return (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    No topics match &ldquo;{collectionSearch}&rdquo;.
                  </span>
                );
              }
              const groupOrder: TopicGroupKey[] = [
                "ANEXTVID Brand",
                "Offers & Strategy",
                "Production & Craft",
                "Custom",
                "Demo & Test",
              ];
              return groupOrder
                .map((groupName) => {
                  const items = matching.filter(
                    (c) => classifyTopicGroup(c.name) === groupName,
                  );
                  if (items.length === 0) return null;
                  return (
                    <div
                      key={groupName}
                      style={{ display: "flex", flexDirection: "column", gap: 6 }}
                    >
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: "var(--muted)",
                        }}
                      >
                        {groupName} ({items.length})
                      </span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {items.map((c) => {
                          const count = state.variations.filter(
                            (v) => v.collectionId === c.id,
                          ).length;
                          const active = selectedCollectionId === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              data-testid={`copywriting-collection-pill-${c.name}`}
                              onClick={() => {
                                setSelectedCollectionId(c.id);
                                setCollectionsExpanded(false);
                              }}
                              className={active ? "anext-btn-primary" : "anext-btn-secondary"}
                              style={{ padding: "4px 10px", fontSize: 12 }}
                            >
                              {c.name} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
                .filter(Boolean);
            })()}
          </div>
        )}
      </div>

      {/* Stacked Writing Collections (All Media-style) */}
      {!loading && tabCollections.length === 0 && (
        <div
          style={{
            padding: "20px 16px",
            borderRadius: 12,
            border: "1px dashed var(--line-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            fontSize: 13,
            color: "var(--muted)",
          }}
        >
          <span>No writing collections in this tab yet. Create one, import a CSV, or load starter examples.</span>
          <button
            type="button"
            className="anext-btn-secondary"
            onClick={() => {
              setCollectionInput("");
              setCollectionDialog({ mode: "create", initial: "" });
            }}
          >
            + New collection
          </button>
        </div>
      )}
      {!loading && tabCollections.length > 0 && (
        <div className={mediaStyles.sectionsStack} data-testid="copywriting-stacked-collections">
          {(selectedCollectionId
            ? tabCollections.filter((c) => c.id === selectedCollectionId)
            : tabCollections
          ).map((col) => {
            const colVars = state.variations.filter((v) => v.collectionId === col.id);
            const matchedFormula =
              state.formulas.find((f) => f.collectionId === col.id) ?? null;
            let formulaRoles: SectionRole[] = BUILTIN_FORMULAS[0].sequences.short.map((s) => s.role);
            if (matchedFormula) {
              try {
                const parsed = JSON.parse(matchedFormula.sectionsJson) as Array<{ role: SectionRole }>;
                if (Array.isArray(parsed) && parsed.length > 0) {
                  formulaRoles = parsed.map((s) => s.role);
                }
              } catch {
                // fallback to builtin
              }
            }
            const orderedRoles: SectionRole[] = [
              ...formulaRoles.filter(
                (r, idx) => formulaRoles.indexOf(r) === idx && colVars.some((v) => v.sectionRole === r),
              ),
              ...(Object.keys(SECTION_ROLE_META) as SectionRole[]).filter(
                (r) => !formulaRoles.includes(r) && colVars.some((v) => v.sectionRole === r),
              ),
            ];
            const graphicItem = colVars.find((v) => v.sectionRole === "graphic_note") ?? null;
            const previewSections: BuilderSection[] = orderedRoles.map((role) => {
              const first = colVars.find((v) => v.sectionRole === role);
              return makeSection(role, first?.content ?? "", false);
            });
            const assembledCaption = assemblePostText(previewSections);
            const accent = getCollectionAccent(col.name);
            const isExpanded = Boolean(expandedCollectionIds[col.id]);
            return (
              <section
                key={col.id}
                className={mediaStyles.sectionCard}
                data-testid={`copywriting-stacked-section-${col.name}`}
                style={{
                  border: `1px solid ${accent.border}55`,
                  borderLeft: `5px solid ${accent.border}`,
                  background: accent.pillBg.replace(/0\.1[0-9]\)/, "0.07)"),
                }}
              >
                <div className={mediaStyles.sectionHeader}>
                  <div className={mediaStyles.sectionHeadingGroup}>
                    <span
                      data-testid="copywriting-collection-badge"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: accent.border,
                        color: "#ffffff",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {accent.label}
                    </span>
                    <h2 className={mediaStyles.sectionTitle}>{col.name}</h2>
                    <span className={mediaStyles.sectionCount}>
                      {colVars.length} {colVars.length === 1 ? "block" : "blocks"}
                      {matchedFormula ? ` · ${matchedFormula.name}` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      data-testid={`copywriting-collection-toggle-${col.name}`}
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedCollectionIds((prev) => ({
                          ...prev,
                          [col.id]: !prev[col.id],
                        }))
                      }
                    >
                      {isExpanded ? "Collapse ▾" : "Expand ▸"}
                    </button>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => {
                        setSelectedCollectionId(col.id);
                        setBuildFromScratchOpen(true);
                        setTimeout(() => {
                          document
                            .querySelector('[data-testid="copywriting-build-from-scratch"]')
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }, 50);
                      }}
                    >
                      Draft single post ↓
                    </button>
                  </div>
                </div>

                {expandedCollectionIds[col.id] && (orderedRoles.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span>No blocks in this collection yet.</span>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => {
                        setInlineAddTarget({ collectionId: col.id, role: "hook" });
                        setInlineAddText("");
                      }}
                    >
                      + Add Hook
                    </button>
                  </div>
                ) : (
                  <div className={styles.collectionBodyGrid}>
                    <div
                      data-testid="copywriting-numbered-stack"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {orderedRoles.map((role, stepIdx) => {
                        const items = colVars.filter((v) => v.sectionRole === role);
                        const roleStyle = ROLE_ACCENT_STYLES[role] ?? {
                          bg: "#334155",
                          fg: "#ffffff",
                          border: "#475569",
                        };
                        const roleLabel = getRoleLabelForTab(activeFormatTab, role);
                        const isAddingHere =
                          inlineAddTarget?.collectionId === col.id &&
                          inlineAddTarget?.role === role;
                        return (
                          <div
                            key={role}
                            style={{
                              border: `1px solid ${roleStyle.border}44`,
                              borderLeft: `3px solid ${roleStyle.border}`,
                              borderRadius: 10,
                              padding: "10px 12px",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              background: "var(--bg)",
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
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span
                                  data-testid={`copywriting-role-label-${role}`}
                                  style={{
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    padding: "3px 10px",
                                    borderRadius: 999,
                                    background: roleStyle.bg,
                                    color: roleStyle.fg,
                                    letterSpacing: "0.01em",
                                  }}
                                >
                                  {stepIdx + 1}. {roleLabel} ({items.length})
                                </span>
                                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                                  Reusable bank blocks
                                </span>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  type="button"
                                  className={styles.smallBtn}
                                  data-testid={`copywriting-add-inline-${col.name}-${role}`}
                                  onClick={() => {
                                    setInlineAddTarget(
                                      isAddingHere ? null : { collectionId: col.id, role },
                                    );
                                    setInlineAddText("");
                                  }}
                                >
                                  {isAddingHere ? "Cancel" : "+ Add variation"}
                                </button>
                                <button
                                  type="button"
                                  className={styles.smallBtn}
                                  onClick={() => {
                                    setSelectedCollectionId(col.id);
                                    const target = sections.find((s) => s.role === role);
                                    setPasteTarget({
                                      sectionId: target?.id ?? role,
                                      role,
                                    });
                                    setPasteText("");
                                  }}
                                >
                                  + Paste
                                </button>
                              </div>
                            </div>
                            {isAddingHere && (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 6,
                                  padding: "8px 0",
                                  borderTop: "1px solid var(--line-soft)",
                                }}
                              >
                                <textarea
                                  className={styles.textarea}
                                  rows={2}
                                  data-testid={`copywriting-add-inline-input-${role}`}
                                  placeholder={`Add reusable ${roleLabel} block to ${col.name}…`}
                                  value={inlineAddText}
                                  onChange={(e) => setInlineAddText(e.target.value)}
                                />
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  <button
                                    type="button"
                                    className="anext-btn-primary"
                                    style={{ padding: "4px 10px", fontSize: 12 }}
                                    data-testid={`copywriting-add-inline-save-${role}`}
                                    disabled={inlineAddSaving || !inlineAddText.trim()}
                                    onClick={() => void handleSaveInlineAdd()}
                                  >
                                    {inlineAddSaving ? "Saving…" : "Save to bank"}
                                  </button>
                                </div>
                              </div>
                            )}
                            {items.map((item) => {
                              const isEditing = editingVariationId === item.id;
                              return (
                                <div
                                  key={item.id}
                                  data-testid={`copywriting-bank-item-${item.id}`}
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                    fontSize: 12,
                                    color: "var(--muted)",
                                    borderTop: "1px solid var(--line-soft)",
                                    paddingTop: 6,
                                  }}
                                >
                                  {isEditing ? (
                                    <>
                                      <textarea
                                        className={styles.textarea}
                                        rows={2}
                                        data-testid="copywriting-edit-variation-input"
                                        value={editingVariationText}
                                        onChange={(e) => setEditingVariationText(e.target.value)}
                                      />
                                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                        <button
                                          type="button"
                                          className={styles.smallBtn}
                                          onClick={() => {
                                            setEditingVariationId(null);
                                            setEditingVariationText("");
                                          }}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          className="anext-btn-primary"
                                          style={{ padding: "4px 10px", fontSize: 12 }}
                                          data-testid="copywriting-save-variation-edit"
                                          disabled={savingVariationEdit || !editingVariationText.trim()}
                                          onClick={() => void handleSaveVariationEdit(item.id)}
                                        >
                                          {savingVariationEdit ? "Saving…" : "Save block"}
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 8,
                                      }}
                                    >
                                      <span
                                        style={{
                                          flex: 1,
                                          color: "var(--fg)",
                                          whiteSpace: "pre-wrap",
                                          lineHeight: 1.4,
                                        }}
                                      >
                                        {item.content}
                                      </span>
                                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                        <button
                                          type="button"
                                          className={styles.smallBtn}
                                          data-testid={`copywriting-edit-variation-${item.id}`}
                                          style={{ padding: "2px 7px", fontSize: 11 }}
                                          onClick={() => {
                                            setEditingVariationId(item.id);
                                            setEditingVariationText(item.content);
                                          }}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          className={styles.smallBtn}
                                          style={{ padding: "2px 7px", fontSize: 11 }}
                                          onClick={() => void handleDeleteVariation(item.id)}
                                        >
                                          Delete
                                        </button>
                                        <button
                                          type="button"
                                          className={styles.smallBtn}
                                          style={{ padding: "2px 7px", fontSize: 11 }}
                                          onClick={() => {
                                            setSelectedCollectionId(col.id);
                                            setBuildFromScratchOpen(true);
                                            setSections((prev) => {
                                              const idx = prev.findIndex((s) => s.role === role);
                                              if (idx !== -1) {
                                                return prev.map((s, i) =>
                                                  i === idx
                                                    ? { ...s, skipped: false, text: item.content }
                                                    : s,
                                                );
                                              }
                                              return [...prev, makeSection(role, item.content)];
                                            });
                                            setTimeout(() => {
                                              document
                                                .querySelector('[data-testid="copywriting-build-from-scratch"]')
                                                ?.scrollIntoView({ behavior: "smooth", block: "start" });
                                            }, 50);
                                          }}
                                        >
                                          Use in draft
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>

                    <aside
                      className={styles.collectionPreviewPane}
                      data-testid="copywriting-assembled-preview"
                    >
                      <span className={styles.fieldLabel}>
                        Assembled Example Preview
                      </span>
                      {graphicItem && (
                        <div
                          data-testid="copywriting-preview-graphic-overlay"
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px dashed var(--accent)",
                            background: "var(--selection-bg)",
                            fontSize: 12,
                          }}
                        >
                          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "var(--accent)", marginBottom: 3 }}>
                            Graphic Overlay (Not in caption)
                          </div>
                          <div style={{ color: "var(--fg)", fontWeight: 600 }}>
                            {graphicItem.content}
                          </div>
                        </div>
                      )}
                      <div
                        data-testid="copywriting-preview-caption"
                        style={{
                          fontSize: 12.5,
                          lineHeight: 1.5,
                          color: "var(--fg)",
                          whiteSpace: "pre-wrap",
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "1px solid var(--line-soft)",
                          background: "rgb(var(--tint) / 0.02)",
                        }}
                      >
                        {assembledCaption || "Add caption blocks to see the assembled post preview."}
                      </div>
                    </aside>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}

      {/* Build from Scratch (collapsible bottom work area) */}
      <section
        data-testid="copywriting-build-from-scratch"
        style={{
          marginTop: 24,
          paddingTop: 20,
          borderTop: "2px solid var(--line-soft)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid var(--line-soft)",
            background: "var(--bg-elevated, var(--bg))",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Build from Scratch
            </h2>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              Author new blocks and save them into a collection, or assemble a single-post draft.
            </span>
          </div>
          <button
            type="button"
            className={styles.smallBtn}
            data-testid="copywriting-build-from-scratch-toggle"
            aria-expanded={buildFromScratchOpen}
            onClick={() => setBuildFromScratchOpen((prev) => !prev)}
          >
            {buildFromScratchOpen ? "Collapse ▾" : "Open ▸"}
          </button>
        </div>

        {buildFromScratchOpen && (
          <>
            {/* Collection, Writing Style (Post Type), Formula, Length */}
            <div className={styles.toolbar}>
              <div className={styles.toolbarGroup}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="cw-collection">
                    Target Collection
                  </label>
                  <div className={styles.controlRow}>
                    <select
                      id="cw-collection"
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
                      className={styles.smallBtn}
                      onClick={() => {
                        setCollectionInput("");
                        setCollectionDialog({ mode: "create", initial: "" });
                      }}
                    >
                      + New
                    </button>
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="cw-post-type">
                    Writing Style / Post Type
                  </label>
            <div className={styles.controlRow}>
              <select
                id="cw-post-type"
                className={styles.select}
                value={selectedPostTypeId}
                onChange={(e) => setSelectedPostTypeId(e.target.value)}
              >
                <option value="">All post types</option>
                {state.postTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => {
                  setPostTypeInput("");
                  setPostTypeDialog({ mode: "create", initial: "" });
                }}
              >
                + New
              </button>
              {selectedPostTypeId && (
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={() => {
                    const pt = state.postTypes.find((p) => p.id === selectedPostTypeId);
                    setPostTypeInput(pt?.name ?? "");
                    setPostTypeDialog({ mode: "rename", initial: pt?.name ?? "" });
                  }}
                >
                  Rename
                </button>
              )}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="cw-formula">
              Formula
            </label>
            <select
              id="cw-formula"
              className={styles.select}
              value={activeFormula?.id ?? ""}
              onChange={(e) => handleFormulaChange(e.target.value)}
            >
              {formulas
                .filter((f) => {
                  if (!f.isBuiltin) return true;
                  if (activeFormatTab === "blogger") return f.id === "builtin-blogger-article";
                  if (activeFormatTab === "x") return f.id.startsWith("builtin-x-");
                  return f.id !== "builtin-blogger-article" && !f.id.startsWith("builtin-x-");
                })
                .map((f) => (
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
                styles.segment + (length === "standard" ? " " + styles.segmentActive : "")
              }
              onClick={() => handleLengthChange("standard")}
            >
              Standard
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Loading copywriting blocks…
        </div>
      ) : (
        <div className={styles.workspaceGrid}>
          <div className={styles.sectionStack} data-testid="copywriting-section-stack">
            {sections.map((section, idx) => {
              const roleVars = variationsForRole(section.role);
              const pickerOpen = openPickerId === section.id;
              return (
                <article
                  key={section.id}
                  className={
                    styles.sectionCard +
                    (section.skipped ? " " + styles.sectionCardSkipped : "")
                  }
                >
                  <div className={styles.cardHeader}>
                    <div className={styles.cardTitleGroup}>
                      <span className={styles.orderBadge}>{idx + 1}</span>
                      <span className={styles.cardTitle}>{section.label}</span>
                      {section.optional && (
                        <span className={styles.optionalPill}>Optional</span>
                      )}
                      {!section.includeInCaption && (
                        <span className={styles.optionalPill}>Graphic note</span>
                      )}
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.smallBtn}
                        disabled={idx === 0}
                        aria-label={`Move ${section.label} up`}
                        onClick={() => moveSection(idx, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.smallBtn}
                        disabled={idx === sections.length - 1}
                        aria-label={`Move ${section.label} down`}
                        onClick={() => moveSection(idx, 1)}
                      >
                        ↓
                      </button>
                      {section.optional && (
                        <button
                          type="button"
                          className={styles.smallBtn}
                          onClick={() => toggleSkip(section.id)}
                        >
                          {section.skipped ? "Include" : "Skip"}
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.smallBtn}
                        aria-label={`Remove ${section.label}`}
                        onClick={() => removeSection(section.id)}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {!section.skipped && (
                    <>
                      <textarea
                        className={styles.textarea}
                        placeholder={SECTION_ROLE_META[section.role].hint}
                        value={section.text ?? ""}
                        onChange={(e) =>
                          updateSectionText(section.id, e.target.value)
                        }
                      />

                      <div className={styles.cardFooter}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className={styles.smallBtn}
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
                            className={styles.smallBtn}
                            onClick={() => {
                              setPasteTarget({
                                sectionId: section.id,
                                role: section.role,
                              });
                              setPasteText("");
                            }}
                          >
                            Paste variations
                          </button>
                          <button
                            type="button"
                            className={styles.smallBtn}
                            disabled={!(section.text ?? "").trim()}
                            onClick={() => void saveSingleVariation(section)}
                          >
                            Save as variation
                          </button>
                        </div>
                      </div>

                      {pickerOpen && (
                        <div className={styles.variationDrawer}>
                          {roleVars.length === 0 ? (
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>
                              No saved {section.label.toLowerCase()} variations yet. Paste or import via CSV above.
                            </div>
                          ) : (
                            roleVars.map((v) => (
                              <div key={v.id} className={styles.variationItem}>
                                <button
                                  type="button"
                                  className={styles.variationPickBtn}
                                  onClick={() => {
                                    updateSectionText(section.id, v.content);
                                    setOpenPickerId(null);
                                  }}
                                >
                                  <div className={styles.variationMeta}>
                                    {v.sampleBatch && (
                                      <span className={styles.sampleBadge}>
                                        Imported Example
                                      </span>
                                    )}
                                    {v.lengthHint && (
                                      <span className={styles.optionalPill}>
                                        {v.lengthHint}
                                      </span>
                                    )}
                                  </div>
                                  <div className={styles.variationText}>
                                    {v.content}
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  className={styles.smallBtn}
                                  aria-label="Delete variation"
                                  onClick={() => void handleDeleteVariation(v.id)}
                                >
                                  Delete
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <select
                  className={styles.select}
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as SectionRole)}
                >
                  {(Object.keys(SECTION_ROLE_META) as SectionRole[]).map((r) => (
                    <option key={r} value={r}>
                      {SECTION_ROLE_META[r].label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="anext-btn-secondary"
                  onClick={() => addSection(addRole)}
                >
                  + Add section
                </button>
              </div>
            </div>
          </div>

          <aside className={styles.previewPane}>
            <div className={styles.previewHeader}>
              <span className={styles.previewTitle}>
                {activeFormatTab === "blogger"
                  ? "Live Blogger Article Preview"
                  : activeFormatTab === "x"
                    ? "Live X Post Preview"
                    : "Live Single-Post Preview"}
              </span>
              {activeFormatTab === "x" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "inline-flex", gap: 4 }} role="tablist" aria-label="X post mode">
                    {(["single", "thread", "premium"] as XPostMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={xPostMode === m}
                        className={styles.smallBtn}
                        onClick={() => setXPostMode(m)}
                        style={{
                          fontWeight: xPostMode === m ? 700 : 400,
                          borderColor: xPostMode === m ? "#0f172a" : undefined,
                          textTransform: "capitalize",
                        }}
                      >
                        {m === "single" ? "Single (280)" : m === "thread" ? "Thread (1/N)" : "Premium"}
                      </button>
                    ))}
                  </div>
                  <span
                    data-testid="copywriting-x-char-counter"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color:
                        xPostMode === "single" && xAnalysis.weightedLength > 280
                          ? "#dc2626"
                          : xPostMode === "thread" && xAnalysis.tweets.some((t) => t.overLimit)
                            ? "#dc2626"
                            : "#059669",
                    }}
                  >
                    {xPostMode === "thread"
                      ? `${xAnalysis.tweets.length} ${xAnalysis.tweets.length === 1 ? "tweet" : "tweets"} · ${xAnalysis.weightedLength} weighted`
                      : `${xAnalysis.weightedLength} / ${xAnalysis.limit} weighted`}
                  </span>
                  <div style={{ display: "inline-flex", gap: 4 }}>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => setXPreviewMode("formatted")}
                      style={{
                        fontWeight: xPreviewMode === "formatted" ? 700 : 400,
                        borderColor: xPreviewMode === "formatted" ? "#0f172a" : undefined,
                      }}
                    >
                      Card
                    </button>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => setXPreviewMode("raw")}
                      style={{
                        fontWeight: xPreviewMode === "raw" ? 700 : 400,
                        borderColor: xPreviewMode === "raw" ? "#0f172a" : undefined,
                      }}
                    >
                      Raw
                    </button>
                  </div>
                </div>
              ) : activeFormatTab === "blogger" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {bloggerAnalysis.wordCount} words · ~{bloggerAnalysis.readingMinutes} min read · {bloggerAnalysis.charCount} chars
                  </span>
                  <div style={{ display: "inline-flex", gap: 4 }}>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => setBloggerPreviewMode("formatted")}
                      style={{
                        fontWeight: bloggerPreviewMode === "formatted" ? 700 : 400,
                        borderColor: bloggerPreviewMode === "formatted" ? "#f97316" : undefined,
                      }}
                    >
                      Formatted
                    </button>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => setBloggerPreviewMode("raw")}
                      style={{
                        fontWeight: bloggerPreviewMode === "raw" ? 700 : 400,
                        borderColor: bloggerPreviewMode === "raw" ? "#f97316" : undefined,
                      }}
                    >
                      Raw
                    </button>
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {assembledText.length} chars
                </span>
              )}
            </div>
            {activeFormatTab === "x" && (
              <div
                data-testid="copywriting-x-checklist"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--line-soft)",
                  background: "rgba(15, 23, 42, 0.04)",
                }}
              >
                {xAnalysis.checks.map((chk) => (
                  <span
                    key={chk.id}
                    title={chk.hint}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: `1px solid ${chk.passed ? "rgba(5, 150, 105, 0.35)" : "var(--line-soft)"}`,
                      background: chk.passed ? "rgba(5, 150, 105, 0.1)" : "var(--bg)",
                      color: chk.passed ? "#047857" : "var(--muted)",
                    }}
                  >
                    {chk.passed ? "✓" : "○"} {chk.label}
                  </span>
                ))}
              </div>
            )}
            {activeFormatTab === "blogger" && (
              <div
                data-testid="copywriting-blogger-checklist"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--line-soft)",
                  background: "rgba(249, 115, 22, 0.04)",
                }}
              >
                {bloggerAnalysis.checks.map((chk) => (
                  <span
                    key={chk.id}
                    title={chk.hint}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: `1px solid ${chk.passed ? "rgba(5, 150, 105, 0.35)" : "var(--line-soft)"}`,
                      background: chk.passed ? "rgba(5, 150, 105, 0.1)" : "var(--bg)",
                      color: chk.passed ? "#047857" : "var(--muted)",
                    }}
                  >
                    {chk.passed ? "✓" : "○"} {chk.label}
                  </span>
                ))}
              </div>
            )}
            <div className={styles.previewBody}>
              {!assembledText ? (
                <span style={{ color: "var(--muted)" }}>
                  Pick variations or type into sections to preview your assembled caption.
                </span>
              ) : activeFormatTab === "x" && xPreviewMode === "formatted" ? (
                <div data-testid="copywriting-x-formatted-preview" style={{ display: "flex", flexDirection: "column", gap: 10, whiteSpace: "normal" }}>
                  {xAnalysis.tweets.map((tw) => (
                    <div
                      key={tw.index}
                      style={{
                        border: `1px solid ${tw.overLimit ? "rgba(220, 38, 38, 0.5)" : "var(--line-soft)"}`,
                        borderRadius: 12,
                        padding: "10px 12px",
                        background: "var(--bg)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                          <strong>{orgDisplayName}</strong>
                          <span style={{ color: "var(--muted)" }}>{orgDisplayHandle}</span>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: tw.overLimit ? "#dc2626" : "var(--muted)",
                          }}
                        >
                          {xPostMode === "thread" && tw.total > 1 ? `Tweet ${tw.index}/${tw.total} · ` : ""}
                          {tw.weightedLength}/{xPostMode === "premium" ? "25k" : "280"}
                        </span>
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 13.5 }}>
                        {tw.text}
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeFormatTab === "blogger" && bloggerPreviewMode === "formatted" ? (
                <div data-testid="copywriting-blogger-formatted-preview" style={{ display: "flex", flexDirection: "column", gap: 10, whiteSpace: "normal" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#c2410c", fontWeight: 700 }}>
                    Blogger Title (Line 1)
                  </div>
                  <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.3 }}>
                    {bloggerAnalysis.title || "Untitled"}
                  </h2>
                  {bloggerPreviewBlocks.map((block, idx) => {
                    const renderInline = (text: string) =>
                      parseInlineBloggerTokens(text).map((tok, ti) => {
                        if (tok.type === "bold") {
                          return <strong key={ti}>{tok.text}</strong>;
                        }
                        if (tok.type === "link") {
                          return (
                            <a
                              key={ti}
                              href={tok.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#c2410c", textDecoration: "underline" }}
                            >
                              {tok.text}
                            </a>
                          );
                        }
                        return <span key={ti}>{tok.text}</span>;
                      });

                    if (block.type === "hr") {
                      return <hr key={idx} style={{ border: "none", borderTop: "1px solid var(--line-soft)", margin: "6px 0" }} />;
                    }
                    if (block.type === "blockquote") {
                      return (
                        <blockquote
                          key={idx}
                          style={{
                            margin: 0,
                            padding: "6px 12px",
                            borderLeft: "3px solid #f97316",
                            background: "rgba(249, 115, 22, 0.06)",
                            color: "var(--muted)",
                            fontStyle: "italic",
                          }}
                        >
                          {renderInline(block.text)}
                        </blockquote>
                      );
                    }
                    if (block.type === "h2") {
                      return <h3 key={idx} style={{ margin: "8px 0 0", fontSize: 15.5, fontWeight: 700 }}>{renderInline(block.text)}</h3>;
                    }
                    if (block.type === "h3") {
                      return <h4 key={idx} style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 700 }}>{renderInline(block.text)}</h4>;
                    }
                    if (block.type === "ul") {
                      return (
                        <ul key={idx} style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                          {block.items.map((item, li) => (
                            <li key={li}>{renderInline(item)}</li>
                          ))}
                        </ul>
                      );
                    }
                    return <p key={idx} style={{ margin: 0, lineHeight: 1.6 }}>{renderInline(block.text)}</p>;
                  })}
                  {bloggerAnalysis.labels.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 6, borderTop: "1px solid var(--line-soft)" }}>
                      <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>Labels:</span>
                      {bloggerAnalysis.labels.map((lbl) => (
                        <span
                          key={lbl}
                          style={{
                            fontSize: 11,
                            padding: "1px 7px",
                            borderRadius: 999,
                            background: "rgba(249, 115, 22, 0.12)",
                            color: "#c2410c",
                            fontWeight: 600,
                          }}
                        >
                          {lbl}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                assembledText
              )}
            </div>
            <div className={styles.previewFooter}>
              <button
                type="button"
                className="anext-btn-secondary"
                disabled={savingScratchCollection || !assembledText}
                data-testid="copywriting-save-scratch-to-collection"
                onClick={() => void handleSaveScratchToCollection()}
              >
                {savingScratchCollection ? "Saving…" : "Save blocks to Collection"}
              </button>
              <button
                type="button"
                className="anext-btn-secondary"
                disabled={!assembledText}
                onClick={() => void copyPreview()}
              >
                Copy text
              </button>
              <Link
                href={`/builder?tab=${activeFormatTab}`}
                className="anext-btn-secondary"
                data-testid="copywriting-preview-builder-link"
                style={{ textDecoration: "none" }}
              >
                Build in 3 Post Builder →
              </Link>
              <button
                type="button"
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
      </section>

      {/* Import Copywriting CSV modal */}
      {csvModalOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard} style={{ maxWidth: 560 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Import Copywriting CSV</h2>
            <p style={{ margin: "6px 0 10px", fontSize: 13, color: "var(--muted)" }}>
              Upload a CSV with columns{" "}
              <code>collection,post_type,section_role,content,length_hint</code>.
              Duplicate blocks are skipped automatically.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <input
                type="file"
                accept=".csv,text/csv"
                data-testid="copywriting-csv-file-input"
                onChange={(e) => void handleCsvFileSelected(e)}
              />
              <button
                type="button"
                className={styles.smallBtn}
                data-testid="copywriting-modal-template-btn"
                onClick={downloadCopywritingTemplateCsv}
              >
                Download Template CSV
              </button>
            </div>

            {csvErrors.length > 0 && (
              <div
                role="alert"
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--danger, #dc2626)",
                  fontSize: 12,
                  color: "var(--danger, #dc2626)",
                  marginBottom: 10,
                }}
              >
                {csvErrors.slice(0, 5).map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
                {csvErrors.length > 5 && (
                  <div style={{ marginTop: 4, fontWeight: 600 }}>
                    …and {csvErrors.length - 5} more error{csvErrors.length - 5 === 1 ? "" : "s"}.
                  </div>
                )}
              </div>
            )}

            {csvRows.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--line-soft)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  maxHeight: 200,
                  overflowY: "auto",
                  fontSize: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {csvFileName}: {csvRows.length} valid block{csvRows.length === 1 ? "" : "s"} ready
                </div>
                {csvRows.slice(0, 8).map((r) => (
                  <div
                    key={r.rowNumber}
                    style={{
                      padding: "4px 0",
                      borderTop: "1px solid var(--line-soft)",
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontWeight: 600, minWidth: 80 }}>
                      {r.sectionRole}
                    </span>
                    <span style={{ color: "var(--muted)", minWidth: 90 }}>
                      {r.collection || "Unassigned"}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.content}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className="anext-btn-secondary"
                onClick={() => {
                  setCsvModalOpen(false);
                  setCsvRows([]);
                  setCsvErrors([]);
                  setCsvFileName("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                data-testid="copywriting-confirm-import-btn"
                disabled={csvRows.length === 0 || csvImporting}
                onClick={() => void handleConfirmCsvImport()}
              >
                {csvImporting
                  ? "Importing…"
                  : `Import ${csvRows.length} block${csvRows.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {pasteTarget && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              Paste {SECTION_ROLE_META[pasteTarget.role].label} variations
            </h2>
            <p style={{ margin: "6px 0 10px", fontSize: 13, color: "var(--muted)" }}>
              Separate variations by a blank line or newline.
            </p>
            <textarea
              className={styles.textarea}
              style={{ minHeight: 160 }}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste one or more variations…"
            />
            <div className={styles.modalActions}>
              <button
                type="button"
                className="anext-btn-secondary"
                onClick={() => setPasteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                disabled={!pasteText.trim() || pasteSaving}
                onClick={() => void submitPasteVariations()}
              >
                {pasteSaving ? "Saving…" : "Save variations"}
              </button>
            </div>
          </div>
        </div>
      )}

      {collectionDialog && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              {collectionDialog.mode === "create"
                ? "New writing collection"
                : "Rename writing collection"}
            </h2>
            <input
              type="text"
              className={styles.input}
              style={{ marginTop: 10, width: "100%" }}
              value={collectionInput}
              onChange={(e) => setCollectionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && collectionInput.trim() && !collectionBusy) {
                  e.preventDefault();
                  void submitCollectionDialog();
                } else if (e.key === "Escape") {
                  setCollectionDialog(null);
                }
              }}
              placeholder="Collection name"
            />
            <div className={styles.modalActions}>
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
                disabled={!collectionInput.trim() || collectionBusy}
                onClick={() => void submitCollectionDialog()}
              >
                {collectionBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {postTypeDialog && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              {postTypeDialog.mode === "create" ? "New post type" : "Rename post type"}
            </h2>
            <input
              type="text"
              className={styles.input}
              style={{ marginTop: 10, width: "100%" }}
              value={postTypeInput}
              onChange={(e) => setPostTypeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && postTypeInput.trim() && !postTypeBusy) {
                  e.preventDefault();
                  void submitPostTypeDialog();
                } else if (e.key === "Escape") {
                  setPostTypeDialog(null);
                }
              }}
              placeholder="Post type name"
            />
            <div className={styles.modalActions}>
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
                disabled={!postTypeInput.trim() || postTypeBusy}
                onClick={() => void submitPostTypeDialog()}
              >
                {postTypeBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteSamples && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              Delete all imported examples?
            </h2>
            <p style={{ margin: "8px 0 12px", fontSize: 13, color: "var(--muted)" }}>
              Removes the {sampleVariationCount} ANEXTVID Imported Example variations from this workspace. Variations you created and saved drafts are preserved.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className="anext-btn-secondary"
                onClick={() => setConfirmDeleteSamples(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                disabled={sampleBusy}
                onClick={() => void handleDeleteSamples()}
              >
                {sampleBusy ? "Deleting…" : "Delete imported examples"}
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
          initialChannelIds={preferredComposerChannelIds}
          onClose={() => setComposerOpen(false)}
          onSaveDraft={(post) => void submitToComposer(post, "draft")}
          onSchedule={(post) => void submitToComposer(post, "schedule")}
          onPublishNow={(post) => void submitToComposer(post, "now")}
        />
      )}
    </section>
  );
}
