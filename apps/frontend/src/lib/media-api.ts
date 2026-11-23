import { api } from "./api";
import type { MediaItem } from "./media-data";

export interface BackendMedia {
  id: string;
  name: string;
  originalName: string | null;
  path: string;
  thumbnail: string | null;
  alt: string | null;
  type: "image" | "video" | "audio";
  collectionId?: string | null;
  thumbnailTimestamp?: number | null;
  fileSize?: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  contentHash?: string | null;
  contentCategory?: string | null;
  sourceType?: string | null;
  retentionPolicy?: string | null;
  createdAt: string;
}

export interface MediaCollectionSummary {
  id: string;
  name: string;
  count: number;
  imageCount: number;
  videoCount: number;
  coverPath: string | null;
  coverType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaCollectionsResponse {
  totalCount: number;
  totalImageCount: number;
  totalVideoCount: number;
  allCoverPath: string | null;
  allCoverType: string | null;
  unassignedCount: number;
  unassignedImageCount: number;
  unassignedVideoCount: number;
  unassignedCoverPath: string | null;
  unassignedCoverType: string | null;
  collections: MediaCollectionSummary[];
}

export interface MediaPage {
  pages: number;
  total?: number;
  page?: number;
  limit?: number;
  results: BackendMedia[];
}

export interface MediaStorageOverview {
  totalImages: number;
  totalImageBytes: number;
  totalVideos: number;
  totalVideoBytes: number;
  totalBytes: number;
  shortFormCount: number;
  shortFormBytes: number;
  longFormCount: number;
  longFormBytes: number;
  awaitingDeletionCount: number;
  reclaimableBytes: number;
}

export interface MediaDependencyItem {
  id: string;
  state: string;
  publishDate: string;
  snippet: string;
  channelName: string;
  providerIdentifier: string;
}

export interface MediaDependenciesResponse {
  blocked: boolean;
  count: number;
  dependencies: MediaDependencyItem[];
}

function withBase(path: string): string {
  if (!path) return path;
  if (/^http:\/\/localhost:3000\/uploads\//i.test(path)) {
    return `/uploads/${path.replace(/^http:\/\/localhost:3000\/uploads\//i, "")}`;
  }
  if (/^https?:\/\//i.test(path)) return path;
  // Locally-stored uploads are served from /uploads/<name> by the backend.
  const configured = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";
  const base =
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    /^http:\/\/localhost(?::\d+)?$/i.test(configured)
      ? ""
      : configured.replace(/\/$/, "");
  if (path.startsWith("/")) return base + path;
  return `${base}/uploads/${path}`;
}

export function backendMediaToItem(m: BackendMedia): MediaItem {
  const kind: "image" | "video" =
    m.type === "video" ? "video" : "image"; // audio still goes under "image" thumb fallback
  return {
    id: m.id,
    name: m.originalName || m.name,
    kind,
    size: m.fileSize ?? 0,
    width: m.width ?? undefined,
    height: m.height ?? undefined,
    uploadedAt: m.createdAt,
    channelId: null,
  };
}

export function backendMediaToUrl(m: Pick<BackendMedia, "path">): string {
  return withBase(m.path);
}

export function mediaPathToUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return withBase(path);
}

export async function fetchMedia(
  page = 1,
  search?: string,
  collectionId?: string,
  limit?: number,
  type?: "image" | "video",
  contentCategory?: "short_form" | "long_form" | "standard",
): Promise<MediaPage> {
  return api.get<MediaPage>("/media", {
    page,
    search,
    collectionId,
    limit,
    type,
    contentCategory,
  });
}

export async function fetchMediaStorageOverview(): Promise<MediaStorageOverview> {
  return api.get<MediaStorageOverview>("/media/storage-overview");
}

export async function fetchMediaDependencies(
  id: string,
): Promise<MediaDependenciesResponse> {
  return api.get<MediaDependenciesResponse>(`/media/${encodeURIComponent(id)}/dependencies`);
}

export async function updateMediaMetadata(
  id: string,
  data: {
    contentCategory?: "short_form" | "long_form" | "standard";
    name?: string;
    alt?: string;
  },
): Promise<BackendMedia> {
  return api.patch<BackendMedia>(`/media/${encodeURIComponent(id)}/metadata`, data);
}

export async function fetchMediaCollections(): Promise<MediaCollectionsResponse> {
  return api.get<MediaCollectionsResponse>("/media/collections");
}

export async function createMediaCollection(
  name: string,
): Promise<{ id: string; name: string }> {
  return api.post<{ id: string; name: string }>("/media/collections", { name });
}

export async function renameMediaCollection(
  id: string,
  name: string,
): Promise<{ id: string; name: string }> {
  return api.patch<{ id: string; name: string }>(`/media/collections/${id}`, {
    name,
  });
}

export async function deleteMediaCollection(id: string): Promise<void> {
  await api.del(`/media/collections/${id}`);
}

export async function moveMediaToCollection(
  mediaIds: string[],
  collectionId: string | null,
  onlyIfUnassigned = false,
): Promise<{ updated: number }> {
  return api.post<{ updated: number }>("/media/collections/move", {
    mediaIds,
    collectionId,
    onlyIfUnassigned,
  });
}

export async function deleteMediaItem(id: string): Promise<void> {
  await api.del(`/media/${id}`);
}

export interface UploadedMediaResponse {
  id: string;
  name: string;
  originalName: string | null;
  path: string;
  thumbnail: string | null;
  alt: string | null;
  type: "image" | "video" | "audio";
  collectionId?: string | null;
}

export async function uploadMedia(
  file: File,
  collectionId?: string | null,
): Promise<UploadedMediaResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const path = collectionId
    ? `/media/upload-simple?collectionId=${encodeURIComponent(collectionId)}`
    : "/media/upload-simple";
  return api.upload<UploadedMediaResponse>(path, fd);
}

