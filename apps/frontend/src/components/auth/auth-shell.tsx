"use client";

import type { ReactNode } from "react";
import styles from "./auth.module.css";
import { useT } from "@/lib/i18n";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  banner,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  banner?: ReactNode;
}) {
  const t = useT();
  return (
    <div className={styles.page}>
      {banner && <div className={styles.topBanner}>{banner}</div>}
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandName}>ANEXTPOST</span>
        </div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        {children}
        {footer && <div className={styles.foot}>{footer}</div>}
        <div className={styles.legal}>
          {t("auth.legalPrefix")}{" "}
          <a
            href="https://github.com/anextvid-boop/ANEXTPOST#terms"
            target="_blank"
            rel="noreferrer"
          >
            {t("auth.legalTerms")}
          </a>{" "}
          {t("auth.legalAnd")}{" "}
          <a
            href="https://github.com/anextvid-boop/ANEXTPOST#privacy"
            target="_blank"
            rel="noreferrer"
          >
            {t("auth.legalPrivacy")}
          </a>
          .
        </div>
      </div>
    </div>
  );
}
