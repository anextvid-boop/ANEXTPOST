"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlatformIcon } from "./platform-icon";
import { formatDestinationRole } from "@/lib/builder-batch";

export interface DestinationChipChannel {
  id: string;
  name: string;
  platform: string;
  identifier: string;
}

export function getPlatformGroupKey(ch: {
  platform?: string;
  identifier?: string;
  id: string;
}): string {
  return (ch.platform || ch.identifier || ch.id).trim().toLowerCase();
}

export function groupChannelsByPlatform<
  T extends { platform?: string; identifier?: string; id: string },
>(channels: T[]): { key: string; label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = [];
  const byKey = new Map<string, { key: string; label: string; items: T[] }>();
  for (const ch of channels) {
    const key = getPlatformGroupKey(ch);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: ch.platform || ch.identifier || "Account",
        items: [],
      };
      byKey.set(key, bucket);
      groups.push(bucket);
    }
    bucket.items.push(ch);
  }
  return groups;
}

interface DestinationFilterChipsProps {
  channels: DestinationChipChannel[];
  selectedChannelIds: string[];
  onChange: (nextChannelIds: string[]) => void;
  testIdPrefix?: string;
  /** When false, hides the "All destinations" reset pill (e.g. for batch/post destination assignment). Default: true. */
  showAllOption?: boolean;
  /** When false, prevents deselecting the last remaining selected channel. Default: true. */
  allowEmpty?: boolean;
  /** "popover" renders a floating expandable window; "inline" expands directly underneath inside narrow sidebars/cards. */
  variant?: "popover" | "inline";
  /** Horizontal alignment of the floating popover. Default: "left". */
  align?: "left" | "right";
  /** Optional override for individual channel item data-testid. */
  chipTestId?: (ch: DestinationChipChannel) => string;
}

