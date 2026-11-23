"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  connectIntegration,
  saveProviderPage,
  type ConnectPage,
} from "@/lib/integrations";
import { ApiError } from "@/lib/api";

interface Props {
  provider: string;
}

/**
 * Error shown when a two-step provider returns no pages the user administers.
 * Each platform has a different cause, so the hint is provider-specific.
 */
function noPagesMessage(provider: string): string {
  switch (provider) {
    case "instagram":
      return "No Instagram account found. Connect an Instagram Business/Creator account to a Facebook Page you administer, then try again.";
    case "instagram-standalone":
      return "No Instagram account found. Make sure you're logged into an Instagram Business/Creator account.";
    case "facebook":
      return "No pages found. Make sure you're an admin of at least one Facebook Page.";
    case "linkedin-page":
      return "No pages found. Make sure you're an admin of at least one LinkedIn Page.";
    default:
      return "No pages found. Make sure you administer at least one page on this platform.";
  }
}

/**
 * OAuth callback landing.
 *
 * The provider redirects the browser back to /integrations/social/:provider
 * with `?code=…&state=…`. We POST that to the backend to swap the auth code
 * for an Integration row and then send the user back to /calendar.
 *
 * Two-step providers (e.g. LinkedIn Page) return a list of `pages` the user
 * administers. In that case we show a picker and finalize via saveProviderPage.
 *
 * We use an instance ref to make sure the exchange runs exactly once even
 * under React strict-mode double effects.
 */
