"use client";

import { useCallback, useMemo, useState } from "react";
import styles from "./channels-panel.module.css";
import type { Channel } from "@/lib/calendar-data";
import { ChannelAvatar } from "./channel-avatar";
import { groupChannelsByPlatform } from "./destination-filter-chips";
import { useT } from "@/lib/i18n";

interface ChannelsPanelProps {
  channels: Channel[];
  /** Multi-select (calendar): set of enabled channel IDs. Single-select (analytics): set with at most one ID. */
  enabled: Set<string>;
  collapsed: boolean;
  onToggleChannel: (id: string) => void;
  onToggleCollapse: () => void;
  onAddChannel?: () => void;
  onCreatePost?: () => void;
  /** "multi" = toggle on/off (default). "single" = radio-style; clicking selects only that channel. */
  mode?: "multi" | "single";
  /** Hide the action buttons (Add Channel / Create Post). */
  hideActions?: boolean;
  /** Open the channel detail popup (only used in multi mode). */
  onOpenChannel?: (id: string) => void;
  /** Render compactly inside a toolbar popover without sidebar border/collapse. */
  embedded?: boolean;
}

function ChevronCollapse({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={collapsed ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden width="14" height="14">
      <path
        d="M8 3.5v9M3.5 8h9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Avatar({
  channel,
  withBadge,
  inverted = false,
}: {
  channel: Channel;
  withBadge: boolean;
  inverted?: boolean;
  /** Kept for back-compat — colour now comes from the channel. */
  color?: string;
}) {
  return (
    <ChannelAvatar
      channel={channel}
      size={38}
      radius={11}
      inverted={inverted}
      showPlatformBadge={withBadge}
    />
  );
}

export function ChannelsPanel({
  channels,
  enabled,
  collapsed,
  onToggleChannel,
  onToggleCollapse,
  onAddChannel,
  onCreatePost,
  mode = "multi",
  hideActions = false,
  onOpenChannel,
  embedded = false,
}: ChannelsPanelProps) {
  const t = useT();
  const isSingle = mode === "single";
  const isCollapsed = collapsed && !embedded;
  const Container = embedded ? "div" : "aside";
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const groupedChannels = useMemo(() => groupChannelsByPlatform(channels), [channels]);
  const toggleGroup = useCallback((key: string, current: boolean) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !current }));
  }, []);
  return (
    <Container
      className={
        (embedded ? styles.panelEmbedded : styles.panel) +
        (isCollapsed ? " " + styles.panelCollapsed : "")
      }
      aria-label={t("channels.add")}
    >
      <div className={styles.head}>
        {!isCollapsed && (
          <div className={styles.headText}>
            <span className={styles.headEyebrow}>{t("channels.eyebrow")}</span>
            <span className={styles.headTitle}>{t("channels.title")}</span>
          </div>
        )}
        {!embedded && (
          <button
            type="button"
            className={`${styles.collapseBtn} touch-target`}
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? "Expand channels" : "Collapse channels"}
          >
            <ChevronCollapse collapsed={isCollapsed} />
          </button>
        )}
      </div>

      {!isCollapsed && (
        <>
          {!hideActions && (onAddChannel || onCreatePost) && (
            <div className={styles.actions}>
              {onAddChannel && (
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={onAddChannel}
                >
                  <PlusIcon /> {t("channels.add")}
                </button>
              )}
              {onCreatePost && (
                <button
                  type="button"
                  className={styles.createBtn}
                  onClick={onCreatePost}
                >
                  <PlusIcon /> {t("channels.createPost")}
                </button>
              )}
            </div>
          )}

          {!hideActions && (onAddChannel || onCreatePost) && (
            <div className={styles.divider} />
          )}

          <div
            className={styles.list}
            role={isSingle ? "radiogroup" : "listbox"}
            aria-multiselectable={isSingle ? undefined : true}
          >
            {channels.length === 0 && (
              <div className={styles.empty}>{t("channels.noChannels")}</div>
            )}
            {groupedChannels.map((group) => {
              const [primary, ...rest] = group.items;
              const extraCount = rest.length;
              const hasNestedActive = isSingle
                ? rest.some((c) => enabled.has(c.id))
                : false;
              const isExpanded = expandedGroups[group.key] ?? hasNestedActive;

              const renderRow = (c: Channel, isPrimary: boolean) => {
                const isOn = enabled.has(c.id);
                const handleRowClick = () => {
                  if (isSingle) {
                    onToggleChannel(c.id);
                  } else if (onOpenChannel) {
                    onOpenChannel(c.id);
                  } else {
                    onToggleChannel(c.id);
                  }
                };
                return (
                  <div
                    key={c.id}
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <button
                      type="button"
                      role={isSingle ? "radio" : "option"}
                      aria-checked={isSingle ? isOn : undefined}
                      aria-selected={isSingle ? undefined : isOn}
                      className={
                        styles.row +
                        (isSingle && isOn ? " " + styles.rowActive : "")
                      }
                      style={{ flex: 1, minWidth: 0 }}
                      onClick={handleRowClick}
                      title={`${c.name} · ${c.platform}`}
                    >
                      <Avatar
                        channel={c}
                        withBadge
                        inverted={isSingle && isOn}
                        color={c.color}
                      />
                      <span className={styles.rowText}>
                        <span className={styles.name}>{c.name}</span>
                        <span className={styles.platform}>
                          {c.platform}
                          {c.identifier === "linkedin"
                            ? " · Profile"
                            : c.identifier === "linkedin-page" || c.identifier === "facebook"
                            ? " · Page"
                            : ""}
                        </span>
                      </span>
                      {!isSingle && (
                        <span
                          className={styles.colorDot}
                          style={{ background: c.color }}
                          aria-hidden
                        />
                      )}
                    </button>
                    {isPrimary && extraCount > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key, isExpanded)}
                        aria-expanded={isExpanded}
                        data-testid={`channels-panel-expand-${group.key}`}
                        title={
                          isExpanded
                            ? `Collapse ${c.platform} accounts`
                            : `Show ${extraCount} more ${c.platform} account${extraCount === 1 ? "" : "s"}`
                        }
                        style={{
                          height: 24,
                          padding: "0 7px",
                          borderRadius: 4,
                          border: "1px solid var(--line)",
                          backgroundColor: isExpanded ? "var(--fg)" : "var(--bg)",
                          color: isExpanded ? "var(--bg)" : "var(--fg)",
                          fontSize: 10.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {isExpanded ? `▴ -${extraCount}` : `▾ +${extraCount}`}
                      </button>
                    )}
                  </div>
                );
              };

              return (
                <div
                  key={group.key}
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  {renderRow(primary, true)}
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
                      {rest.map((c) => renderRow(c, false))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {collapsed && (
        <div className={styles.collapsedList}>
          {channels.map((c) => {
            const isOn = enabled.has(c.id);
            const handleClick = () => {
              if (isSingle) {
                onToggleChannel(c.id);
              } else if (onOpenChannel) {
                onOpenChannel(c.id);
              } else {
                onToggleChannel(c.id);
              }
            };
            return (
              <button
                type="button"
                key={c.id}
                className={
                  styles.collapsedRow +
                  (!isOn && !isSingle ? " " + styles.collapsedRowDisabled : "") +
                  (isSingle && isOn ? " " + styles.collapsedRowActive : "")
                }
                onClick={handleClick}
                title={`${c.name} · ${c.platform}`}
                aria-pressed={isOn}
              >
                <Avatar
                  channel={c}
                  withBadge={false}
                  inverted={isSingle && isOn}
                  color={c.color}
                />
              </button>
            );
          })}
        </div>
      )}
    </Container>
  );
}
