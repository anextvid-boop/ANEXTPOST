"use client";

import { useEffect, useRef } from "react";
import styles from "./add-channel-modal.module.css";
import { PlatformIcon } from "./platform-icon";
import { useT } from "@/lib/i18n";

interface PlatformOption {
  /** Identifier passed back when picked. */
  id: string;
  /** Visible label under the icon. */
  label: string;
  /** Used to look up the brand colour and glyph in `platform-icon.tsx`. */
  iconKey: string;
  /** Optional short capability note (e.g. account-type requirement). */
  note?: string;
}

/**
 * Priority channels in the exact user-requested order:
 * LinkedIn + LinkedIn Page together, YouTube, TikTok, Instagram + Instagram Personal together, Facebook, X.
 */
export const PRIORITY_PLATFORMS: PlatformOption[] = [
  { id: "linkedin", label: "LinkedIn", iconKey: "LinkedIn" },
  { id: "linkedin-page", label: "LinkedIn Page", iconKey: "LinkedInPage" },
  { id: "youtube", label: "YouTube", iconKey: "YouTube" },
  { id: "tiktok", label: "TikTok", iconKey: "TikTok" },
  { id: "instagram", label: "Instagram", iconKey: "Instagram" },
  {
    id: "instagram-standalone",
    label: "Instagram Personal",
    iconKey: "InstagramStandalone",
    note: "Business / Creator",
  },
  { id: "facebook", label: "Facebook", iconKey: "Facebook" },
  { id: "x", label: "X", iconKey: "X" },
];

/**
 * Remaining channels in their existing relative order.
 */
export const OTHER_PLATFORMS: PlatformOption[] = [
  { id: "pinterest", label: "Pinterest", iconKey: "Pinterest" },
  { id: "discord", label: "Discord", iconKey: "Discord" },
  { id: "slack", label: "Slack", iconKey: "Slack" },
  { id: "telegram", label: "Telegram", iconKey: "Telegram" },
  { id: "twitch", label: "Twitch", iconKey: "Twitch" },
  { id: "bluesky", label: "Bluesky", iconKey: "Bluesky" },
  { id: "mastodon", label: "Mastodon", iconKey: "Mastodon" },
  { id: "wrapcast", label: "Farcaster", iconKey: "Farcaster" },
  { id: "nostr", label: "Nostr", iconKey: "Nostr" },
  { id: "lemmy", label: "Lemmy", iconKey: "Lemmy" },
  { id: "gmb", label: "Google Business", iconKey: "GoogleBusiness" },
  { id: "blogger", label: "Blogger", iconKey: "Blogger" },
  { id: "notion", label: "Notion", iconKey: "Notion" },
  { id: "listmonk", label: "Listmonk", iconKey: "Listmonk" },
  { id: "medium", label: "Medium", iconKey: "Medium" },
  { id: "wordpress", label: "WordPress", iconKey: "WordPress" },
  { id: "ghost", label: "Ghost", iconKey: "Ghost" },
  { id: "hashnode", label: "Hashnode", iconKey: "Hashnode" },
  { id: "devto", label: "Dev.to", iconKey: "DevTo" },
  { id: "mataroa", label: "Mataroa", iconKey: "Mataroa" },
  { id: "writeas", label: "Write.as", iconKey: "WriteAs" },
  { id: "dribbble", label: "Dribbble", iconKey: "Dribbble" },
  { id: "whop", label: "Whop", iconKey: "Whop" },
  { id: "moltbook", label: "Moltbook", iconKey: "Moltbook" },
];

interface AddChannelModalProps {
  onClose: () => void;
  onPick: (platformId: string, label: string) => void;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PlatformTile({
  opt,
  onPick,
}: {
  opt: PlatformOption;
  onPick: (platformId: string, label: string) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`add-channel-tile-${opt.id}`}
      className={styles.tile}
      onClick={() => onPick(opt.id, opt.label)}
      title={opt.note ? `${opt.label} (${opt.note} only — Meta deprecated personal-tier API)` : opt.label}
    >
      <span className={styles.icon}>
        <PlatformIcon platform={opt.iconKey} size={42} />
      </span>
      <span className={styles.tileTitle}>{opt.label}</span>
      {opt.note && <span className={styles.tileNote}>{opt.note}</span>}
    </button>
  );
}

export function AddChannelModal({ onClose, onPick }: AddChannelModalProps) {
  const t = useT();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      previouslyFocusedRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t("channels.add")}
      onClick={onClose}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <div>
            <span className={styles.eyebrow}>{t("channels.connect")}</span>
            <span className={styles.title}>{t("channels.add")}</span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            ref={closeButtonRef}
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <CloseIcon />
          </button>
        </header>

        <div className={styles.body}>
          <section aria-labelledby="add-channel-priority-heading">
            <h2 id="add-channel-priority-heading" className={styles.sectionHeading}>
              Priority Apps
            </h2>
            <div className={styles.grid}>
              {PRIORITY_PLATFORMS.map((opt) => (
                <PlatformTile key={opt.id} opt={opt} onPick={onPick} />
              ))}
            </div>
          </section>

          <hr className={styles.sectionDivider} />

          <section aria-labelledby="add-channel-other-heading">
            <h2 id="add-channel-other-heading" className={styles.sectionHeading}>
              Other Apps
            </h2>
            <div className={styles.grid}>
              {OTHER_PLATFORMS.map((opt) => (
                <PlatformTile key={opt.id} opt={opt} onPick={onPick} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
