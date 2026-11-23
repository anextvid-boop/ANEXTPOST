"use client";

import { useEffect, useState } from "react";
import {
  getProviderCredentials,
  saveProviderCredentials,
} from "@/lib/integrations";

const DEVELOPER_PORTAL_HINT: Record<
  string,
  { url: string; portalName: string; idLabel: string; secretLabel: string; steps: string[] }
> = {
  linkedin: {
    url: "https://www.linkedin.com/developers/apps",
    portalName: "LinkedIn Developer Portal",
    idLabel: "Client ID",
    secretLabel: "Client Secret",
    steps: [
      "Open the LinkedIn Developer Portal and click Create app (link any Company Page).",
      "Under Products, request Share on LinkedIn and Sign In with LinkedIn using OpenID Connect.",
      "Under Auth -> Authorized redirect URLs, add the Callback URL below, then copy Client ID & Client Secret.",
    ],
  },
  "linkedin-page": {
    url: "https://www.linkedin.com/developers/apps",
    portalName: "LinkedIn Developer Portal",
    idLabel: "Client ID",
    secretLabel: "Client Secret",
    steps: [
      "Create a separate LinkedIn Developer App dedicated to Company Pages (LinkedIn does not allow Community Management API on the same app as Share on LinkedIn / OpenID Connect).",
      "Under Products, request Community Management API (the sole product on that app) and complete LinkedIn's review.",
      "Under Auth -> Authorized redirect URLs, add the Callback URL below, then copy Client ID & Client Secret.",
    ],
  },
  facebook: {
    url: "https://developers.facebook.com/apps",
    portalName: "Meta for Developers",
    idLabel: "Facebook App ID",
    secretLabel: "Facebook App Secret",
    steps: [
      "Open Meta for Developers -> Create App -> filter by Others -> select Other -> Business (do not pick Consumer Facebook Login alone).",
      "Add Facebook Login for Business and paste the Callback URL below (and .../instagram if using Instagram) into Valid OAuth Redirect URIs.",
      "Copy App ID and App Secret from App settings -> Basic.",
    ],
  },
  instagram: {
    url: "https://developers.facebook.com/apps",
    portalName: "Meta for Developers",
    idLabel: "Facebook App ID",
    secretLabel: "Facebook App Secret",
    steps: [
      "Open Meta for Developers -> Create App -> filter by Others -> select Other -> Business (shares the same app as Facebook).",
      "Add Facebook Login for Business and paste the Callback URL below into Valid OAuth Redirect URIs.",
      "Copy App ID and App Secret from App settings -> Basic.",
    ],
  },
  x: {
    url: "https://developer.x.com/en/portal/dashboard",
    portalName: "X Developer Portal",
    idLabel: "API Key (Consumer Key)",
    secretLabel: "API Secret (Consumer Secret)",
    steps: [
      "Open the X Developer Portal, select your app, and open User authentication settings.",
      "Enable OAuth with Read and write permissions and add the Callback URL below.",
      "Copy your API Key and API Secret from Keys and tokens.",
    ],
  },
  youtube: {
    url: "https://console.cloud.google.com/apis/credentials",
    portalName: "Google Cloud Console",
    idLabel: "Google Client ID",
    secretLabel: "Google Client Secret",
    steps: [
      "In Google Cloud Console, enable YouTube Data API v3 under APIs & Services.",
      "Go to Credentials -> Create Credentials -> OAuth client ID (Web application).",
      "Add the Callback URL below to Authorized redirect URIs, then copy Client ID & Client Secret.",
    ],
  },
  tiktok: {
    url: "https://developers.tiktok.com/apps/",
    portalName: "TikTok for Developers",
    idLabel: "Client Key",
    secretLabel: "Client Secret",
    steps: [
      "Open TikTok for Developers and click Create an app.",
      "Add Login Kit and Content Posting API, and paste the Callback URL below into Redirect URI.",
      "Copy your Client Key and Client Secret from the app details.",
    ],
  },
};

const DEFAULT_OAUTH_STEPS = [
  "Open the platform's Developer Portal and create an OAuth app.",
  "Copy the Callback URL below and paste it into the app's Redirect / Callback URI setting.",
  "Copy the Client ID and Client Secret from your app and save them here.",
];

