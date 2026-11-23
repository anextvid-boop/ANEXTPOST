export type FormatTabKey = "social" | "video" | "blogger" | "x";

export interface FormatTabTheme {
  key: FormatTabKey;
  label: string;
  accent: string;
  borderColor: string;
  backgroundWash: string;
  badgeBackground: string;
  badgeText: string;
}

export const FORMAT_TAB_THEMES: Record<FormatTabKey, FormatTabTheme> = {
  social: {
    key: "social",
    label: "Feed · LI · FB · IG · GMB",
    accent: "#6366f1",
    borderColor: "rgba(99, 102, 241, 0.45)",
    backgroundWash:
      "linear-gradient(180deg, rgba(30, 58, 138, 0.24) 0%, rgba(15, 23, 42, 0.08) 42%, transparent 100%)",
    badgeBackground: "rgba(99, 102, 241, 0.16)",
    badgeText: "#a5b4fc",
  },
  video: {
    key: "video",
    label: "Video · YT · TikTok · Shorts",
    accent: "#f43f5e",
    borderColor: "rgba(244, 63, 94, 0.48)",
    backgroundWash:
      "linear-gradient(180deg, rgba(136, 19, 55, 0.26) 0%, rgba(28, 10, 18, 0.1) 42%, transparent 100%)",
    badgeBackground: "rgba(244, 63, 94, 0.16)",
    badgeText: "#fda4af",
  },
  blogger: {
    key: "blogger",
    label: "Blogger · Long Format",
    accent: "#f97316",
    borderColor: "rgba(249, 115, 22, 0.5)",
    backgroundWash:
      "linear-gradient(180deg, rgba(154, 52, 18, 0.28) 0%, rgba(67, 20, 7, 0.1) 42%, transparent 100%)",
    badgeBackground: "rgba(249, 115, 22, 0.16)",
    badgeText: "#fdba74",
  },
  x: {
    key: "x",
    label: "X · Short Format",
    accent: "#06b6d4",
    borderColor: "rgba(6, 182, 212, 0.5)",
    backgroundWash:
      "linear-gradient(180deg, rgba(8, 51, 68, 0.32) 0%, rgba(12, 24, 34, 0.12) 42%, transparent 100%)",
    badgeBackground: "rgba(6, 182, 212, 0.16)",
    badgeText: "#67e8f9",
  },
};

export function isFormatForTab(
  tab: FormatTabKey,
  name: string,
  description?: string | null,
): boolean {
  const n = (name || "").toLowerCase();
  const d = (description || "").toLowerCase();
  const isBlogger =
    n.startsWith("blogger:") || n.includes("blogger") || d.includes("[format:blogger]");
  const isX =
    n.startsWith("x:") || /\bx\b/.test(n) || n.includes("tweet") || d.includes("[format:x]");
  const isVideo =
    n.startsWith("video:") ||
    n.includes("youtube") ||
    n.includes("tiktok") ||
    n.includes("short-form video") ||
    n.includes("shorts") ||
    n.includes("reels") ||
    d.includes("[format:video]");
  if (tab === "blogger") return isBlogger;
  if (tab === "x") return isX;
  if (tab === "video") return isVideo;
  return !isBlogger && !isX && !isVideo;
}