/**
 * Stream-upload a video (supports >500 MB long-form files via disk-backed
 * backend endpoint) with live upload progress percentage.
 */
export function uploadVideoStream(
  file: File,
  opts?: {
    collectionId?: string | null;
    contentCategory?: "short_form" | "long_form";
    onProgress?: (percent: number) => void;
  },
): Promise<BackendMedia> {
  const params = new URLSearchParams();
  if (opts?.collectionId) params.set("collectionId", opts.collectionId);
  if (opts?.contentCategory) params.set("contentCategory", opts.contentCategory);
  const qs = params.toString();
  const base =
    typeof window !== "undefined" ? "/api" : process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";
  const url = `${base}/media/upload-video-stream${qs ? `?${qs}` : ""}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && opts?.onProgress) {
        opts.onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          opts?.onProgress?.(100);
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid server response after video upload."));
        }
      } else {
        try {
          const parsed = JSON.parse(xhr.responseText);
          reject(new Error(parsed?.message || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading video."));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

export interface YoutubeExtractClipResult {
  id: string;
  name: string;
  path: string;
  title: string;
  startSec: number;
  endSec: number;
  durationSeconds?: number;
}

export interface YoutubeExtractJob {
  id: string;
  url: string;
  status:
    | "queued"
    | "downloading"
    | "transcribing"
    | "analyzing"
    | "clipping"
    | "saving"
    | "completed"
    | "failed";
  progressMessage: string;
  videoTitle?: string;
  collectionId?: string | null;
  collectionName?: string | null;
  clips: YoutubeExtractClipResult[];
  error?: string;
}

export async function startYoutubeExtract(input: {
  url: string;
  collectionId?: string | null;
  createCollectionFromTitle?: boolean;
  clipCount?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  aspectRatio?: "original" | "9:16";
  burnCaptions?: boolean;
}): Promise<YoutubeExtractJob> {
  return api.post<YoutubeExtractJob>("/media/youtube-extract", input);
}

export async function getYoutubeExtractJob(
  jobId: string,
): Promise<YoutubeExtractJob> {
  return api.get<YoutubeExtractJob>(`/media/youtube-extract/${encodeURIComponent(jobId)}`);
}
