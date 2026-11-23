"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./setup-checklist.module.css";
import { useT, type MessageKey } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { fetchPostsList } from "@/lib/posts";
import { InfoTip } from "./info-tip";
import type { BackendIntegration } from "@/lib/integrations";

/**
 * Default Integration.postingTimes from the Prisma schema (minutes from
 * midnight). A channel still sitting on exactly these three slots has never
 * had its queue configured, which is what the third item checks.
 */
const DEFAULT_POSTING_TIMES = [120, 400, 700];

function hasCustomPostingTimes(raw: BackendIntegration[]): boolean {
  return raw.some((i) => {
    const times = (i.time ?? []).map((t) => t.time).sort((a, b) => a - b);
    if (times.length !== DEFAULT_POSTING_TIMES.length) return true;
    return times.some((t, idx) => t !== DEFAULT_POSTING_TIMES[idx]);
  });
}

function dismissKey(userId: string | undefined): string {
  return `postsider:setup-checklist-dismissed:${userId ?? "anon"}`;
}

interface Props {
  channels: { id: string }[];
  raw: BackendIntegration[];
  /** True while channels are still loading — suppresses a flash of "0 done". */
  loading?: boolean;
  onConnect: () => void;
  /** Opens the composer. Undefined when there is nothing to post to yet. */
  onCompose?: () => void;
  /**
   * Bump this after a post is created anywhere on the page to re-fetch the
   * post count. Without it, using the checklist's own "Write a post" button
   * left the item stuck un-done until a full page reload, because the count
   * was only re-fetched when the channel list changed.
   */
  refreshSignal?: number;
  /** Render as a compact status-strip pill whose steps open in a popover. */
  inlineStrip?: boolean;
}

/**
 * Setup checklist shown on the calendar until the org is actually usable.
 *
 * Exists because the full-page onboarding flow only ever fires on the
 * registration and activation paths. Accounts created any other way (the
 * manual script used throughout the private beta) never pass through it and
 * land on an empty calendar with no orientation at all.
 *
 * Completion is derived from real data rather than stored flags, so it can
 * never disagree with the account's actual state — only the dismissal is
 * persisted, and only in localStorage, since it is a per-person display
 * preference and not worth a migration.
 */