export function OauthCallback({ provider }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [status, setStatus] = useState<"working" | "ok" | "error" | "pick-page">(
    "working",
  );
  const [message, setMessage] = useState<string>(
    "Finishing the connection with your account…",
  );
  const [pages, setPages] = useState<ConnectPage[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [brokenPics, setBrokenPics] = useState<Record<string, boolean>>({});
  const [integrationId, setIntegrationId] = useState<string>("");
  const [savingPage, setSavingPage] = useState(false);
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;

    // OAuth 2.0 / custom flows return ?code=&state=. OAuth 1.0a providers
    // (e.g. X/Twitter) return ?oauth_token=&oauth_verifier= instead — map
    // them so the backend authenticate() gets code=verifier, state=token.
    const denied = search.get("denied");
    const oauthError = search.get("error");
    const oauthErrorDesc =
      search.get("error_description") ?? search.get("error_reason");

    if (denied || oauthError === "access_denied" || oauthError === "user_denied") {
      setStatus("error");
      setMessage(
        "Authorization was cancelled before completing. Click Try Again to reconnect when ready.",
      );
      return;
    }

    if (oauthError === "unauthorized_scope_error" || oauthError === "invalid_scope") {
      setStatus("error");
      setMessage(
        oauthErrorDesc ||
          "The provider app does not have the required permissions/scopes enabled for this connection.",
      );
      return;
    }

    if (oauthError) {
      setStatus("error");
      setMessage(
        oauthErrorDesc ||
          `Provider returned an authentication error (${oauthError}). Try again.`,
      );
      return;
    }

    const code = search.get("code") ?? search.get("oauth_verifier");
    const state = search.get("state") ?? search.get("oauth_token");
    const refresh = search.get("refresh") || undefined;

    if (!code || !state) {
      setStatus("error");
      setMessage(
        "The provider did not return a valid authorization code. Try again.",
      );
      return;
    }

    (async () => {
      try {
        const res = await connectIntegration(provider, { code, state, refresh });
        if (res?.error) {
          setStatus("error");
          setMessage(res.error);
          return;
        }

        // Two-step provider (e.g. LinkedIn Page): user must pick one or more pages.
        if (res.inBetweenSteps && res.pages && res.pages.length > 0) {
          setIntegrationId(res.id);
          setPages(res.pages);
          setSelectedPages(new Set(res.pages.map((p) => p.page || p.id)));
          setStatus("pick-page");
          setMessage(
            res.pages.length > 1
              ? "Select one or more pages to connect in this workspace."
              : "Choose which page to connect."
          );
          return;
        }

        // Two-step provider but no pages found — user administers no pages.
        if (res.inBetweenSteps && (!res.pages || res.pages.length === 0)) {
          setStatus("error");
          setMessage(noPagesMessage(provider));
          return;
        }

        setStatus("ok");
        setMessage("Channel connected. Taking you back…");
        setTimeout(() => router.replace("/calendar"), 600);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : "Could not finish the connection. Try again.";
        setStatus("error");
        setMessage(msg);
      }
    })();
  }, [provider, router, search]);

  const handlePickPage = async (page: ConnectPage) => {
    if (savingPage) return;
    setSavingPage(true);
    setMessage(`Connecting ${page.name}…`);
    const state = search.get("state") || undefined;
    try {
      const res = await saveProviderPage(integrationId, {
        page: page.page || page.id,
        state,
      });
      if (res?.success) {
        setStatus("ok");
        setMessage("Page connected. Taking you back…");
        setTimeout(() => router.replace("/calendar"), 600);
      } else {
        setStatus("error");
        setMessage("Could not connect the selected page. Try again.");
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Could not connect the selected page. Try again.";
      setStatus("error");
      setMessage(msg);
    } finally {
      setSavingPage(false);
    }
  };

  const handleConnectSelectedPages = async () => {
    if (savingPage || selectedPages.size === 0) return;
    setSavingPage(true);
    const chosen = Array.from(selectedPages);
    setMessage(`Connecting ${chosen.length} page${chosen.length === 1 ? "" : "s"}…`);
    const state = search.get("state") || undefined;
    try {
      const res = await saveProviderPage(integrationId, {
        pages: chosen,
        state,
      });
      if (res?.success) {
        setStatus("ok");
        setMessage(
          `${chosen.length} page${chosen.length === 1 ? "" : "s"} connected. Taking you back…`
        );
        setTimeout(() => router.replace("/calendar"), 600);
      } else {
        setStatus("error");
        setMessage("Could not connect the selected pages. Try again.");
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Could not connect the selected pages. Try again.";
      setStatus("error");
      setMessage(msg);
    } finally {
      setSavingPage(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          padding: 28,
          border: "1px solid var(--line-soft)",
          borderRadius: "var(--radius-xl)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>
          {provider.toUpperCase()}
        </div>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>
          {status === "working" && "Connecting"}
          {status === "ok" && "Connected"}
          {status === "error" && "Connection failed"}
          {status === "pick-page" &&
            (pages.length > 1 ? "Choose pages to connect" : "Choose a page")}
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
          {message}
        </p>

        {status === "pick-page" && (
          <div
            style={{
              marginTop: 18,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {pages.length > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12,
                  color: "var(--muted)",
                  marginBottom: 4,
                }}
              >
                <span>
                  {selectedPages.size} of {pages.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPages.size === pages.length) {
                      setSelectedPages(new Set());
                    } else {
                      setSelectedPages(new Set(pages.map((p) => p.page || p.id)));
                    }
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--accent)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  {selectedPages.size === pages.length ? "Clear all" : "Select all"}
                </button>
              </div>
            )}
            {pages.map((page) => {
              const pageKey = page.page || page.id;
              const isChecked = selectedPages.has(pageKey);
              return (
                <button
                  key={page.id}
                  type="button"
                  disabled={savingPage}
                  onClick={() => {
                    if (pages.length === 1) {
                      void handlePickPage(page);
                      return;
                    }
                    setSelectedPages((prev) => {
                      const next = new Set(prev);
                      if (next.has(pageKey)) next.delete(pageKey);
                      else next.add(pageKey);
                      return next;
                    });
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border:
                      pages.length > 1 && isChecked
                        ? "1.5px solid var(--accent)"
                        : "1px solid var(--line-soft)",
                    background: "var(--bg)",
                    cursor: savingPage ? "default" : "pointer",
                    textAlign: "left",
                    opacity: savingPage ? 0.6 : 1,
                  }}
                >
                  {pages.length > 1 && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      readOnly
                      aria-label={`Select ${page.name}`}
                      style={{ width: 16, height: 16, pointerEvents: "none" }}
                    />
                  )}
                  {page.picture && !brokenPics[page.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={page.picture}
                      alt=""
                      width={32}
                      height={32}
                      style={{ borderRadius: 6, objectFit: "cover" }}
                      onError={() =>
                        setBrokenPics((prev) => ({ ...prev, [page.id]: true }))
                      }
                    />
                  ) : (
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        background: "var(--line-soft)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 13,
                        color: "var(--fg)",
                      }}
                    >
                      {page.name?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                  <span style={{ fontSize: 14, color: "var(--fg)", flex: 1 }}>
                    {page.name}
                  </span>
                </button>
              );
            })}
            {pages.length > 1 && (
              <button
                type="button"
                disabled={savingPage || selectedPages.size === 0}
                onClick={handleConnectSelectedPages}
                style={{
                  marginTop: 8,
                  padding: "10px 16px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--fg)",
                  color: "var(--bg)",
                  border: "none",
                  cursor:
                    savingPage || selectedPages.size === 0
                      ? "not-allowed"
                      : "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  opacity: savingPage || selectedPages.size === 0 ? 0.6 : 1,
                }}
              >
                {savingPage
                  ? "Connecting…"
                  : `Connect ${selectedPages.size} selected page${
                      selectedPages.size === 1 ? "" : "s"
                    }`}
              </button>
            )}
          </div>
        )}

        {status === "error" && (
          <button
            type="button"
            onClick={() => router.replace("/calendar")}
            style={{
              marginTop: 18,
              padding: "9px 16px",
              borderRadius: "var(--radius-md)",
              background: "var(--fg)",
              color: "var(--bg)",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Back to dashboard
          </button>
        )}
      </div>
    </div>
  );
}
