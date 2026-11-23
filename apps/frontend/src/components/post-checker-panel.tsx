"use client";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { checkPost, type CheckResult, type CheckResults } from "@/lib/post-checker-api";
import { useAuth } from "@/lib/auth-context";
import styles from "./post-checker-panel.module.css";

type Props = { content: string; hasMedia: boolean; mediaType?: "image" | "video" | "mixed"; platforms: string[]; onClose: () => void; };

export function PostCheckerPanel({ content, hasMedia, mediaType, platforms, onClose }: Props) {
  const t = useT();
  const { user, refresh } = useAuth();
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<CheckResults>({});
  const [active, setActive] = useState(platforms[0] ?? "");
  const [runKey, setRunKey] = useState(0);

  const runCheck = useCallback(() => {
    setRunKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (platforms.length === 0) {
      setErrorMsg(t("postChecker.platformError"));
      setState("error");
      return;
    }
    let cancelled = false;
    setState("loading");
    setErrorMsg(null);
    checkPost({ content, hasMedia, mediaType, platforms })
      .then((r) => {
        if (cancelled) return;
        setResults(r);
        setActive((prev) => (prev && prev in r ? prev : platforms[0] ?? ""));
        setState("done");
        void refresh();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        setErrorMsg(msg || null);
        setState("error");
      });
    return () => { cancelled = true; };
    // Intentionally only re-runs on mount or explicit retry to avoid burning AI credits while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  const activePlatform = active && active in results ? active : platforms[0] ?? "";

  return (
    <aside className={styles.panel}>
      <div className={styles.head}>
        <strong>{t("postChecker.title")}</strong>
        <button type="button" onClick={onClose} aria-label={t("common.close")}>×</button>
      </div>
      {state === "loading" && <p className={styles.muted}>{t("postChecker.analysing")}</p>}
      {state === "error" && (
        <div role="alert">
          <p className={styles.muted}>{errorMsg ? `${t("postChecker.error")} (${errorMsg})` : t("postChecker.error")}</p>
          {platforms.length > 0 && (
            <button type="button" className={styles.tab} onClick={runCheck}>Retry</button>
          )}
        </div>
      )}
      {state !== "loading" && user?.aiUsage && <p className={styles.muted}>
        {user.aiUsage.remaining === null ? t("postChecker.unlimitedUses") : t("postChecker.usesRemaining", { count: user.aiUsage.remaining })}
      </p>}
      {state === "done" && (
        <>
          {platforms.length > 1 && (
            <div className={styles.tabs}>
              {platforms.map((p) => (
                <button key={p} type="button" className={p === activePlatform ? styles.tabActive : styles.tab} onClick={() => setActive(p)}>{p}</button>
              ))}
            </div>
          )}
          <Result r={results[activePlatform]} t={t as (k: string) => string} />
        </>
      )}
    </aside>
  );
}

function clampPct(value: number | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function Result({ r, t }: { r: CheckResult | { error: string } | undefined; t: (k: string) => string }) {
  if (!r) return null;
  if ("error" in r) return <p className={styles.muted} role="alert">{r.error || t("postChecker.platformError")}</p>;
  const score = clampPct(r.score);
  const bar = (label: string, v: number | undefined) => {
    const pct = clampPct(v);
    return (
      <div className={styles.bar}><span>{label}</span><div className={styles.track}><div className={styles.fill} style={{ width: `${pct}%` }} /></div></div>
    );
  };
  return (
    <div>
      <div className={styles.scoreRow}>
        <div className={styles.ring} style={{ background: `conic-gradient(var(--fg) 0 ${score}%, var(--line-soft) ${score}% 100%)` }}>
          <div className={styles.ringInner}><b>{score}</b><span>/100</span></div>
        </div>
      </div>
      <div className={styles.bars}>
        {bar(t("postChecker.hook"), r.dimensions?.hook)}
        {bar(t("postChecker.clarity"), r.dimensions?.clarity)}
        {bar(t("postChecker.cta"), r.dimensions?.cta)}
        {bar(t("postChecker.platformFit"), r.dimensions?.platformFit)}
      </div>
      {r.positives?.length > 0 && (
        <ul className={styles.good}>{r.positives.map((p, i) => <li key={i}>+ {p}</li>)}</ul>
      )}
      {r.negatives?.length > 0 && (
        <ul className={styles.bad}>{r.negatives.map((n, i) => <li key={i}>- {n}</li>)}</ul>
      )}
    </div>
  );
}
