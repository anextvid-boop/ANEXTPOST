"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useChannels } from "@/lib/use-channels";
import {
  attachAdditionalPages,
  connectIntegration,
  getAvailablePages,
  getOauthUrl,
  type ConnectPage,
  type CustomFieldDef,
} from "@/lib/integrations";
import { AddChannelModal } from "./add-channel-modal";
import { CustomFieldsModal } from "./custom-fields-modal";
import { DiscordBotChoiceModal } from "./discord-bot-choice-modal";
import { FarcasterConnectModal } from "./farcaster-connect-modal";
import { PlatformIcon } from "./platform-icon";
import { ProviderCredentialsModal } from "./provider-credentials-modal";
import { TelegramConnectModal } from "./telegram-connect-modal";

const KIND_BADGE: Record<string, string> = {
  linkedin: "Profile",
  "linkedin-page": "Page",
  facebook: "Page",
};

const MULTI_PAGE_PROVIDERS = new Set([
  "linkedin-page",
  "facebook",
  "instagram",
  "youtube",
  "gmb",
  "blogger",
]);

const PLATFORM_ICON_KEY: Record<string, string> = {
  linkedin: "LinkedIn",
  "linkedin-page": "LinkedInPage",
  facebook: "Facebook",
  instagram: "Instagram",
  "instagram-standalone": "InstagramStandalone",
  x: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  threads: "Threads",
  pinterest: "Pinterest",
  bluesky: "Bluesky",
  reddit: "Reddit",
};

const PROVIDER_ENV_HINT: Record<string, string> = {
  linkedin: "LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET",
  "linkedin-page": "LINKEDIN_PAGE_CLIENT_ID and LINKEDIN_PAGE_CLIENT_SECRET",
  facebook: "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET",
  instagram: "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET",
  "instagram-standalone": "INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET",
  x: "X_API_KEY and X_API_SECRET",
  youtube: "YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET",
  tiktok: "TIKTOK_CLIENT_ID and TIKTOK_CLIENT_SECRET",
};

export function iconKeyForProvider(identifier: string, platformLabel: string): string {
  return PLATFORM_ICON_KEY[identifier] || platformLabel || "LinkedIn";
}

export function kindBadgeForProvider(identifier: string): string | undefined {
  return KIND_BADGE[identifier];
}

