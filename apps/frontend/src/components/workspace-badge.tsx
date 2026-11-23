"use client";

import { useAuth } from "@/lib/auth-context";

export const WORKSPACE_COLORS = [
  "#2563EB",
  "#0EA5E9",
  "#10B981",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
] as const;

export function channelDestinationLabel(ch: {
  name: string;
  platform?: string;
  identifier?: string;
}): string {
  const id = (ch.identifier || ch.platform || "").toLowerCase();
  if (id === "linkedin-page") return `LinkedIn Page · ${ch.name}`;
  if (id === "linkedin") return `LinkedIn Profile · ${ch.name}`;
  return ch.name;
}

/**
 * Displays the active workspace name, colour, and optional icon so users always
 * know which workspace owns the current media, collections, and scheduled posts.
 */
export function WorkspaceBadge({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { user } = useAuth();
  const org = user?.organizations?.find((o) => o.id === user.orgId);
  if (!org) return null;

  const accent = org.color || "#3B82F6";
  const badgeChar = (org.icon || org.name.slice(0, 1) || "W").toUpperCase();

  return (
    <span
      data-testid="active-workspace-badge"
      title={`Active workspace: ${org.name}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 6 : 8,
        padding: compact ? "3px 9px" : "5px 11px",
        borderRadius: 999,
        border: "1px solid var(--line-soft)",
        background: "rgb(var(--tint) / 0.04)",
        fontSize: compact ? 11.5 : 12,
        fontWeight: 600,
        color: "var(--fg)",
        lineHeight: 1.2,
      }}
    >
      <span
        aria-hidden
        style={{
          width: compact ? 16 : 18,
          height: compact ? 16 : 18,
          borderRadius: 999,
          background: accent,
          color: "#FFFFFF",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: compact ? 9.5 : 10.5,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {badgeChar}
      </span>
      <span style={{ color: "var(--muted)", fontWeight: 500 }}>Workspace:</span>
      <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {org.name}
      </span>
    </span>
  );
}