export function DestinationFilterChips({
  channels,
  selectedChannelIds,
  onChange,
  testIdPrefix = "dest-filter",
  showAllOption = true,
  allowEmpty = true,
  variant = "popover",
  align = "left",
  chipTestId,
}: DestinationFilterChipsProps) {
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const isAll = selectedChannelIds.length === 0;

  const groupedChannels = useMemo(() => groupChannelsByPlatform(channels), [channels]);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleChannel = useCallback(
    (id: string) => {
      if (selectedChannelIds.includes(id)) {
        const next = selectedChannelIds.filter((x) => x !== id);
        if (!allowEmpty && next.length === 0) return;
        onChange(next);
      } else {
        onChange([...selectedChannelIds, id]);
      }
    },
    [allowEmpty, onChange, selectedChannelIds],
  );

  useEffect(() => {
    if (!open || variant !== "popover") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, variant]);

  // Unique platform icons for the stacked preview on the trigger button
  const stackedIcons = useMemo(() => {
    const source =
      !showAllOption && selectedChannelIds.length > 0
        ? channels.filter((c) => selectedChannelIds.includes(c.id))
        : channels;
    const seen = new Set<string>();
    const list: DestinationChipChannel[] = [];
    for (const ch of source) {
      const k = getPlatformGroupKey(ch);
      if (!seen.has(k)) {
        seen.add(k);
        list.push(ch);
      }
      if (list.length >= 4) break;
    }
    return list;
  }, [channels, selectedChannelIds, showAllOption]);

  const triggerSummary = useMemo(() => {
    if (showAllOption) {
      if (isAll) {
        return `Accounts (${channels.length})`;
      }
      if (selectedChannelIds.length === 1) {
        const match = channels.find((c) => c.id === selectedChannelIds[0]);
        return match ? match.name : "1 selected";
      }
      return `${selectedChannelIds.length} selected`;
    }
    if (selectedChannelIds.length === 0) return "Select destinations";
    if (selectedChannelIds.length === 1) {
      const match = channels.find((c) => c.id === selectedChannelIds[0]);
      return match ? match.name : "1 destination";
    }
    return `${selectedChannelIds.length} destinations`;
  }, [channels, isAll, selectedChannelIds, showAllOption]);

  const renderAccountRow = (
    ch: DestinationChipChannel,
    opts?: {
      extraCount?: number;
      isExpanded?: boolean;
      hiddenSelectedCount?: number;
      onToggleExpand?: () => void;
    },
  ) => {
    const active = selectedChannelIds.includes(ch.id);
    const role = formatDestinationRole(ch.identifier);
    const extraCount = opts?.extraCount ?? 0;
    const isExpanded = opts?.isExpanded ?? false;
    const hiddenSelectedCount = opts?.hiddenSelectedCount ?? 0;

    return (
      <div
        key={ch.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 7px",
          borderRadius: "var(--radius-sm, 8px)",
          border: active ? "1.5px solid var(--accent)" : "1px solid var(--line)",
          background: active ? "rgba(37, 99, 235, 0.10)" : "var(--page)",
        }}
      >
        <button
          type="button"
          data-testid={chipTestId ? chipTestId(ch) : `${testIdPrefix}-chip-${ch.id}`}
          aria-pressed={active}
          onClick={() => toggleChannel(ch.id)}
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "transparent",
            border: "none",
            padding: 0,
            color: "var(--fg)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <PlatformIcon platform={ch.platform} size={16} />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              fontWeight: active ? 700 : 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {ch.name}
          </span>
          {role && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: 999,
                flexShrink: 0,
                background:
                  role === "Profile"
                    ? "rgba(3, 105, 161, 0.16)"
                    : "rgba(109, 40, 217, 0.16)",
                color: role === "Profile" ? "#0369a1" : "#6d28d9",
              }}
            >
              {role}
            </span>
          )}
          <span
            aria-hidden
            style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10.5,
              fontWeight: 700,
              border: active ? "1px solid var(--accent)" : "1px solid var(--line)",
              background: active ? "var(--accent)" : "var(--bg)",
              color: active ? "#ffffff" : "transparent",
            }}
          >
            ✓
          </span>
        </button>

        {extraCount > 0 && opts?.onToggleExpand && (
          <button
            type="button"
            onClick={opts.onToggleExpand}
            aria-expanded={isExpanded}
            data-testid={`${testIdPrefix}-group-expand-${getPlatformGroupKey(ch)}`}
            title={
              isExpanded
                ? `Collapse ${ch.platform} accounts`
                : `Show ${extraCount} more ${ch.platform} account${extraCount === 1 ? "" : "s"}`
            }
            style={{
              height: 22,
              padding: "0 6px",
              borderRadius: 4,
              border: "1px solid var(--line)",
              backgroundColor: isExpanded
                ? "var(--fg)"
                : hiddenSelectedCount > 0
                  ? "rgba(37, 99, 235, 0.14)"
                  : "var(--bg)",
              color: isExpanded ? "var(--bg)" : "var(--fg)",
              fontSize: 10.5,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {isExpanded
              ? `▴ -${extraCount}`
              : hiddenSelectedCount > 0
                ? `▾ +${extraCount} (${hiddenSelectedCount}✓)`
                : `▾ +${extraCount}`}
          </button>
        )}
      </div>
    );
  };

  const panelBody = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          paddingBottom: 4,
          borderBottom: "1px solid var(--line-soft, var(--line))",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
          {groupedChannels.length} platform{groupedChannels.length === 1 ? "" : "s"} ·{" "}
          {channels.length} account{channels.length === 1 ? "" : "s"}
        </div>
        {showAllOption && !isAll && (
          <button
            type="button"
            onClick={() => onChange([])}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
            }}
          >
            Reset to all
          </button>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxHeight: 280,
          overflowY: "auto",
        }}
      >
        {groupedChannels.map((group) => {
          const [primary, ...rest] = group.items;
          const isExpanded = !!expandedGroups[group.key];
          const extraCount = rest.length;
          const hiddenSelectedCount = rest.filter((c) =>
            selectedChannelIds.includes(c.id),
          ).length;

          return (
            <div
              key={group.key}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              {renderAccountRow(primary, {
                extraCount,
                isExpanded,
                hiddenSelectedCount,
                onToggleExpand: () => toggleGroup(group.key),
              })}
              {isExpanded && rest.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    marginLeft: 10,
                    paddingLeft: 10,
                    borderLeft: "2px solid var(--line)",
                  }}
                >
                  {rest.map((ch) => renderAccountRow(ch))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-testid={`${testIdPrefix}-bar`}
      style={{
        position: "relative",
        display: variant === "inline" ? "flex" : "inline-flex",
        flexDirection: variant === "inline" ? "column" : "row",
        alignItems: variant === "inline" ? "stretch" : "center",
        gap: 6,
        flexWrap: variant === "inline" ? "nowrap" : "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {showAllOption && (
          <button
            type="button"
            data-testid={`${testIdPrefix}-all`}
            aria-pressed={isAll}
            onClick={() => onChange([])}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 11px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              border: isAll ? "1.5px solid var(--accent)" : "1px solid var(--line-soft)",
              background: isAll ? "var(--accent)" : "var(--bg)",
              color: isAll ? "#ffffff" : "var(--fg)",
            }}
          >
            All destinations
          </button>
        )}

        <button
          type="button"
          data-testid={`${testIdPrefix}-toggle`}
          aria-expanded={open}
          aria-haspopup={variant === "popover" ? "dialog" : undefined}
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: !isAll || !showAllOption ? 700 : 600,
            cursor: "pointer",
            border:
              open || (!isAll && showAllOption)
                ? "1.5px solid var(--accent)"
                : "1px solid var(--line-soft)",
            background:
              open || (!isAll && showAllOption)
                ? "rgba(37, 99, 235, 0.12)"
                : "var(--bg)",
            color: "var(--fg)",
            maxWidth: "100%",
          }}
        >
          {stackedIcons.length > 0 && (
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                paddingRight: 2,
              }}
            >
              {stackedIcons.map((ch, idx) => (
                <span
                  key={ch.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginLeft: idx === 0 ? 0 : -5,
                    borderRadius: "50%",
                    background: "var(--bg)",
                    border: "1.5px solid var(--bg)",
                  }}
                >
                  <PlatformIcon platform={ch.platform} size={14} />
                </span>
              ))}
            </span>
          )}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {triggerSummary}
          </span>
          <span
            aria-hidden
            style={{
              fontSize: 10,
              color: "var(--muted)",
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 120ms ease",
            }}
          >
            ▾
          </span>
        </button>
      </div>

      {open && variant === "popover" && (
        <div
          role="dialog"
          aria-label="Accounts by platform"
          data-testid={`${testIdPrefix}-popover`}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            ...(align === "right" ? { right: 0 } : { left: 0 }),
            minWidth: 290,
            maxWidth: 360,
            zIndex: 1200,
            backgroundColor: "var(--bg)",
            color: "var(--fg)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md, 12px)",
            boxShadow: "0 18px 40px rgba(0, 0, 0, 0.28)",
            padding: 10,
          }}
        >
          {panelBody}
        </div>
      )}

      {open && variant === "inline" && (
        <div
          data-testid={`${testIdPrefix}-inline-panel`}
          style={{
            backgroundColor: "var(--bg)",
            color: "var(--fg)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md, 12px)",
            padding: 8,
          }}
        >
          {panelBody}
        </div>
      )}
    </div>
  );
}