export function hasMissingOAuthClientId(oauthUrl?: string | null): boolean {
  if (!oauthUrl) return false;
  try {
    const u = new URL(oauthUrl);
    if (u.searchParams.has("client_id") && !u.searchParams.get("client_id")?.trim()) {
      return true;
    }
    if (u.searchParams.has("client_key") && !u.searchParams.get("client_key")?.trim()) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function formatUnconfiguredProviderMessage(platformId: string, label: string): string {
  const envHint = PROVIDER_ENV_HINT[platformId];
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callbackUrl = `${origin}/integrations/social/${platformId}`;
  return envHint
    ? `${label} is not configured on this server yet. Add ${envHint} in .env and register callback URL ${callbackUrl} before starting sign-in.`
    : `${label} requires provider credentials in .env (callback ${callbackUrl}) or custom setup on Schedule.`;
}

/**
 * Shared connection starter used by both the top-left ANEXTPOST menu and
 * Onboarding's "Connect your social accounts" step.
 */
export function useConnectAccountFlow(options?: {
  onConnected?: () => void | Promise<void>;
}) {
  const onConnected = options?.onConnected;
  const [addOpen, setAddOpen] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [unconfiguredProvider, setUnconfiguredProvider] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [credsModalOpen, setCredsModalOpen] = useState(false);
  const [customFieldsState, setCustomFieldsState] = useState<{
    provider: string;
    label: string;
    fields: CustomFieldDef[];
    state: string;
  } | null>(null);
  const [customFieldsSubmitting, setCustomFieldsSubmitting] = useState(false);
  const [customFieldsError, setCustomFieldsError] = useState<string | null>(null);
  const [telegramConnect, setTelegramConnect] = useState<{ state: string } | null>(null);
  const [farcasterConnect, setFarcasterConnect] = useState<{
    clientId: string;
    state: string;
  } | null>(null);
  const [discordChoice, setDiscordChoice] = useState<{
    oauthUrl: string;
    customFields: CustomFieldDef[];
    state: string;
  } | null>(null);

  const startPick = useCallback(async (platformId: string, label: string) => {
    setAddOpen(false);
    setConnectError(null);
    setUnconfiguredProvider(null);
    try {
      const res = await getOauthUrl(platformId);
      const hasOAuth = !!res?.oauthUrl;
      const hasCustomFields = !!(res?.customFields && res.customFields.length > 0);

      if (platformId === "discord" && hasOAuth && hasCustomFields) {
        setDiscordChoice({
          oauthUrl: res.oauthUrl!,
          customFields: res.customFields!,
          state: res.url || "",
        });
        return true;
      }

      if (hasOAuth) {
        if (hasMissingOAuthClientId(res.oauthUrl)) {
          setConnectError(formatUnconfiguredProviderMessage(platformId, label));
          setUnconfiguredProvider({ id: platformId, label });
          return false;
        }
        window.location.href = res.oauthUrl!;
        return true;
      }

      if (platformId === "telegram") {
        setTelegramConnect({ state: res.url || "" });
        return true;
      }

      if (platformId === "wrapcast" && res.neynarClientId) {
        setFarcasterConnect({
          clientId: res.neynarClientId,
          state: res.url || "",
        });
        return true;
      }

      if (hasCustomFields) {
        setCustomFieldsState({
          provider: platformId,
          label: label || platformId,
          fields: res.customFields!,
          state: res.url || "",
        });
        setCustomFieldsError(null);
        return true;
      }

      setConnectError(formatUnconfiguredProviderMessage(platformId, label));
      setUnconfiguredProvider({ id: platformId, label });
      return false;
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : `Could not start ${label} connection.`
      );
      return false;
    }
  }, []);

  const handleCustomFieldsSubmit = useCallback(
    async (values: Record<string, string>) => {
      if (!customFieldsState) return;
      setCustomFieldsSubmitting(true);
      setCustomFieldsError(null);
      try {
        const code = btoa(JSON.stringify(values));
        const result = await connectIntegration(customFieldsState.provider, {
          code,
          state: customFieldsState.state,
        });
        if (result?.error) {
          setCustomFieldsError(result.error);
          setCustomFieldsSubmitting(false);
          return;
        }
        setCustomFieldsState(null);
        setCustomFieldsSubmitting(false);
        await onConnected?.();
      } catch (err) {
        setCustomFieldsError(
          err instanceof Error
            ? err.message
            : "Connection failed. Please check your credentials."
        );
        setCustomFieldsSubmitting(false);
      }
    },
    [customFieldsState, onConnected]
  );

  return {
    addOpen,
    setAddOpen,
    connectError,
    setConnectError,
    unconfiguredProvider,
    setUnconfiguredProvider,
    credsModalOpen,
    setCredsModalOpen,
    customFieldsState,
    setCustomFieldsState,
    customFieldsSubmitting,
    customFieldsError,
    setCustomFieldsError,
    handleCustomFieldsSubmit,
    telegramConnect,
    setTelegramConnect,
    farcasterConnect,
    setFarcasterConnect,
    discordChoice,
    setDiscordChoice,
    onConnected,
    startPick,
  };
}

export function ConnectFlowExtraModals({
  flow,
}: {
  flow: ReturnType<typeof useConnectAccountFlow>;
}) {
  return (
    <>
      {flow.customFieldsState && (
        <CustomFieldsModal
          provider={flow.customFieldsState.provider}
          label={flow.customFieldsState.label}
          fields={flow.customFieldsState.fields}
          onClose={() => {
            flow.setCustomFieldsState(null);
            flow.setCustomFieldsError(null);
          }}
          onSubmit={flow.handleCustomFieldsSubmit}
          submitting={flow.customFieldsSubmitting}
          error={flow.customFieldsError}
        />
      )}
      {flow.telegramConnect && (
        <TelegramConnectModal
          state={flow.telegramConnect.state}
          onClose={() => flow.setTelegramConnect(null)}
          onConnected={() => {
            flow.setTelegramConnect(null);
            void flow.onConnected?.();
          }}
        />
      )}
      {flow.farcasterConnect && (
        <FarcasterConnectModal
          clientId={flow.farcasterConnect.clientId}
          state={flow.farcasterConnect.state}
          onClose={() => flow.setFarcasterConnect(null)}
          onConnected={() => {
            flow.setFarcasterConnect(null);
            void flow.onConnected?.();
          }}
        />
      )}
      {flow.discordChoice && (
        <DiscordBotChoiceModal
          onCancel={() => flow.setDiscordChoice(null)}
          onChooseShared={() => {
            const url = flow.discordChoice!.oauthUrl;
            flow.setDiscordChoice(null);
            window.location.href = url;
          }}
          onChooseOwn={() => {
            flow.setCustomFieldsState({
              provider: "discord",
              label: "Discord",
              fields: flow.discordChoice!.customFields,
              state: flow.discordChoice!.state,
            });
            flow.setDiscordChoice(null);
            flow.setCustomFieldsError(null);
          }}
        />
      )}
    </>
  );
}

/**
 * Top-left ANEXTPOST brand menu button. Displays the active workspace's
 * connected accounts (platform icon, exact name, Profile/Page badge, status)
 * and opens the shared AddChannelModal connection flow.
 */
export function BrandConnectionsMenu({
  label = "ANEXTPOST",
  fontSize = "19px",
}: {
  label?: string;
  fontSize?: string;
}) {
  const { user } = useAuth();
  const { channels, loading, refresh } = useChannels();
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [syncChannelId, setSyncChannelId] = useState<string | null>(null);
  const [syncPages, setSyncPages] = useState<ConnectPage[]>([]);
  const [syncConnectedIds, setSyncConnectedIds] = useState<Set<string>>(new Set());
  const [syncSelected, setSyncSelected] = useState<Set<string>>(new Set());
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncSaving, setSyncSaving] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const connectFlow = useConnectAccountFlow({ onConnected: refresh });
  const {
    addOpen,
    setAddOpen,
    connectError,
    setConnectError,
    unconfiguredProvider,
    credsModalOpen,
    setCredsModalOpen,
    startPick,
  } = connectFlow;
  const ref = useRef<HTMLDivElement>(null);

  const openSyncPages = useCallback(async (channelId: string) => {
    setOpen(false);
    setSyncChannelId(channelId);
    setSyncLoading(true);
    setSyncError(null);
    setSyncPages([]);
    setSyncSelected(new Set());
    try {
      const res = await getAvailablePages(channelId);
      const already = new Set((res.connectedInternalIds || []).map(String));
      setSyncConnectedIds(already);
      setSyncPages(res.pages || []);
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : "Could not load available pages."
      );
    } finally {
      setSyncLoading(false);
    }
  }, []);

  const activeOrg = user?.organizations?.find((o) => o.id === user.orgId);

  const groupedChannels = useMemo(() => {
    const groups: { key: string; items: typeof channels }[] = [];
    const byKey = new Map<string, typeof channels>();
    for (const ch of channels) {
      const key = ch.identifier || ch.platform || ch.id;
      let bucket = byKey.get(key);
      if (!bucket) {
        bucket = [];
        byKey.set(key, bucket);
        groups.push({ key, items: bucket });
      }
      bucket.push(ch);
    }
    return groups;
  }, [channels]);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        data-testid="brand-connections-menu-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="ANEXTPOST workspace connections menu"
        onClick={() => {
          setConnectError(null);
          if (!open) void refresh();
          setOpen((v) => !v);
        }}
        className="brand"
        style={{
          fontSize,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          padding: "4px 6px",
          margin: "-4px -6px",
          borderRadius: "var(--radius-sm)",
          color: "var(--fg)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <span>{label}</span>
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

      {open && (
        <div
          role="dialog"
          aria-label="Workspace connections"
          data-testid="brand-connections-popover"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            minWidth: 320,
            maxWidth: 370,
            zIndex: 1200,
            backgroundColor: "var(--bg)",
            color: "var(--fg)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 18px 40px rgba(0, 0, 0, 0.28)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg)" }}>
                {activeOrg?.name || "Workspace"}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {loading ? "Checking accounts…" : `${channels.length} connected account${channels.length === 1 ? "" : "s"}`}
              </div>
            </div>
            <Link
              href="/calendar"
              onClick={() => setOpen(false)}
              style={{ fontSize: 11, color: "var(--muted)", textDecoration: "underline", flexShrink: 0 }}
            >
              Schedule
            </Link>
          </div>

          {connectError && (
            <div
              role="alert"
              data-testid="brand-connect-error"
              style={{
                fontSize: 11.5,
                lineHeight: 1.45,
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--page)",
                color: "var(--warning, #d97706)",
                border: "1px solid var(--line)",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <span>{connectError}</span>
              {unconfiguredProvider && (
                <button
                  type="button"
                  data-testid="configure-provider-keys-btn"
                  onClick={() => {
                    setOpen(false);
                    setCredsModalOpen(true);
                  }}
                  style={{
                    alignSelf: "flex-start",
                    height: 28,
                    padding: "0 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--line)",
                    backgroundColor: "var(--bg)",
                    color: "var(--fg)",
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Configure API Keys
                </button>
              )}
            </div>
          )}

          {channels.length === 0 ? (
            <div
              style={{
                padding: "10px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--page)",
                border: "1px solid var(--line)",
                fontSize: 12,
                color: "var(--muted)",
                lineHeight: 1.45,
              }}
            >
              No accounts connected in this workspace yet. Connect a LinkedIn Profile, LinkedIn Page, or Facebook Page to publish.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
              {groupedChannels.map((group) => {
                const isExpanded = !!expandedGroups[group.key];
                const extraCount = group.items.length - 1;
                const renderChannelRow = (ch: (typeof channels)[number], isPrimary: boolean) => {
                  const ident = ch.identifier ?? "";
                  const kind = kindBadgeForProvider(ident);
                  const statusLabel = ch.refreshNeeded ? "Reconnect needed" : "Connected";
                  return (
                    <div
                      key={ch.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--line)",
                        backgroundColor: "var(--page)",
                      }}
                    >
                      <PlatformIcon platform={iconKeyForProvider(ident, ch.platform)} size={20} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ch.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                          {kind && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "1px 5px",
                                borderRadius: 4,
                                backgroundColor: "var(--bg)",
                                border: "1px solid var(--line)",
                                color: "var(--muted)",
                              }}
                            >
                              {kind}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 10.5,
                              color: ch.refreshNeeded ? "var(--warning, #d97706)" : "var(--success, #16a34a)",
                              fontWeight: 600,
                            }}
                          >
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                      {isPrimary && extraCount > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.key)}
                          aria-expanded={isExpanded}
                          data-testid={`group-expand-${group.key}`}
                          title={isExpanded ? "Collapse accounts" : `Show ${extraCount} more ${ch.platform || ident} account${extraCount === 1 ? "" : "s"}`}
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
                      {MULTI_PAGE_PROVIDERS.has(ident) && !ch.refreshNeeded && (
                        <button
                          type="button"
                          onClick={() => void openSyncPages(ch.id)}
                          title="Sync or attach additional pages from this account"
                          style={{
                            height: 24,
                            padding: "0 8px",
                            borderRadius: 4,
                            border: "1px solid var(--line)",
                            backgroundColor: "var(--bg)",
                            color: "var(--fg)",
                            fontSize: 10.5,
                            fontWeight: 600,
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          + Pages
                        </button>
                      )}
                    </div>
                  );
                };

                const [primary, ...rest] = group.items;
                return (
                  <div key={group.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {renderChannelRow(primary, true)}
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
                        {rest.map((ch) => renderChannelRow(ch, false))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            data-testid="brand-connect-account-btn"
            onClick={() => {
              setOpen(false);
              setAddOpen(true);
            }}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: "var(--radius-sm)",
              background: "var(--fg)",
              color: "var(--bg)",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Connect an account
          </button>
        </div>
      )}

      {addOpen && (
        <AddChannelModal
          onClose={() => setAddOpen(false)}
          onPick={(id, lbl) => {
            void startPick(id, lbl).then((redirecting) => {
              if (!redirecting) {
                setTimeout(() => setOpen(true), 0);
              }
            });
          }}
        />
      )}

      {credsModalOpen && unconfiguredProvider && (
        <ProviderCredentialsModal
          providerId={unconfiguredProvider.id}
          label={unconfiguredProvider.label}
          onClose={() => setCredsModalOpen(false)}
          onSavedAndConnect={(id, lbl) => {
            setCredsModalOpen(false);
            void startPick(id, lbl).then((redirecting) => {
              if (!redirecting) {
                setTimeout(() => setOpen(true), 0);
              }
            });
          }}
        />
      )}

      <ConnectFlowExtraModals flow={connectFlow} />

      {syncChannelId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add or sync pages"
          onClick={() => setSyncChannelId(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            backgroundColor: "rgba(0, 0, 0, 0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: "var(--bg)",
              color: "var(--fg)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 22px 48px rgba(0, 0, 0, 0.4)",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Add or Sync Pages</div>
              <button
                type="button"
                onClick={() => setSyncChannelId(null)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--fg)",
                  width: 26,
                  height: 26,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            {syncLoading ? (
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Loading available pages…</div>
            ) : syncError ? (
              <div style={{ fontSize: 12.5, color: "var(--warning, #d97706)" }}>{syncError}</div>
            ) : syncPages.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                No additional pages found for this token.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {syncPages.map((p) => {
                  const key = String(p.page || p.id);
                  const already =
                    syncConnectedIds.has(String(p.id)) || syncConnectedIds.has(key);
                  const checked = already || syncSelected.has(key);
                  return (
                    <label
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--line)",
                        backgroundColor: "var(--page)",
                        cursor: already ? "default" : "pointer",
                        opacity: already ? 0.65 : 1,
                        fontSize: 12.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        disabled={already}
                        checked={checked}
                        onChange={() => {
                          setSyncSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        }}
                      />
                      <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
                      {already && (
                        <span style={{ fontSize: 10.5, color: "var(--success, #16a34a)", fontWeight: 600 }}>
                          Connected
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setSyncChannelId(null)}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--line)",
                  backgroundColor: "var(--page)",
                  color: "var(--fg)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                type="button"
                disabled={syncSaving || syncSelected.size === 0}
                onClick={async () => {
                  if (!syncChannelId || syncSelected.size === 0) return;
                  setSyncSaving(true);
                  setSyncError(null);
                  try {
                    await attachAdditionalPages(syncChannelId, Array.from(syncSelected));
                    await refresh();
                    setSyncChannelId(null);
                  } catch (err) {
                    setSyncError(
                      err instanceof Error ? err.message : "Could not attach selected pages."
                    );
                  } finally {
                    setSyncSaving(false);
                  }
                }}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "var(--fg)",
                  color: "var(--bg)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: syncSaving || syncSelected.size === 0 ? "not-allowed" : "pointer",
                  opacity: syncSaving || syncSelected.size === 0 ? 0.6 : 1,
                }}
              >
                {syncSaving ? "Connecting…" : `Connect (${syncSelected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