export function SetupChecklist({
  channels,
  raw,
  loading,
  onConnect,
  onCompose,
  refreshSignal,
  inlineStrip = false,
}: Props) {
  const t = useT();
  const { user } = useAuth();
  const [postCount, setPostCount] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!inlineStrip || !expanded) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [inlineStrip, expanded]);

  // Read the dismissal after mount — localStorage is not available during SSR
  // and reading it in useState would desync the first client render.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(dismissKey(user?.id)) === "1");
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    fetchPostsList({ page: 0, limit: 1, state: "all" })
      .then((res) => {
        if (!cancelled) setPostCount(res.total ?? 0);
      })
      .catch(() => {
        // A failed count must not render the checklist as "nothing done" —
        // leaving it null keeps the item in its unknown state and the whole
        // checklist hidden below.
        if (!cancelled) setPostCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [channels.length, refreshSignal]);

  // Steps 2 and 3 are meaningless without a channel: the composer has nothing
  // to post to and the queue-plan page renders "No channels connected yet".
  // They are marked locked rather than given a live button, because a CTA that
  // silently goes nowhere reads as a broken product (both testers in the
  // 2026-08-06 audit hit exactly that and assumed the app was broken).
  const hasChannel = channels.length > 0;

  const items = useMemo(
    () => [
      {
        id: "connect",
        done: hasChannel,
        locked: false,
        title: t("setupChecklist.connectTitle"),
        desc: t("setupChecklist.connectDesc"),
        cta: t("setupChecklist.connectCta"),
        onClick: onConnect,
        href: undefined as string | undefined,
        // "Channel" was the single most confusing word for a first-run tester:
        // it is the thing the whole checklist asks you to create, and it was
        // defined nowhere outside a FAQ on the billing page.
        tip: "infoTip.channel" as MessageKey,
      },
      {
        id: "post",
        done: (postCount ?? 0) > 0,
        locked: !hasChannel,
        title: t("setupChecklist.postTitle"),
        desc: hasChannel
          ? t("setupChecklist.postDesc")
          : t("setupChecklist.needsChannel"),
        cta: t("setupChecklist.postCta"),
        onClick: onCompose,
        href: undefined as string | undefined,
        tip: "infoTip.draft" as MessageKey,
      },
      {
        id: "schedule",
        done: hasCustomPostingTimes(raw),
        locked: !hasChannel,
        title: t("setupChecklist.scheduleTitle"),
        desc: hasChannel
          ? t("setupChecklist.scheduleDesc")
          : t("setupChecklist.needsChannel"),
        cta: t("setupChecklist.scheduleCta"),
        onClick: undefined,
        href: "/settings/queue-plan",
        tip: "infoTip.slot" as MessageKey,
      },
    ],
    [hasChannel, postCount, raw, t, onConnect, onCompose],
  );

  const doneCount = items.filter((i) => i.done).length;

  // Hide while anything is still unknown (avoids flashing an all-empty
  // checklist at a fully set-up org), once everything is done, and once the
  // user has dismissed it.
  if (loading || postCount === null || dismissed || doneCount === items.length) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    setExpanded(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(dismissKey(user?.id), "1");
    }
  };

  if (inlineStrip) {
    return (
      <div ref={wrapRef} className={styles.stripWrap}>
        <button
          type="button"
          className={
            styles.stripPill + (expanded ? " " + styles.stripPillOpen : "")
          }
          aria-expanded={expanded}
          aria-haspopup="dialog"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className={styles.compactTitle}>{t("setupChecklist.title")}</span>
          <span className={styles.compactCount}>
            {t("setupChecklist.subtitle", {
              done: doneCount,
              total: items.length,
            })}
          </span>
          <span
            className={styles.compactProgress}
            role="progressbar"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={items.length}
          >
            <span
              className={styles.progressFill}
              style={{
                display: "block",
                height: "100%",
                width: `${(doneCount / items.length) * 100}%`,
              }}
            />
          </span>
        </button>

        {expanded && (
          <section
            className={styles.popoverCard}
            role="dialog"
            aria-label={t("setupChecklist.title")}
          >
            <div className={styles.header}>
              <div>
                <h2 className={styles.title}>{t("setupChecklist.title")}</h2>
                <p className={styles.subtitle}>
                  {t("setupChecklist.subtitle", {
                    done: doneCount,
                    total: items.length,
                  })}
                </p>
              </div>
              <div className={styles.compactActions}>
                <button
                  type="button"
                  className={styles.toggleBtn}
                  onClick={() => setExpanded(false)}
                >
                  {t("common.close")}
                </button>
                <button type="button" className={styles.dismiss} onClick={dismiss}>
                  {t("setupChecklist.dismiss")}
                </button>
              </div>
            </div>

            <div
              className={styles.progress}
              role="progressbar"
              aria-valuenow={doneCount}
              aria-valuemin={0}
              aria-valuemax={items.length}
            >
              <div
                className={styles.progressFill}
                style={{ width: `${(doneCount / items.length) * 100}%` }}
              />
            </div>

            <ol className={styles.list}>
              {items.map((it) => (
                <li
                  key={it.id}
                  className={`${styles.item} ${it.done ? styles.itemDone : ""} ${
                    it.locked ? styles.itemLocked : ""
                  }`}
                >
                  <span className={styles.check} aria-hidden>
                    {it.done ? <CheckIcon /> : <span className={styles.dot} />}
                  </span>
                  <span className={styles.itemText}>
                    <span className={styles.itemTitle}>
                      {it.title}
                      {it.tip && <InfoTip textKey={it.tip} />}
                    </span>
                    <span className={styles.itemDesc}>{it.desc}</span>
                  </span>
                  {!it.done &&
                    !it.locked &&
                    (it.href ? (
                      <Link href={it.href} className={styles.itemCta}>
                        {it.cta}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={styles.itemCta}
                        onClick={() => {
                          setExpanded(false);
                          it.onClick?.();
                        }}
                      >
                        {it.cta}
                      </button>
                    ))}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    );
  }

  if (!expanded) {
    return (
      <section className={styles.compactBar} aria-label={t("setupChecklist.title")}>
        <div className={styles.compactLeft}>
          <span className={styles.compactTitle}>{t("setupChecklist.title")}</span>
          <span className={styles.compactCount}>
            {t("setupChecklist.subtitle", {
              done: doneCount,
              total: items.length,
            })}
          </span>
          <div
            className={styles.compactProgress}
            role="progressbar"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={items.length}
          >
            <div
              className={styles.progressFill}
              style={{ width: `${(doneCount / items.length) * 100}%` }}
            />
          </div>
        </div>
        <div className={styles.compactActions}>
          <button
            type="button"
            className={styles.toggleBtn}
            aria-expanded={false}
            onClick={() => setExpanded(true)}
          >
            Show steps
          </button>
          <button type="button" className={styles.dismiss} onClick={dismiss}>
            {t("setupChecklist.dismiss")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-label={t("setupChecklist.title")}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{t("setupChecklist.title")}</h2>
          <p className={styles.subtitle}>
            {t("setupChecklist.subtitle", {
              done: doneCount,
              total: items.length,
            })}
          </p>
        </div>
        <div className={styles.compactActions}>
          <button
            type="button"
            className={styles.toggleBtn}
            aria-expanded={true}
            onClick={() => setExpanded(false)}
          >
            Hide steps
          </button>
          <button type="button" className={styles.dismiss} onClick={dismiss}>
            {t("setupChecklist.dismiss")}
          </button>
        </div>
      </div>

      <div
        className={styles.progress}
        role="progressbar"
        aria-valuenow={doneCount}
        aria-valuemin={0}
        aria-valuemax={items.length}
      >
        <div
          className={styles.progressFill}
          style={{ width: `${(doneCount / items.length) * 100}%` }}
        />
      </div>

      <ol className={styles.list}>
        {items.map((item) => (
          <li
            key={item.id}
            className={`${styles.item} ${item.done ? styles.itemDone : ""} ${
              item.locked ? styles.itemLocked : ""
            }`}
          >
            <span className={styles.check} aria-hidden>
              {item.done ? <CheckIcon /> : <span className={styles.dot} />}
            </span>
            <span className={styles.itemText}>
              <span className={styles.itemTitle}>
                {item.title}
                {item.tip && <InfoTip textKey={item.tip} />}
              </span>
              <span className={styles.itemDesc}>{item.desc}</span>
            </span>
            {!item.done &&
              !item.locked &&
              (item.href ? (
                <Link href={item.href} className={styles.itemCta}>
                  {item.cta}
                </Link>
              ) : (
                <button
                  type="button"
                  className={styles.itemCta}
                  onClick={item.onClick}
                >
                  {item.cta}
                </button>
              ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
