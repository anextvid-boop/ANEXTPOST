"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./slide-over-drawer.module.css";

export type SlideOverSize = "sm" | "md" | "lg";

interface SlideOverDrawerProps {
  /** Accessible dialog label (aria-label). */
  label: string;
  /** Optional header title rendered alongside the built-in Close button. */
  title?: ReactNode;
  /** Label for the built-in Close button when `title` is provided. */
  closeLabel?: string;
  /** Width preset: sm (420px), md (540px), lg (760px). Full-width <= 640px. */
  size?: SlideOverSize;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * Shared right-hand slide-out drawer with Escape dismissal, Tab focus trapping,
 * and focus restoration to the triggering control on close.
 */
export function SlideOverDrawer({
  label,
  title,
  closeLabel = "Close",
  size = "sm",
  onClose,
  children,
}: SlideOverDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;

    if (panel) {
      const focusables = getFocusableElements(panel);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        panel.focus();
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === "Tab" && panel) {
        const focusables = getFocusableElements(panel);
        if (focusables.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !panel.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={styles.backdrop}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`${styles.panel} ${styles[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className={styles.header}>
            <span className={styles.title}>{title}</span>
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              {closeLabel}
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