export interface ProviderCredentialsModalProps {
  providerId: string;
  label: string;
  onClose: () => void;
  onSavedAndConnect: (providerId: string, label: string) => void;
}

/**
 * In-app OAuth App Credentials setup modal so workspace owners can paste
 * Client ID / Client Secret and copy the exact callback URL without editing .env.
 */
export function ProviderCredentialsModal({
  providerId,
  label,
  onClose,
  onSavedAndConnect,
}: ProviderCredentialsModalProps) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [hasExistingSecret, setHasExistingSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callbackUrl = `${origin}/integrations/social/${providerId}`;
  const meta = DEVELOPER_PORTAL_HINT[providerId] ?? {
    url: "",
    portalName: "Provider Developer Portal",
    idLabel: "Client ID",
    secretLabel: "Client Secret",
    steps: DEFAULT_OAUTH_STEPS,
  };

  useEffect(() => {
    let active = true;
    void getProviderCredentials(providerId)
      .then((res) => {
        if (!active) return;
        if (res.clientId) setClientId(res.clientId);
        if (res.hasClientSecret) setHasExistingSecret(true);
      })
      .catch(() => {
        // Non-fatal: user can still enter fresh credentials.
      });
    return () => {
      active = false;
    };
  }, [providerId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedId = clientId.trim();
    const trimmedSecret = clientSecret.trim();
    if (!trimmedId || !trimmedSecret) {
      setError(`Please enter both ${meta.idLabel} and ${meta.secretLabel}.`);
      return;
    }

    setSaving(true);
    try {
      await saveProviderCredentials(providerId, trimmedId, trimmedSecret);
      onSavedAndConnect(providerId, label);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save API credentials. Make sure you are signed in as workspace admin."
      );
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${label} API keys`}
      data-testid="provider-credentials-modal"
      onClick={onClose}
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
          maxWidth: 460,
          backgroundColor: "var(--bg)",
          color: "var(--fg)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-md)",
          boxShadow: "0 22px 48px rgba(0, 0, 0, 0.4)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              Configure {label} API Keys
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              Encrypted in your workspace database — no manual .env editing required.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-sm)",
              color: "var(--fg)",
              width: 28,
              height: 28,
              cursor: "pointer",
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div
          data-testid="provider-setup-instructions"
          style={{
            padding: 12,
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--page)",
            border: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--fg)" }}>
            How to get your {label} API keys
          </div>
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 11.5,
              lineHeight: 1.45,
              color: "var(--muted)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {meta.steps.map((stepText, idx) => (
              <li key={idx}>{stepText}</li>
            ))}
          </ol>
        </div>

        <div
          style={{
            padding: 12,
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--page)",
            border: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fg)" }}>
            1. Register this Callback URL in{" "}
            {meta.url ? (
              <a
                href={meta.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent)", textDecoration: "underline" }}
              >
                {meta.portalName}
              </a>
            ) : (
              meta.portalName
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <code
              data-testid="provider-callback-url"
              style={{
                flex: 1,
                fontSize: 11,
                padding: "6px 8px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--bg)",
                border: "1px solid var(--line)",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                color: "var(--fg)",
              }}
            >
              {callbackUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
                backgroundColor: "var(--bg)",
                color: "var(--fg)",
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600 }}>
            <span>2. {meta.idLabel}</span>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={`Paste ${meta.idLabel}`}
              autoComplete="off"
              style={{
                height: 36,
                padding: "0 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
                backgroundColor: "var(--page)",
                color: "var(--fg)",
                fontSize: 13,
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600 }}>
            <span>
              3. {meta.secretLabel}
              {hasExistingSecret ? " (saved — re-enter to update)" : ""}
            </span>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={`Paste ${meta.secretLabel}`}
              autoComplete="new-password"
              style={{
                height: 36,
                padding: "0 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
                backgroundColor: "var(--page)",
                color: "var(--fg)",
                fontSize: 13,
              }}
            />
          </label>

          {error && (
            <div
              role="alert"
              style={{
                fontSize: 12,
                color: "var(--warning, #d97706)",
                backgroundColor: "var(--page)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 10px",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 34,
                padding: "0 14px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
                backgroundColor: "var(--page)",
                color: "var(--fg)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              data-testid="provider-credentials-save-btn"
              style={{
                height: 34,
                padding: "0 14px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                backgroundColor: "var(--fg)",
                color: "var(--bg)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save & Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
