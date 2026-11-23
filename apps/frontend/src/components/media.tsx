"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./media.module.css";
import { ChannelAvatar } from "./channel-avatar";
import { EmptyState } from "./empty-state";
import { useT } from "@/lib/i18n";
import { ConfirmDialog } from "./confirm-dialog";
import { type MediaItem, type MediaKind } from "@/lib/media-data";
import { type Channel } from "@/lib/calendar-data";
import { useChannels } from "@/lib/use-channels";
import {
  backendMediaToItem,
  backendMediaToUrl,
  createMediaCollection,
  deleteMediaCollection,
  deleteMediaItem,
  fetchMedia,
  fetchMediaCollections,
  fetchMediaDependencies,
  fetchMediaStorageOverview,
  mediaPathToUrl,
  moveMediaToCollection,
  renameMediaCollection,
  updateMediaMetadata,
  uploadMedia,
  uploadVideoStream,
  type BackendMedia,
  type MediaCollectionSummary,
  type MediaCollectionsResponse,
  type MediaDependenciesResponse,
  type MediaStorageOverview,
} from "@/lib/media-api";
import { WorkspaceBadge } from "./workspace-badge";

type WorkspaceTab = "images" | "videos";
type VideoCategoryFilter = "all" | "short_form" | "long_form";
type Filter = "all" | MediaKind;
type View = "list" | "grid";
type MediaScope = "landing" | "all" | "unassigned" | string;
type ImageSubCat =
  | "Portrait Photography"
  | "Graphic & Headline Covers"
  | "Quotes & Text Cards"
  | "Strategy & Story Sets"
  | "Empty & Other";

const IMAGE_SUB_CAT_ORDER: ImageSubCat[] = [
  "Portrait Photography",
  "Graphic & Headline Covers",
  "Quotes & Text Cards",
  "Strategy & Story Sets",
  "Empty & Other",
];

function classifyImageCol(col: MediaCollectionSummary): ImageSubCat {
  if (col.imageCount === 0 && col.count === 0) return "Empty & Other";
  const n = col.name
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    n.includes("quote") ||
    n.includes("editorial notes") ||
    n.includes("three word") ||
    n.includes("start before you feel ready") ||
    n.includes("big text") ||
    n.includes("bold text") ||
    n.includes("text card") ||
    n.includes("text post") ||
    n.includes("text set") ||
    n.includes("typography") ||
    n.includes("manifesto") ||
    n.includes("statement")
  ) {
    return "Quotes & Text Cards";
  }
  if (
    n.includes("portrait") ||
    n.includes("headshot") ||
    n.includes("jumper") ||
    n.includes("black and white") ||
    n.includes("b&w") ||
    n.includes("monochrome") ||
    (n.includes("personal branding") && !n.includes("headline")) ||
    n.includes("hand study") ||
    n.includes("team photo") ||
    n.includes("founder photo")
  ) {
    return "Portrait Photography";
  }
  if (
    n.includes("infographic") ||
    n.includes("diagram") ||
    n.includes("chart") ||
    n.includes("cheat sheet") ||
    n.includes("cheatsheet") ||
    n.includes("framework") ||
    n.includes("checklist") ||
    n.includes("carousel") ||
    n.includes("cover") ||
    n.includes("overlay") ||
    n.includes("collage") ||
    n.includes("headline") ||
    n.includes("brand guidelines") ||
    n.includes("service cards") ||
    n.includes("invitations") ||
    n.includes("visual communication editorial")
  ) {
    return "Graphic & Headline Covers";
  }
  if (
    n.includes("strategy") ||
    n.includes("brief") ||
    n.includes("founder") ||
    n.includes("format") ||
    n.includes("project story") ||
    n.includes("plan a shoot") ||
    n.includes("listening") ||
    n.includes("positioning") ||
    n.includes("product shots")
  ) {
    return "Strategy & Story Sets";
  }
  return "Empty & Other";
}

function formatAspectRatio(w?: number | null, h?: number | null): string | null {
  if (!w || !h || w <= 0 || h <= 0) return null;
  const ratio = w / h;
  if (Math.abs(ratio - 9 / 16) < 0.06) return "9:16";
  if (Math.abs(ratio - 16 / 9) < 0.06) return "16:9";
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  if (Math.abs(ratio - 4 / 5) < 0.05) return "4:5";
  if (Math.abs(ratio - 4 / 3) < 0.05) return "4:3";
  return `${w}×${h}`;
}

function formatBytes(b: number): string {
  if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(1) + " GB";
  if (b >= 1_048_576) return (b / 1_048_576).toFixed(1) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(1) + " KB";
  return b + " B";
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden width="14" height="14">
      <rect
        x="2.75"
        y="3.75"
        width="14.5"
        height="12.5"
        rx="2.25"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="7" cy="8" r="1.3" fill="currentColor" />
      <path
        d="M3.5 14 8 10.5l3.5 3 3-2 2 2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden width="14" height="14">
      <rect
        x="2.75"
        y="4.75"
        width="14.5"
        height="10.5"
        rx="2.25"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M8.5 7.8 13 10l-4.5 2.2V7.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 4.5h9M3.5 8h9M3.5 11.5h9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="3" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8.5" y="3" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="8.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8.5" y="8.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function Media() {
  const t = useT();
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("images");
  const [videoCategoryFilter, setVideoCategoryFilter] =
    useState<VideoCategoryFilter>("all");
  const [scope, setScope] = useState<MediaScope>("all");
  const filter: Filter = workspaceTab === "videos" ? "video" : "image";
  const [view, setView] = useState<View>("grid");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [raw, setRaw] = useState<BackendMedia[]>([]);
  const [collectionsData, setCollectionsData] =
    useState<MediaCollectionsResponse | null>(null);
  const [storageOverview, setStorageOverview] =
    useState<MediaStorageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteDeps, setDeleteDeps] = useState<MediaDependenciesResponse | null>(
    null,
  );
  const [deleteDepsLoading, setDeleteDepsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Collection CRUD + bulk move + upload destination dialog state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState<string>("unassigned");
  const [moveBusy, setMoveBusy] = useState(false);
  const [unassignedSelectMode, setUnassignedSelectMode] = useState(false);
  const [unassignedAssignTarget, setUnassignedAssignTarget] = useState<string>("");
  const [unassignedAssignBusy, setUnassignedAssignBusy] = useState(false);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteCollectionTarget, setDeleteCollectionTarget] =
    useState<MediaCollectionSummary | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadTarget, setUploadTarget] = useState<string>("unassigned");
  const [uploadNewName, setUploadNewName] = useState<string>("");
  const [uploadVideoCategory, setUploadVideoCategory] = useState<
    "auto" | "short_form" | "long_form"
  >("auto");
  const [categorySavingId, setCategorySavingId] = useState<string | null>(null);

  const { channels } = useChannels();

  useEffect(() => {
    if (!deleteId) {
      setDeleteDeps(null);
      setDeleteDepsLoading(false);
      return;
    }
    let cancelled = false;
    setDeleteDepsLoading(true);
    fetchMediaDependencies(deleteId)
      .then((deps) => {
        if (!cancelled) setDeleteDeps(deps);
      })
      .catch(() => {
        if (!cancelled) setDeleteDeps(null);
      })
      .finally(() => {
        if (!cancelled) setDeleteDepsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deleteId]);

  const channelsById = useMemo(() => {
    const m = new Map<string, Channel>();
    for (const c of channels) m.set(c.id, c);
    return m;
  }, [channels]);

  const collectionsById = useMemo(() => {
    const m = new Map<string, MediaCollectionSummary>();
    for (const c of collectionsData?.collections ?? []) m.set(c.id, c);
    return m;
  }, [collectionsData]);

  const activeCollection = useMemo(
    () =>
      scope !== "landing" && scope !== "all" && scope !== "unassigned"
        ? collectionsById.get(scope) ?? null
        : null,
    [scope, collectionsById],
  );

  const [sectionLimits, setSectionLimits] = useState<Record<string, number>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [landingExpandedIds, setLandingExpandedIds] = useState<Record<string, boolean>>({});
  const [landingPreviewCache, setLandingPreviewCache] = useState<Record<string, BackendMedia[]>>({});
  const [selectedImageSubCategory, setSelectedImageSubCategory] = useState<
    "all" | ImageSubCat
  >("all");
  const [collapsedSubCategories, setCollapsedSubCategories] = useState<Record<string, boolean>>({});
  const SECTION_BATCH = 12;

  const toggleLandingCard = async (colId: string) => {
    const nextOpen = !landingExpandedIds[colId];
    setLandingExpandedIds((prev) => ({ ...prev, [colId]: nextOpen }));
    if (nextOpen && !landingPreviewCache[colId]) {
      const fromItems = items.filter((m) =>
        colId === "unassigned" ? !m.backend.collectionId : m.backend.collectionId === colId,
      );
      if (fromItems.length > 0) {
        setLandingPreviewCache((prev) => ({
          ...prev,
          [colId]: fromItems.slice(0, 24).map((m) => m.backend),
        }));
        return;
      }
      const res = await fetchMedia(1, undefined, colId, 24).catch(() => ({ results: [] }));
      setLandingPreviewCache((prev) => ({ ...prev, [colId]: res.results ?? [] }));
    }
  };

  const toggleSectionExpanded = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const refresh = async (targetScope: MediaScope = scope) => {
    setLoading(true);
    setError(null);
    try {
      const colPromise = fetchMediaCollections();
      const overviewPromise = fetchMediaStorageOverview().catch(() => null);
      const collectionQuery =
        targetScope === "landing" || targetScope === "all"
          ? undefined
          : targetScope;
      const byId = new Map<string, BackendMedia>();
      if (targetScope !== "landing") {
        for (let page = 1; page <= 50; page++) {
          const res = await fetchMedia(page, undefined, collectionQuery, 100);
          for (const item of res.results ?? [])
            if (!byId.has(item.id)) byId.set(item.id, item);
          if (page >= (res.pages ?? 1)) break;
        }
      }
      const [cols, overview] = await Promise.all([colPromise, overviewPromise]);
      setCollectionsData(cols);
      if (overview) setStorageOverview(overview);
      setRaw([...byId.values()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load media");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedIds(new Set());
    setUnassignedSelectMode(false);
    setSectionLimits({});
    void refresh(scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const items = useMemo(() => {
    const mapped: { item: MediaItem; src: string; backend: BackendMedia }[] =
      raw.map((m) => ({
        item: backendMediaToItem(m),
        src: backendMediaToUrl(m),
        backend: m,
      }));
    const sorted = [...mapped].sort(
      (a, b) =>
        new Date(b.item.uploadedAt).getTime() -
        new Date(a.item.uploadedAt).getTime(),
    );
    const byKind = sorted.filter((m) => m.item.kind === filter);
    if (workspaceTab === "videos" && videoCategoryFilter !== "all") {
      return byKind.filter((m) => {
        const cat =
          m.backend.contentCategory === "long_form" ? "long_form" : "short_form";
        return cat === videoCategoryFilter;
      });
    }
    return byKind;
  }, [raw, filter, workspaceTab, videoCategoryFilter]);

  useEffect(() => {
    if (loading) return;
    const visibleIds = new Set(items.map((e) => e.item.id));
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filter, items, loading]);

  useEffect(() => {
    const cols = collectionsData?.collections ?? [];
    if (cols.length === 0) {
      if (unassignedAssignTarget !== "") setUnassignedAssignTarget("");
      return;
    }
    if (!cols.some((c) => c.id === unassignedAssignTarget)) {
      setUnassignedAssignTarget(cols[0].id);
    }
  }, [collectionsData, unassignedAssignTarget]);

  const videoCategoryCounts = useMemo(() => {
    let shortForm = 0;
    let longForm = 0;
    for (const m of raw) {
      if (m.type !== "video") continue;
      if (m.contentCategory === "long_form") longForm++;
      else shortForm++;
    }
    return {
      all: shortForm + longForm,
      short_form: shortForm,
      long_form: longForm,
    };
  }, [raw]);

  const allMediaSections = useMemo(() => {
    if (scope !== "all" || !collectionsData) return [];

    const isVideoSubFiltered =
      workspaceTab === "videos" && videoCategoryFilter !== "all";

    const grouped = new Map<string, typeof items>();
    for (const entry of items) {
      const key = entry.backend.collectionId || "unassigned";
      const list = grouped.get(key);
      if (list) list.push(entry);
      else grouped.set(key, [entry]);
    }

    const sections: {
      id: string;
      title: string;
      totalInFilter: number;
      items: typeof items;
      isCollection: boolean;
    }[] = [];

    for (const col of collectionsData.collections) {
      const colItems = grouped.get(col.id) ?? [];
      const totalInFilter = isVideoSubFiltered
        ? colItems.length
        : filter === "image"
          ? col.imageCount
          : col.videoCount;
      if (totalInFilter === 0 && colItems.length === 0) {
        continue;
      }
      sections.push({
        id: col.id,
        title: col.name,
        totalInFilter: isVideoSubFiltered
          ? colItems.length
          : Math.max(totalInFilter, colItems.length),
        items: colItems,
        isCollection: true,
      });
    }

    const unassignedItems = grouped.get("unassigned") ?? [];
    const unassignedTotal = isVideoSubFiltered
      ? unassignedItems.length
      : filter === "image"
        ? collectionsData.unassignedImageCount
        : collectionsData.unassignedVideoCount;
    if (unassignedTotal > 0 || unassignedItems.length > 0) {
      sections.push({
        id: "unassigned",
        title: t("media.unassigned"),
        totalInFilter: isVideoSubFiltered
          ? unassignedItems.length
          : Math.max(unassignedTotal, unassignedItems.length),
        items: unassignedItems,
        isCollection: false,
      });
    }

    return sections;
  }, [scope, collectionsData, items, filter, workspaceTab, videoCategoryFilter, t]);

  const unassignedItemsInScope = useMemo(() => {
    if (scope === "all") {
      return allMediaSections.find((s) => s.id === "unassigned")?.items ?? [];
    }
    if (scope === "unassigned") {
      return items;
    }
    return [];
  }, [scope, allMediaSections, items]);

  const unassignedIdSet = useMemo(
    () => new Set(unassignedItemsInScope.map((e) => e.item.id)),
    [unassignedItemsInScope],
  );

  const selectedUnassignedIds = useMemo(
    () => [...selectedIds].filter((id) => unassignedIdSet.has(id)),
    [selectedIds, unassignedIdSet],
  );

  const unassignedSelectionLabel = useMemo(() => {
    const noun =
      filter === "image" ? " images" : filter === "video" ? " videos" : "";
    return `${selectedUnassignedIds.length} of ${unassignedItemsInScope.length}${noun} selected`;
  }, [selectedUnassignedIds.length, unassignedItemsInScope.length, filter]);

  const toggleUnassignedSelectMode = () => {
    if (unassignedSelectMode) {
      setUnassignedSelectMode(false);
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const id of unassignedIdSet) next.delete(id);
        return next;
      });
    } else {
      setUnassignedSelectMode(true);
    }
  };

  const selectAllUnassigned = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of unassignedIdSet) next.add(id);
      return next;
    });
  };

  const clearUnassignedSelection = () => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const id of unassignedIdSet) next.delete(id);
      return next;
    });
  };

  const assignUnassignedToCollection = async () => {
    if (selectedUnassignedIds.length === 0 || !unassignedAssignTarget) return;
    setUnassignedAssignBusy(true);
    setActionError(null);
    try {
      await moveMediaToCollection(selectedUnassignedIds, unassignedAssignTarget);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of selectedUnassignedIds) next.delete(id);
        return next;
      });
      setUnassignedSelectMode(false);
      await refresh(scope);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not assign media to collection",
      );
    } finally {
      setUnassignedAssignBusy(false);
    }
  };

  const counts = useMemo(() => {
    const total = raw.length;
    const images = raw.filter((m) => m.type !== "video").length;
    const videos = raw.filter((m) => m.type === "video").length;
    return { total, images, videos };
  }, [raw]);

  const previewEntry = useMemo(
    () => items.find((m) => m.item.id === previewId) ?? null,
    [items, previewId],
  );

  const openUploadModal = () => {
    const defaultTarget =
      scope !== "landing" && scope !== "all" && scope !== "unassigned"
        ? scope
        : "unassigned";
    setUploadTarget(defaultTarget);
    setUploadNewName("");
    setUploadFiles([]);
    setUploadModalOpen(true);
  };

  const runBatchUpload = async () => {
    if (uploadFiles.length === 0 || uploading) return;
    setUploading(true);
    setActionError(null);
    try {
      let targetCollectionId: string | null =
        uploadTarget === "unassigned" || uploadTarget === "__new__"
          ? null
          : uploadTarget;
      if (uploadTarget === "__new__") {
        const trimmed = uploadNewName.trim();
        if (!trimmed) {
          throw new Error("Please enter a collection name.");
        }
        const created = await createMediaCollection(trimmed);
        targetCollectionId = created.id;
      }
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        if (file.type.startsWith("video/")) {
          setUploadProgress(
            `Uploading video ${i + 1} of ${uploadFiles.length} (0%)…`,
          );
          await uploadVideoStream(file, {
            collectionId: targetCollectionId,
            contentCategory:
              uploadVideoCategory === "auto" ? undefined : uploadVideoCategory,
            onProgress: (pct) => {
              setUploadProgress(
                `Uploading video ${i + 1} of ${uploadFiles.length} (${pct}%)…`,
              );
            },
          });
        } else {
          setUploadProgress(`Uploading ${i + 1} of ${uploadFiles.length}…`);
          await uploadMedia(file, targetCollectionId);
        }
      }
      setUploadModalOpen(false);
      setUploadFiles([]);
      setUploadNewName("");
      if (targetCollectionId && scope === "landing") {
        setScope(targetCollectionId);
      } else {
        await refresh(scope);
      }
    } catch (err) {
      console.error("[upload-media]", err);
      setActionError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name || collectionBusy) return;
    setCollectionBusy(true);
    setActionError(null);
    try {
      await createMediaCollection(name);
      setNewCollectionName("");
      setNewCollectionOpen(false);
      await refresh(scope);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not create collection",
      );
    } finally {
      setCollectionBusy(false);
    }
  };

  const handleRenameCollection = async () => {
    if (!renameTarget || collectionBusy) return;
    const name = renameTarget.name.trim();
    if (!name) return;
    setCollectionBusy(true);
    setActionError(null);
    try {
      await renameMediaCollection(renameTarget.id, name);
      setRenameTarget(null);
      await refresh(scope);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not rename collection",
      );
    } finally {
      setCollectionBusy(false);
    }
  };

  const handleDeleteCollection = async (id: string) => {
    setCollectionBusy(true);
    setActionError(null);
    try {
      await deleteMediaCollection(id);
      setDeleteCollectionTarget(null);
      if (scope === id) {
        setScope("landing");
      } else {
        await refresh(scope);
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not delete collection",
      );
    } finally {
      setCollectionBusy(false);
    }
  };

  const handleBulkMove = async () => {
    if (selectedIds.size === 0 || moveBusy) return;
    setMoveBusy(true);
    setActionError(null);
    try {
      const targetId = moveTarget === "unassigned" ? null : moveTarget;
      await moveMediaToCollection([...selectedIds], targetId);
      setSelectedIds(new Set());
      await refresh(scope);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not move selected media",
      );
    } finally {
      setMoveBusy(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleUpdateVideoCategory = async (
    id: string,
    nextCategory: "short_form" | "long_form",
  ) => {
    setCategorySavingId(id);
    try {
      await updateMediaMetadata(id, { contentCategory: nextCategory });
      setRaw((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, contentCategory: nextCategory } : m,
        ),
      );
      const overview = await fetchMediaStorageOverview().catch(() => null);
      if (overview) setStorageOverview(overview);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not update video type",
      );
    } finally {
      setCategorySavingId(null);
    }
  };

  const onDelete = async (id: string) => {
    setDeleteBusy(true);
    const snapshot = raw;
    setRaw((prev) => prev.filter((m) => m.id !== id));
    try {
      await deleteMediaItem(id);
      setDeleteId(null);
      const overview = await fetchMediaStorageOverview().catch(() => null);
      if (overview) setStorageOverview(overview);
    } catch (err) {
      console.error("[delete-media]", err);
      setRaw(snapshot);
      setActionError(
        err instanceof Error ? err.message : t("errors.mediaDelete"),
      );
      setDeleteId(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  // Close preview on Escape, and lock background scroll while open.
  useEffect(() => {
    if (!previewEntry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewId(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewEntry]);

  const scopeTitle =
    scope === "landing"
      ? t("media.title")
      : scope === "all"
      ? "All Media"
      : scope === "unassigned"
      ? t("media.unassigned")
      : activeCollection?.name ?? t("media.title");

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <div className={styles.title}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className={styles.eyebrow}>{t("media.eyebrow")}</span>
            <WorkspaceBadge compact />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {scope !== "landing" && (
              <button
                type="button"
                data-testid="media-back-to-collections-btn"
                className="anext-btn-secondary"
                onClick={() => setScope("landing")}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: "var(--selection-bg)",
                  color: "var(--selection-fg)",
                  borderColor: "var(--selection-border)",
                }}
              >
                ← Back to Collections
              </button>
            )}
            <h1 className={styles.h1}>{scopeTitle}</h1>
            {activeCollection && (
              <>
                <button
                  type="button"
                  className="anext-btn-secondary"
                  onClick={() =>
                    setRenameTarget({
                      id: activeCollection.id,
                      name: activeCollection.name,
                    })
                  }
                  style={{ padding: "4px 10px", fontSize: 12 }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="anext-btn-secondary"
                  onClick={() => setDeleteCollectionTarget(activeCollection)}
                  style={{ padding: "4px 10px", fontSize: 12, color: "var(--danger-bright)" }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
          <p className={styles.subtitle}>
            {scope === "landing"
              ? `${collectionsData?.collections.length ?? 0} collections · ${collectionsData?.totalCount ?? 0} total assets`
              : `${t("media.subtitle")} ${t("media.counts", {
                  images: counts.images,
                  videos: counts.videos,
                  total: counts.total,
                })}`}
          </p>
        </div>

        <div className={styles.headerControls}>
          <div className={styles.segmented} role="tablist" aria-label="Media workspace">
            <button
              type="button"
              role="tab"
              data-testid="media-workspace-images"
              aria-selected={workspaceTab === "images"}
              className={
                styles.segment +
                (workspaceTab === "images" ? " " + styles.segmentActive : "")
              }
              onClick={() => {
                setWorkspaceTab("images");
                setSelectedIds(new Set());
              }}
            >
              Images ({collectionsData?.totalImageCount ?? counts.images})
            </button>
            <button
              type="button"
              role="tab"
              data-testid="media-workspace-videos"
              aria-selected={workspaceTab === "videos"}
              className={
                styles.segment +
                (workspaceTab === "videos" ? " " + styles.segmentActive : "")
              }
              onClick={() => {
                setWorkspaceTab("videos");
                setSelectedIds(new Set());
              }}
            >
              Videos ({collectionsData?.totalVideoCount ?? counts.videos})
            </button>
          </div>

          {scope !== "landing" && (
            <>
              {workspaceTab === "videos" && (
                <div className={styles.segmented} role="tablist" aria-label="Video format">
                  {(
                    [
                      { id: "all", label: `All Videos (${videoCategoryCounts.all})` },
                      { id: "short_form", label: `Short-form (${videoCategoryCounts.short_form})` },
                      { id: "long_form", label: `Long-form (${videoCategoryCounts.long_form})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      data-testid={`media-video-cat-${tab.id}`}
                      aria-selected={videoCategoryFilter === tab.id}
                      className={
                        styles.segment +
                        (videoCategoryFilter === tab.id
                          ? " " + styles.segmentActive
                          : "")
                      }
                      onClick={() => setVideoCategoryFilter(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.viewToggle} role="tablist" aria-label={t("media.viewMode")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "list"}
                  aria-label={t("media.list")}
                  className={
                    styles.viewBtn + (view === "list" ? " " + styles.viewBtnActive : "")
                  }
                  onClick={() => setView("list")}
                >
                  <ListIcon />
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "grid"}
                  aria-label={t("media.grid")}
                  className={
                    styles.viewBtn + (view === "grid" ? " " + styles.viewBtnActive : "")
                  }
                  onClick={() => setView("grid")}
                >
                  <GridIcon />
                </button>
              </div>
            </>
          )}

          {scope === "all" && allMediaSections.length > 0 && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                data-testid="media-expand-all-btn"
                className="anext-btn-secondary"
                style={{ padding: "6px 10px", fontSize: 12 }}
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  for (const s of allMediaSections) next[s.id] = true;
                  setExpandedSections(next);
                }}
              >
                Expand all
              </button>
              <button
                type="button"
                data-testid="media-collapse-all-btn"
                className="anext-btn-secondary"
                style={{ padding: "6px 10px", fontSize: 12 }}
                onClick={() => setExpandedSections({})}
              >
                Collapse all
              </button>
            </div>
          )}

          {scope === "unassigned" && (
            <button
              type="button"
              data-testid="unassigned-select-toggle"
              aria-pressed={unassignedSelectMode}
              className="anext-btn-secondary"
              onClick={toggleUnassignedSelectMode}
            >
              {unassignedSelectMode ? "Done" : "Select"}
            </button>
          )}

          <button
            type="button"
            className="anext-btn-secondary"
            onClick={() => {
              setNewCollectionName("");
              setNewCollectionOpen(true);
            }}
          >
            New Collection
          </button>

          <button
            type="button"
            className={styles.uploadBtn}
            disabled={uploading}
            onClick={openUploadModal}
          >
            {uploading
              ? uploadProgress ?? t("media.uploading")
              : workspaceTab === "videos"
              ? "Upload Videos"
              : "Upload Images"}
          </button>
        </div>
      </header>

      {workspaceTab === "videos" && storageOverview && (
        <div
          data-testid="video-storage-overview"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 10,
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--line-soft)",
            background: "var(--bg)",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
              Total Videos
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {storageOverview.totalVideos}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
              Video Storage
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {formatBytes(storageOverview.totalVideoBytes)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
              Short-form
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {storageOverview.shortFormCount} · {formatBytes(storageOverview.shortFormBytes)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
              Long-form (YouTube)
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {storageOverview.longFormCount} · {formatBytes(storageOverview.longFormBytes)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
              Awaiting Auto-Delete
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {storageOverview.awaitingDeletionCount} ({formatBytes(storageOverview.reclaimableBytes)})
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--danger-soft)",
            color: "var(--danger)",
            fontSize: 13,
          }}
        >
          <span style={{ flex: 1 }}>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label={t("common.dismiss")}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--danger)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {scope !== "landing" && !unassignedSelectMode && selectedIds.size > 0 && (
        <div
          data-testid="bulk-move-bar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--line-soft)",
            background: "var(--bg-elevated, var(--bg))",
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {selectedIds.size} selected
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>
              Move to:
            </label>
            <select
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--line-soft)",
                background: "var(--bg)",
                color: "var(--fg)",
                fontSize: 13,
              }}
            >
              <option value="unassigned">{t("media.unassigned")}</option>
              {(collectionsData?.collections ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="anext-btn-primary"
              disabled={moveBusy}
              onClick={() => void handleBulkMove()}
            >
              {moveBusy ? "Moving…" : "Move"}
            </button>
            <button
              type="button"
              className="anext-btn-secondary"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>{t("common.loading")}</div>
      ) : error ? (
        <div className={styles.empty}>{error}</div>
      ) : scope === "landing" ? (
        workspaceTab === "images" ? (
          (() => {
            const imageCols = (collectionsData?.collections ?? []).filter(
              (col) => col.imageCount > 0 || col.count === 0,
            );
            const grouped = new Map<ImageSubCat, MediaCollectionSummary[]>();
            for (const key of IMAGE_SUB_CAT_ORDER) grouped.set(key, []);
            for (const col of imageCols) {
              const key = classifyImageCol(col);
              grouped.get(key)!.push(col);
            }

            const visibleGroups =
              selectedImageSubCategory === "all"
                ? IMAGE_SUB_CAT_ORDER.filter((k) => (grouped.get(k)?.length ?? 0) > 0)
                : [selectedImageSubCategory].filter((k) => (grouped.get(k)?.length ?? 0) > 0);
            const allCollapsed =
              visibleGroups.length > 0 &&
              visibleGroups.every((cat) => Boolean(collapsedSubCategories[cat]));

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div
                  data-testid="media-image-subcategory-bar"
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--line-soft)",
                    background: "rgb(var(--tint) / 0.025)",
                  }}
                >
                  <button
                    type="button"
                    data-testid="media-subcat-pill-all"
                    onClick={() => setSelectedImageSubCategory("all")}
                    className={
                      selectedImageSubCategory === "all"
                        ? "anext-btn-primary"
                        : "anext-btn-secondary"
                    }
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    All Images ({collectionsData?.totalImageCount ?? 0})
                  </button>
                  {IMAGE_SUB_CAT_ORDER.map((cat) => {
                    const catCols = grouped.get(cat) ?? [];
                    if (catCols.length === 0) return null;
                    const totalImgs = catCols.reduce((sum, c) => sum + c.imageCount, 0);
                    const active = selectedImageSubCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        data-testid={`media-subcat-pill-${cat}`}
                        onClick={() => setSelectedImageSubCategory(cat)}
                        className={active ? "anext-btn-primary" : "anext-btn-secondary"}
                        style={{ padding: "5px 10px", fontSize: 12 }}
                      >
                        {cat} ({catCols.length} sets · {totalImgs})
                      </button>
                    );
                  })}
                  {selectedImageSubCategory === "all" && visibleGroups.length > 1 && (
                    <button
                      type="button"
                      data-testid="media-subcat-collapse-all"
                      className="anext-btn-secondary"
                      style={{ marginLeft: "auto", padding: "5px 10px", fontSize: 12 }}
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        for (const cat of visibleGroups) next[cat] = !allCollapsed;
                        setCollapsedSubCategories((prev) => ({ ...prev, ...next }));
                      }}
                    >
                      {allCollapsed ? "Expand all ▾" : "Collapse all ▴"}
                    </button>
                  )}
                </div>

                {selectedImageSubCategory === "all" && (
                  <div
                    data-testid="media-collections-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                      gap: 16,
                    }}
                  >
                    <CollectionCard
                      title="All Images"
                      count={collectionsData?.totalImageCount ?? 0}
                      coverUrl={mediaPathToUrl(collectionsData?.allCoverPath)}
                      coverType={collectionsData?.allCoverType ?? null}
                      onOpen={() => setScope("all")}
                      featured
                    />
                    <CollectionCard
                      title={t("media.unassigned")}
                      count={collectionsData?.unassignedImageCount ?? 0}
                      coverUrl={mediaPathToUrl(collectionsData?.unassignedCoverPath)}
                      coverType={collectionsData?.unassignedCoverType ?? null}
                      onOpen={() => setScope("unassigned")}
                      expanded={!!landingExpandedIds["unassigned"]}
                      onToggleExpand={() => void toggleLandingCard("unassigned")}
                      previewAssets={(landingPreviewCache["unassigned"] ?? []).filter(
                        (a) => a.type !== "video",
                      )}
                    />
                  </div>
                )}

                {visibleGroups.length === 0 && selectedImageSubCategory !== "all" ? (
                  <EmptyState
                    icon="media"
                    title={`No sets in "${selectedImageSubCategory}"`}
                    description="No image collections currently match this subcategory."
                    actionLabel="Show all image categories"
                    onAction={() => setSelectedImageSubCategory("all")}
                  />
                ) : (
                  visibleGroups.map((cat) => {
                    const catCols = grouped.get(cat) ?? [];
                    const totalImgs = catCols.reduce((sum, c) => sum + c.imageCount, 0);
                    const isCollapsed = Boolean(collapsedSubCategories[cat]);
                    return (
                      <section
                        key={cat}
                        data-testid={`media-subcat-section-${cat}`}
                        style={{ display: "flex", flexDirection: "column", gap: 10 }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            paddingBottom: 6,
                            borderBottom: "1px solid var(--line-soft)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>
                              {cat}
                            </h2>
                            <span style={{ fontSize: 12, color: "var(--muted)" }}>
                              {catCols.length} {catCols.length === 1 ? "set" : "sets"} · {totalImgs}{" "}
                              {totalImgs === 1 ? "image" : "images"}
                            </span>
                          </div>
                          <button
                            type="button"
                            aria-expanded={!isCollapsed}
                            className="anext-btn-secondary"
                            style={{ padding: "3px 9px", fontSize: 11.5 }}
                            onClick={() =>
                              setCollapsedSubCategories((prev) => ({
                                ...prev,
                                [cat]: !prev[cat],
                              }))
                            }
                          >
                            {isCollapsed ? "Expand ▸" : "Collapse ▾"}
                          </button>
                        </div>
                        {!isCollapsed && (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                              gap: 16,
                            }}
                          >
                            {catCols.map((col) => (
                              <CollectionCard
                                key={col.id}
                                title={col.name}
                                count={col.imageCount}
                                coverUrl={mediaPathToUrl(col.coverPath)}
                                coverType={col.coverType}
                                onOpen={() => setScope(col.id)}
                                onRename={() => setRenameTarget({ id: col.id, name: col.name })}
                                expanded={!!landingExpandedIds[col.id]}
                                onToggleExpand={() => void toggleLandingCard(col.id)}
                                previewAssets={(landingPreviewCache[col.id] ?? []).filter(
                                  (a) => a.type !== "video",
                                )}
                              />
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })
                )}
              </div>
            );
          })()
        ) : (
        <div
          data-testid="media-collections-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <CollectionCard
            title="All Videos"
            count={collectionsData?.totalVideoCount ?? 0}
            coverUrl={mediaPathToUrl(collectionsData?.allCoverPath)}
            coverType={collectionsData?.allCoverType ?? null}
            onOpen={() => setScope("all")}
            featured
          />
          <CollectionCard
            title={t("media.unassigned")}
            count={collectionsData?.unassignedVideoCount ?? 0}
            coverUrl={mediaPathToUrl(collectionsData?.unassignedCoverPath)}
            coverType={collectionsData?.unassignedCoverType ?? null}
            onOpen={() => setScope("unassigned")}
            expanded={!!landingExpandedIds["unassigned"]}
            onToggleExpand={() => void toggleLandingCard("unassigned")}
            previewAssets={(landingPreviewCache["unassigned"] ?? []).filter(
              (a) => a.type === "video",
            )}
          />
          {(collectionsData?.collections ?? [])
            .filter((col) => col.videoCount > 0 || col.count === 0)
            .map((col) => (
              <CollectionCard
                key={col.id}
                title={col.name}
                count={col.videoCount}
                coverUrl={mediaPathToUrl(col.coverPath)}
                coverType={col.coverType}
                onOpen={() => setScope(col.id)}
                onRename={() => setRenameTarget({ id: col.id, name: col.name })}
                expanded={!!landingExpandedIds[col.id]}
                onToggleExpand={() => void toggleLandingCard(col.id)}
                previewAssets={(landingPreviewCache[col.id] ?? []).filter(
                  (a) => a.type === "video",
                )}
              />
            ))}
        </div>
        )
      ) : scope === "all" ? (
        allMediaSections.length === 0 ? (
          workspaceTab === "videos" && videoCategoryFilter !== "all" ? (
            <EmptyState
              icon="media"
              title={
                videoCategoryFilter === "short_form"
                  ? "No short-form videos"
                  : "No long-form videos"
              }
              description={`No ${videoCategoryFilter === "short_form" ? "short-form" : "long-form"} videos found across your collections.`}
              actionLabel="Show all videos"
              onAction={() => setVideoCategoryFilter("all")}
            />
          ) : (
            <EmptyState
              icon="media"
              title={t("media.empty")}
              description={t("media.emptyDesc")}
              actionLabel="Upload media"
              onAction={openUploadModal}
            />
          )
        ) : (
          <div className={styles.sectionsStack} data-testid="all-media-sections">
            {allMediaSections.map((section) => {
              const limit = sectionLimits[section.id] ?? SECTION_BATCH;
              const visibleItems = section.items.slice(0, limit);
              const remaining = Math.max(0, section.items.length - visibleItems.length);
              const isUnassignedSection = section.id === "unassigned";
              const sectionSelectMode = isUnassignedSection && unassignedSelectMode;
              const isExpanded = !!expandedSections[section.id];
              const compactPreview = section.items.slice(0, 12);
              const compactOverflow = Math.max(0, section.items.length - compactPreview.length);
              return (
                <section
                  key={section.id}
                  className={
                    styles.sectionCard +
                    (!isExpanded ? " " + styles.sectionCardCompact : "")
                  }
                  data-testid="all-media-section"
                  data-section-id={section.id}
                  data-expanded={isExpanded ? "true" : "false"}
                >
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionHeadingGroup}>
                      <h2 className={styles.sectionTitle}>{section.title}</h2>
                      <span className={styles.sectionCount}>
                        {section.totalInFilter}{" "}
                        {section.totalInFilter === 1 ? "asset" : "assets"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isUnassignedSection && (
                        <button
                          type="button"
                          data-testid="unassigned-select-toggle"
                          aria-pressed={unassignedSelectMode}
                          className="anext-btn-secondary"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={toggleUnassignedSelectMode}
                        >
                          {unassignedSelectMode ? "Done" : "Select"}
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid="media-section-toggle"
                        aria-expanded={isExpanded}
                        className="anext-btn-secondary"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => toggleSectionExpanded(section.id)}
                      >
                        {isExpanded ? "Minimise ▴" : "Expand ▾"}
                      </button>
                      <button
                        type="button"
                        className="anext-btn-secondary"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => setScope(section.id)}
                      >
                        Open →
                      </button>
                    </div>
                  </div>

                  {sectionSelectMode && (
                    <UnassignedActionBar
                      selectionLabel={unassignedSelectionLabel}
                      selectedCount={selectedUnassignedIds.length}
                      totalCount={unassignedItemsInScope.length}
                      collections={collectionsData?.collections ?? []}
                      targetCollectionId={unassignedAssignTarget}
                      onTargetChange={setUnassignedAssignTarget}
                      onSelectAll={selectAllUnassigned}
                      onClearSelection={clearUnassignedSelection}
                      onAssign={() => void assignUnassignedToCollection()}
                      busy={unassignedAssignBusy}
                    />
                  )}

                  {section.items.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "4px 0" }}>
                      No matching files in this collection yet.
                    </div>
                  ) : !isExpanded ? (
                    <div
                      className={styles.compactStrip}
                      data-testid="media-compact-strip"
                    >
                      {compactPreview.map(({ item, src }) => {
                        const isSelected = selectedIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className={
                              styles.compactThumbWrap +
                              (isSelected ? " " + styles.compactThumbWrapSelected : "")
                            }
                            title={item.name}
                            onClick={() => {
                              if (sectionSelectMode) {
                                toggleSelect(item.id);
                              } else {
                                setPreviewId(item.id);
                              }
                            }}
                          >
                            {item.kind === "video" ? (
                              <video
                                src={src}
                                muted
                                playsInline
                                preload="metadata"
                                className={styles.compactThumbImg}
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={src}
                                alt={item.name}
                                className={styles.compactThumbImg}
                                loading="lazy"
                              />
                            )}
                            {!sectionSelectMode && (
                              <button
                                type="button"
                                aria-label={`Select ${item.name}`}
                                aria-pressed={isSelected}
                                className={
                                  styles.compactThumbCheck +
                                  (isSelected ? " " + styles.compactThumbCheckSelected : "")
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelect(item.id);
                                }}
                              >
                                {isSelected ? "✓" : ""}
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {compactOverflow > 0 && (
                        <button
                          type="button"
                          className={styles.compactMorePill}
                          onClick={() => toggleSectionExpanded(section.id)}
                        >
                          +{compactOverflow} more
                        </button>
                      )}
                    </div>
                  ) : view === "list" ? (
                    <div className={styles.list} role="list">
                      <div className={styles.listHead} aria-hidden>
                        <span>{t("media.name")}</span>
                        <span>{t("media.type")}</span>
                        <span>Collection</span>
                        <span>{t("media.size")}</span>
                        <span>{t("media.uploaded")}</span>
                      </div>
                      {visibleItems.map(({ item, src, backend }) => (
                        <MediaRow
                          key={item.id}
                          item={item}
                          src={src}
                          channel={
                            item.channelId ? channelsById.get(item.channelId) : undefined
                          }
                          collectionName={
                            backend.collectionId
                              ? collectionsById.get(backend.collectionId)?.name ??
                                t("media.unassigned")
                              : t("media.unassigned")
                          }
                          contentCategory={backend.contentCategory}
                          selected={selectedIds.has(item.id)}
                          selectMode={sectionSelectMode}
                          onToggleSelect={() => toggleSelect(item.id)}
                          onOpen={() => setPreviewId(item.id)}
                          onDelete={() => setDeleteId(item.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className={styles.grid} role="list">
                      {visibleItems.map(({ item, src, backend }) => (
                        <MediaTile
                          key={item.id}
                          item={item}
                          src={src}
                          channel={
                            item.channelId ? channelsById.get(item.channelId) : undefined
                          }
                          collectionName={
                            backend.collectionId
                              ? collectionsById.get(backend.collectionId)?.name ??
                                t("media.unassigned")
                              : t("media.unassigned")
                          }
                          contentCategory={backend.contentCategory}
                          selected={selectedIds.has(item.id)}
                          selectMode={sectionSelectMode}
                          onToggleSelect={() => toggleSelect(item.id)}
                          onOpen={() => setPreviewId(item.id)}
                        />
                      ))}
                    </div>
                  )}

                  {remaining > 0 && (
                    <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
                      <button
                        type="button"
                        className="anext-btn-secondary"
                        onClick={() =>
                          setSectionLimits((prev) => ({
                            ...prev,
                            [section.id]: (prev[section.id] ?? SECTION_BATCH) + SECTION_BATCH,
                          }))
                        }
                      >
                        Show more ({remaining} remaining)
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )
      ) : items.length === 0 ? (
        workspaceTab === "videos" && videoCategoryFilter !== "all" ? (
          <EmptyState
            icon="media"
            title={
              videoCategoryFilter === "short_form"
                ? "No short-form videos"
                : "No long-form videos"
            }
            description={`No ${videoCategoryFilter === "short_form" ? "short-form" : "long-form"} videos found in this view.`}
            actionLabel="Show all videos"
            onAction={() => setVideoCategoryFilter("all")}
          />
        ) : (
          <EmptyState
            icon="media"
            title={t("media.empty")}
            description={t("media.emptyDesc")}
            actionLabel="Upload media"
            onAction={openUploadModal}
          />
        )
      ) : view === "list" ? (
        <>
          {scope === "unassigned" && unassignedSelectMode && (
            <div style={{ marginBottom: 12 }}>
              <UnassignedActionBar
                selectionLabel={unassignedSelectionLabel}
                selectedCount={selectedUnassignedIds.length}
                totalCount={unassignedItemsInScope.length}
                collections={collectionsData?.collections ?? []}
                targetCollectionId={unassignedAssignTarget}
                onTargetChange={setUnassignedAssignTarget}
                onSelectAll={selectAllUnassigned}
                onClearSelection={clearUnassignedSelection}
                onAssign={() => void assignUnassignedToCollection()}
                busy={unassignedAssignBusy}
              />
            </div>
          )}
          <div className={styles.list} role="list">
            <div className={styles.listHead} aria-hidden>
              <span>{t("media.name")}</span>
              <span>{t("media.type")}</span>
              <span>Collection</span>
              <span>{t("media.size")}</span>
              <span>{t("media.uploaded")}</span>
            </div>
            {items.map(({ item, src, backend }) => (
              <MediaRow
                key={item.id}
                item={item}
                src={src}
                channel={
                  item.channelId ? channelsById.get(item.channelId) : undefined
                }
                collectionName={
                  backend.collectionId
                    ? collectionsById.get(backend.collectionId)?.name ?? t("media.unassigned")
                    : t("media.unassigned")
                }
                contentCategory={backend.contentCategory}
                selected={selectedIds.has(item.id)}
                selectMode={scope === "unassigned" && unassignedSelectMode}
                onToggleSelect={() => toggleSelect(item.id)}
                onOpen={() => setPreviewId(item.id)}
                onDelete={() => setDeleteId(item.id)}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          {scope === "unassigned" && unassignedSelectMode && (
            <div style={{ marginBottom: 12 }}>
              <UnassignedActionBar
                selectionLabel={unassignedSelectionLabel}
                selectedCount={selectedUnassignedIds.length}
                totalCount={unassignedItemsInScope.length}
                collections={collectionsData?.collections ?? []}
                targetCollectionId={unassignedAssignTarget}
                onTargetChange={setUnassignedAssignTarget}
                onSelectAll={selectAllUnassigned}
                onClearSelection={clearUnassignedSelection}
                onAssign={() => void assignUnassignedToCollection()}
                busy={unassignedAssignBusy}
              />
            </div>
          )}
          <div className={styles.grid} role="list">
            {items.map(({ item, src, backend }) => (
              <MediaTile
                key={item.id}
                item={item}
                src={src}
                channel={
                  item.channelId ? channelsById.get(item.channelId) : undefined
                }
                collectionName={
                  backend.collectionId
                    ? collectionsById.get(backend.collectionId)?.name ?? t("media.unassigned")
                    : t("media.unassigned")
                }
                contentCategory={backend.contentCategory}
                selected={selectedIds.has(item.id)}
                selectMode={scope === "unassigned" && unassignedSelectMode}
                onToggleSelect={() => toggleSelect(item.id)}
                onOpen={() => setPreviewId(item.id)}
              />
            ))}
          </div>
        </>
      )}

      {previewEntry && (
        <MediaPreview
          item={previewEntry.item}
          src={previewEntry.src}
          channel={
            previewEntry.item.channelId
              ? channelsById.get(previewEntry.item.channelId)
              : undefined
          }
          collectionName={
            previewEntry.backend.collectionId
              ? collectionsById.get(previewEntry.backend.collectionId)?.name ??
                t("media.unassigned")
              : t("media.unassigned")
          }
          contentCategory={previewEntry.backend.contentCategory ?? null}
          categorySaving={categorySavingId === previewEntry.item.id}
          onChangeCategory={(nextCat) =>
            void handleUpdateVideoCategory(previewEntry.item.id, nextCat)
          }
          onClose={() => setPreviewId(null)}
          onDelete={() => {
            setDeleteId(previewEntry.item.id);
            setPreviewId(null);
          }}
        />
      )}

      {deleteId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("media.deleteConfirmTitle")}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5, 10, 22, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 70,
            padding: 16,
          }}
          onClick={() => {
            if (!deleteBusy) setDeleteId(null);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              background: "var(--bg)",
              border: "1px solid var(--line-soft)",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              {t("media.deleteConfirmTitle")}
            </h2>
            {deleteDepsLoading ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                Checking scheduled, draft, and failed post dependencies…
              </p>
            ) : deleteDeps?.blocked ? (
              <div
                data-testid="media-delete-blocked"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                  fontSize: 12.5,
                }}
              >
                <strong>
                  Cannot delete: {deleteDeps.count} active or scheduled post
                  {deleteDeps.count === 1 ? "" : "s"} depend on this asset.
                </strong>
                <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                  {deleteDeps.dependencies.map((dep) => (
                    <div
                      key={dep.id}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 6,
                        background: "var(--bg)",
                        color: "var(--fg)",
                        border: "1px solid var(--line-soft)",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        [{dep.state}] {dep.channelName} · {formatDate(dep.publishDate)}
                      </div>
                      {dep.snippet && (
                        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                          {dep.snippet}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                {t("media.deleteConfirmBody")}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="anext-btn-secondary"
                disabled={deleteBusy}
                onClick={() => setDeleteId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="media-confirm-delete-btn"
                className="anext-btn-primary"
                style={
                  deleteDeps?.blocked
                    ? { opacity: 0.45, cursor: "not-allowed" }
                    : { background: "var(--danger, #dc2626)", borderColor: "transparent" }
                }
                disabled={deleteBusy || deleteDepsLoading || Boolean(deleteDeps?.blocked)}
                onClick={() => void onDelete(deleteId)}
              >
                {deleteBusy ? "Deleting…" : t("media.deleteBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteCollectionTarget && (
        <ConfirmDialog
          danger
          busy={collectionBusy}
          title={`Delete "${deleteCollectionTarget.name}"?`}
          body="Files inside this collection will move back to Unassigned. Existing drafts and scheduled posts will keep their attachments."
          confirmLabel="Delete collection"
          onConfirm={() => void handleDeleteCollection(deleteCollectionTarget.id)}
          onCancel={() => setDeleteCollectionTarget(null)}
        />
      )}

      {newCollectionOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="New Collection"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5, 10, 22, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 16,
          }}
          onClick={() => setNewCollectionOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 400,
              background: "var(--bg)",
              border: "1px solid var(--line-soft)",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              New Collection
            </h2>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Portrait Photography, Branding, Product"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateCollection();
              }}
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid var(--line-soft)",
                background: "var(--bg)",
                color: "var(--fg)",
                fontSize: 13,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="anext-btn-secondary"
                onClick={() => setNewCollectionOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                disabled={!newCollectionName.trim() || collectionBusy}
                onClick={() => void handleCreateCollection()}
              >
                {collectionBusy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rename Collection"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5, 10, 22, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 16,
          }}
          onClick={() => setRenameTarget(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 400,
              background: "var(--bg)",
              border: "1px solid var(--line-soft)",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Rename Collection
            </h2>
            <input
              type="text"
              autoFocus
              value={renameTarget.name}
              onChange={(e) =>
                setRenameTarget((prev) =>
                  prev ? { ...prev, name: e.target.value } : null,
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRenameCollection();
              }}
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid var(--line-soft)",
                background: "var(--bg)",
                color: "var(--fg)",
                fontSize: 13,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="anext-btn-secondary"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                disabled={!renameTarget.name.trim() || collectionBusy}
                onClick={() => void handleRenameCollection()}
              >
                {collectionBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Upload Media"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5, 10, 22, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 16,
          }}
          onClick={() => {
            if (!uploading) setUploadModalOpen(false);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              background: "var(--bg)",
              border: "1px solid var(--line-soft)",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              {workspaceTab === "videos" ? "Upload Videos" : "Upload Images"}
            </h2>

            {workspaceTab === "videos" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                  Video format classification
                </label>
                <select
                  value={uploadVideoCategory}
                  onChange={(e) =>
                    setUploadVideoCategory(
                      e.target.value as "auto" | "short_form" | "long_form",
                    )
                  }
                  disabled={uploading}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--line-soft)",
                    background: "var(--bg)",
                    color: "var(--fg)",
                    fontSize: 13,
                  }}
                >
                  <option value="auto">Auto-detect (90s+ or 16:9 → Long-form)</option>
                  <option value="short_form">Short-form clip (Shorts / Reels / TikTok)</option>
                  <option value="long_form">Long-form video (YouTube)</option>
                </select>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                Destination collection
              </label>
              <select
                value={uploadTarget}
                onChange={(e) => setUploadTarget(e.target.value)}
                disabled={uploading}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--line-soft)",
                  background: "var(--bg)",
                  color: "var(--fg)",
                  fontSize: 13,
                }}
              >
                <option value="unassigned">{t("media.unassigned")}</option>
                {(collectionsData?.collections ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">+ New collection…</option>
              </select>
            </div>

            {uploadTarget === "__new__" && (
              <input
                type="text"
                placeholder="New collection name (e.g. November Batch 01)"
                value={uploadNewName}
                onChange={(e) => setUploadNewName(e.target.value)}
                disabled={uploading}
                style={{
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--line-soft)",
                  background: "var(--bg)",
                  color: "var(--fg)",
                  fontSize: 13,
                }}
              />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                type="button"
                className="anext-btn-secondary"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadFiles.length > 0
                  ? `${uploadFiles.length} file${uploadFiles.length === 1 ? "" : "s"} selected (change)`
                  : workspaceTab === "videos"
                  ? "Select videos (supports multi-file & >500 MB long-form)"
                  : "Select images"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={workspaceTab === "videos" ? "video/*" : "image/*"}
                multiple
                onChange={(e) => {
                  const picked = e.target.files ? Array.from(e.target.files) : [];
                  setUploadFiles(picked);
                }}
                style={{ display: "none" }}
              />
              {uploadFiles.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--muted)", maxHeight: 96, overflowY: "auto" }}>
                  {uploadFiles.map((f, idx) => (
                    <div key={`${f.name}-${idx}`}>
                      {f.name} ({formatBytes(f.size)})
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="anext-btn-secondary"
                disabled={uploading}
                onClick={() => setUploadModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="anext-btn-primary"
                disabled={
                  uploading ||
                  uploadFiles.length === 0 ||
                  (uploadTarget === "__new__" && !uploadNewName.trim())
                }
                onClick={() => void runBatchUpload()}
              >
                {uploading
                  ? uploadProgress ?? "Uploading…"
                  : `Upload ${uploadFiles.length || ""} file${uploadFiles.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CollectionCard({
  title,
  count,
  coverUrl,
  coverType,
  onOpen,
  onRename,
  featured = false,
  expanded = false,
  onToggleExpand,
  previewAssets = [],
}: {
  title: string;
  count: number;
  coverUrl: string | null;
  coverType: string | null;
  onOpen: () => void;
  onRename?: () => void;
  featured?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  previewAssets?: BackendMedia[];
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={featured ? "media-all-hero-card" : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={styles.tile}
      style={{
        textAlign: "left",
        cursor: "pointer",
        position: "relative",
        gridColumn: featured || expanded ? "1 / -1" : undefined,
        border: featured ? "2px solid var(--accent)" : undefined,
        background: featured ? "var(--selection-bg)" : undefined,
      }}
    >
      <div
        style={
          featured
            ? {
                display: "grid",
                gridTemplateColumns: "minmax(180px, 280px) minmax(0, 1fr)",
                gap: 16,
                alignItems: "center",
              }
            : undefined
        }
      >
        <div
          className={styles.thumbBox}
          style={featured ? { height: 160, borderRadius: 10 } : undefined}
        >
          {coverUrl ? (
            coverType === "video" ? (
              <video
                src={coverUrl}
                muted
                playsInline
                preload="metadata"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt=""
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            )
          ) : (
            <span className={styles.thumbIcon} aria-hidden>
              <ImageIcon />
            </span>
          )}
        </div>

        <div className={styles.tileMeta}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              className={styles.tileName}
              style={featured ? { fontSize: 20, fontWeight: 800 } : undefined}
            >
              {title}
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {onToggleExpand && (
                <button
                  type="button"
                  data-testid="media-collection-card-toggle"
                  aria-expanded={expanded}
                  className="anext-btn-secondary"
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand();
                  }}
                >
                  {expanded ? "Collapse ▴" : "Expand ▾"}
                </button>
              )}
              {onRename && (
                <button
                  type="button"
                  className="anext-btn-secondary"
                  style={{ padding: "2px 7px", fontSize: 11 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename();
                  }}
                  aria-label={`Rename ${title}`}
                >
                  Rename
                </button>
              )}
            </div>
          </div>
          <span className={styles.tileFoot} style={featured ? { fontSize: 13.5 } : undefined}>
            {count} {count === 1 ? "asset" : "assets"}
            {featured ? " · Open stacked All Media view →" : ""}
          </span>
        </div>
      </div>

      {expanded && (
        <div
          data-testid="media-collection-inline-preview"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
            gap: 8,
            paddingTop: 10,
            marginTop: 8,
            borderTop: "1px solid var(--line-soft)",
            cursor: "default",
          }}
        >
          {previewAssets.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              No assets in this collection yet.
            </span>
          ) : (
            previewAssets.map((asset) => {
              const url = mediaPathToUrl(asset.thumbnail || asset.path);
              return (
                <div
                  key={asset.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {url &&
                    (asset.type === "video" && !asset.thumbnail ? (
                      <video
                        src={url}
                        muted
                        playsInline
                        preload="metadata"
                        style={{
                          width: "100%",
                          height: 68,
                          objectFit: "cover",
                          borderRadius: 6,
                          border: "1px solid var(--line-soft)",
                        }}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={asset.name}
                        style={{
                          width: "100%",
                          height: 68,
                          objectFit: "cover",
                          borderRadius: 6,
                          border: "1px solid var(--line-soft)",
                        }}
                      />
                    ))}
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {asset.name}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function UnassignedActionBar({
  selectionLabel,
  selectedCount,
  totalCount,
  collections,
  targetCollectionId,
  onTargetChange,
  onSelectAll,
  onClearSelection,
  onAssign,
  busy,
}: {
  selectionLabel: string;
  selectedCount: number;
  totalCount: number;
  collections: MediaCollectionSummary[];
  targetCollectionId: string;
  onTargetChange: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onAssign: () => void;
  busy: boolean;
}) {
  return (
    <div className={styles.unassignedActionBar} data-testid="unassigned-action-bar">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="anext-btn-secondary"
          style={{ padding: "5px 10px", fontSize: 12 }}
          disabled={totalCount === 0 || selectedCount === totalCount || busy}
          onClick={onSelectAll}
        >
          Select all
        </button>
        <button
          type="button"
          className="anext-btn-secondary"
          style={{ padding: "5px 10px", fontSize: 12 }}
          disabled={selectedCount === 0 || busy}
          onClick={onClearSelection}
        >
          Clear selection
        </button>
        <span
          data-testid="unassigned-selection-count"
          style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)", marginLeft: 4 }}
        >
          {selectionLabel}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          aria-label="Destination collection"
          data-testid="unassigned-assign-select"
          value={targetCollectionId}
          disabled={collections.length === 0 || busy}
          onChange={(e) => onTargetChange(e.target.value)}
          style={{
            padding: "5px 10px",
            borderRadius: 8,
            border: "1px solid var(--line-soft)",
            background: "var(--bg)",
            color: "var(--fg)",
            fontSize: 12.5,
          }}
        >
          {collections.length === 0 ? (
            <option value="">No collections yet</option>
          ) : (
            collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          className="anext-btn-primary"
          data-testid="unassigned-assign-btn"
          style={{ padding: "5px 12px", fontSize: 12.5 }}
          disabled={busy || selectedCount === 0 || !targetCollectionId}
          onClick={onAssign}
        >
          {busy ? "Assigning…" : "Assign to collection"}
        </button>
      </div>
    </div>
  );
}

interface MediaRowProps {
  item: MediaItem;
  src: string;
  channel?: Channel;
  collectionName: string;
  contentCategory?: string | null;
  selected: boolean;
  selectMode?: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
}

function MediaRow({
  item,
  src,
  channel,
  collectionName,
  contentCategory,
  selected,
  selectMode = false,
  onToggleSelect,
  onOpen,
  onDelete,
}: MediaRowProps) {
  const t = useT();
  const handleActivate = selectMode ? onToggleSelect : onOpen;
  return (
    <div
      className={styles.row + (selected ? " " + styles.rowSelected : "")}
      role={selectMode ? "checkbox" : "listitem"}
      aria-checked={selectMode ? selected : undefined}
      data-selected={selected ? "true" : "false"}
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      <div className={styles.nameCell}>
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${item.name}`}
          tabIndex={selectMode ? -1 : 0}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelect}
          style={{ flexShrink: 0, cursor: "pointer" }}
        />
        <span className={styles.thumb} aria-hidden>
          {item.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6 }}
            />
          ) : (
            <VideoIcon />
          )}
        </span>
        <div className={styles.nameMain}>
          <span className={styles.name}>{item.name}</span>
          <span className={styles.dims}>
            {item.width && item.height
              ? `${item.width} × ${item.height}`
              : "-"}
            {item.durationSeconds !== undefined &&
              ` · ${formatDuration(item.durationSeconds)}`}
          </span>
        </div>
      </div>

      <div className={styles.typeCell}>
        <span className={styles.typeChip}>
          {item.kind === "image"
            ? t("media.image")
            : contentCategory === "long_form"
              ? "Long-form"
              : "Short-form"}
        </span>
      </div>

      <div className={styles.channelCell}>
        {channel ? (
          <>
            <ChannelAvatar channel={channel} size={24} radius={6} />
            <span className={styles.channelMain}>
              <span className={styles.channelName}>{channel.name}</span>
              <span className={styles.channelPlatform}>{channel.platform}</span>
            </span>
          </>
        ) : (
          <span className={styles.muted}>{collectionName}</span>
        )}
      </div>

      <div className={styles.sizeCell}>{formatBytes(item.size)}</div>
      <div className={styles.dateCell}>
        {formatDate(item.uploadedAt)}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={t("media.deleteMedia")}
          style={{
            marginLeft: 12,
            border: "none",
            background: "transparent",
            color: "var(--muted)",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {t("common.delete")}
        </button>
      </div>
    </div>
  );
}

interface MediaTileProps {
  item: MediaItem;
  src: string;
  channel?: Channel;
  collectionName: string;
  contentCategory?: string | null;
  selected: boolean;
  selectMode?: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}

function MediaTile({
  item,
  src,
  channel,
  collectionName,
  contentCategory,
  selected,
  selectMode = false,
  onToggleSelect,
  onOpen,
}: MediaTileProps) {
  const t = useT();
  const handleActivate = selectMode ? onToggleSelect : onOpen;
  return (
    <div
      role={selectMode ? "checkbox" : "listitem"}
      aria-checked={selectMode ? selected : undefined}
      data-selected={selected ? "true" : "false"}
      tabIndex={0}
      className={styles.tile + (selected ? " " + styles.tileSelected : "")}
      title={item.name}
      style={{
        cursor: "pointer",
        position: "relative",
      }}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      <div className={styles.thumbBox}>
        {selectMode ? (
          <span
            aria-hidden
            className={
              styles.checkmarkBadge +
              (selected ? " " + styles.checkmarkBadgeSelected : "")
            }
          >
            {selected ? "✓" : ""}
          </span>
        ) : (
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select ${item.name}`}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggleSelect}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 3,
              width: 16,
              height: 16,
              cursor: "pointer",
            }}
          />
        )}
        <span className={styles.thumbBadge}>
          {item.kind === "image"
            ? t("media.image")
            : contentCategory === "long_form"
              ? "Long-form"
              : "Short-form"}
        </span>
        {item.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <video
            src={src}
            muted
            playsInline
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
        <span className={styles.thumbIcon} aria-hidden>
          {item.kind === "image" ? <ImageIcon /> : <VideoIcon />}
        </span>
        {item.durationSeconds !== undefined && (
          <span className={styles.thumbDuration}>
            {formatDuration(item.durationSeconds)}
          </span>
        )}
      </div>

      <div className={styles.tileMeta}>
        <span className={styles.tileName}>{item.name}</span>
        <span className={styles.tileFoot}>
          {item.width && item.height
            ? `${item.width} × ${item.height}`
            : "-"}
          <span className={styles.tileSep}>·</span>
          {formatBytes(item.size)}
        </span>
        <span className={styles.tileFoot}>
          {channel ? (
            <span className={styles.tileChannel}>
              <ChannelAvatar channel={channel} size={16} radius={5} />
              {channel.name} · {channel.platform}
            </span>
          ) : (
            <span>{collectionName}</span>
          )}
          <span className={styles.tileSep}>·</span>
          {formatDate(item.uploadedAt)}
        </span>
      </div>
    </div>
  );
}
interface MediaPreviewProps {
  item: MediaItem;
  src: string;
  channel?: Channel;
  collectionName: string;
  contentCategory?: string | null;
  categorySaving?: boolean;
  onChangeCategory?: (next: "short_form" | "long_form") => void;
  onClose: () => void;
  onDelete: () => void;
}

function MediaPreview({
  item,
  src,
  channel,
  collectionName,
  contentCategory,
  categorySaving,
  onChangeCategory,
  onClose,
  onDelete,
}: MediaPreviewProps) {
  const t = useT();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => previouslyFocusedRef.current?.focus();
  }, []);

  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${item.name}`}
      onClick={onClose}
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div className={styles.modalPreview}>
          {item.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={item.name} />
          ) : (
            <video
              src={src}
              controls
              autoPlay
              muted
              playsInline
            />
          )}
          {item.durationSeconds !== undefined && (
            <span className={styles.modalDuration}>
              {formatDuration(item.durationSeconds)}
            </span>
          )}
        </div>

        <div className={styles.modalSide}>
          <div className={styles.modalHead}>
            <div className={styles.modalTitle}>
              <span className={styles.modalKind}>
                {item.kind === "image" ? t("media.image") : t("media.video")}
              </span>
              <span className={styles.modalName}>{item.name}</span>
            </div>
            <button
              type="button"
              className={styles.modalClose}
              ref={closeButtonRef}
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <CloseIcon />
            </button>
          </div>

          <dl className={styles.modalMeta}>
            <div className={styles.metaRow}>
              <dt className={styles.metaLabel}>{t("media.type")}</dt>
              <dd className={styles.metaValue}>
                {item.kind === "image" ? t("media.image") : t("media.video")}
              </dd>
            </div>
            {item.width && item.height && (
              <div className={styles.metaRow}>
                <dt className={styles.metaLabel}>{t("media.dimensions")}</dt>
                <dd className={styles.metaValue}>
                  {item.width} × {item.height}
                  {formatAspectRatio(item.width, item.height)
                    ? ` (${formatAspectRatio(item.width, item.height)})`
                    : ""}
                </dd>
              </div>
            )}
            {item.kind === "video" && onChangeCategory && (
              <div className={styles.metaRow}>
                <dt className={styles.metaLabel}>Format</dt>
                <dd className={styles.metaValue}>
                  <div style={{ display: "inline-flex", gap: 6 }}>
                    {(
                      [
                        { id: "short_form", label: "Short-form" },
                        { id: "long_form", label: "Long-form" },
                      ] as const
                    ).map((opt) => {
                      const active =
                        (contentCategory === "long_form"
                          ? "long_form"
                          : "short_form") === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={categorySaving}
                          onClick={() => onChangeCategory(opt.id)}
                          className={
                            active ? "anext-btn-primary" : "anext-btn-secondary"
                          }
                          style={{ padding: "3px 8px", fontSize: 11 }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </dd>
              </div>
            )}
            {item.durationSeconds !== undefined && (
              <div className={styles.metaRow}>
                <dt className={styles.metaLabel}>{t("media.duration")}</dt>
                <dd className={styles.metaValue}>
                  {formatDuration(item.durationSeconds)}
                </dd>
              </div>
            )}
            <div className={styles.metaRow}>
              <dt className={styles.metaLabel}>{t("media.size")}</dt>
              <dd className={styles.metaValue}>{formatBytes(item.size)}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt className={styles.metaLabel}>{t("media.uploaded")}</dt>
              <dd className={styles.metaValue}>{formatDate(item.uploadedAt)}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt className={styles.metaLabel}>Collection</dt>
              <dd className={styles.metaValue}>
                {channel ? (
                  <span className={styles.metaChannelValue}>
                    <ChannelAvatar channel={channel} size={16} radius={5} />
                    {channel.name} · {channel.platform}
                  </span>
                ) : (
                  collectionName
                )}
              </dd>
            </div>
          </dl>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.modalBtnPrimary}
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.open(src, "_blank", "noopener,noreferrer");
                }
              }}
            >
              {t("media.download")}
            </button>
            <button
              type="button"
              className={styles.modalBtnSecondary}
              onClick={onDelete}
            >
              {t("common.delete")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
