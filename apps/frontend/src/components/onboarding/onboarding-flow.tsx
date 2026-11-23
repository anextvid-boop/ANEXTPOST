"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import {
  markOnboardingCompleted,
  readOnboardingProgress,
  saveOnboardingProgress,
  type OnboardingIntent,
} from "@/lib/onboarding-progress";
import { AgentOnboarding } from "./agent-onboarding";
import { recordClientFunnelStage } from "@/lib/funnel-analytics";
import { useChannels } from "@/lib/use-channels";
import { AddChannelModal } from "../add-channel-modal";
import {
  ConnectFlowExtraModals,
  iconKeyForProvider,
  kindBadgeForProvider,
  useConnectAccountFlow,
} from "../brand-connections-menu";
import { PlatformIcon } from "../platform-icon";
import { ProviderCredentialsModal } from "../provider-credentials-modal";
import styles from "./onboarding.module.css";

type Step = "choice" | "welcome" | "connect" | "agent";

/**
 * This choice changes orientation only, not subscriptions or permissions.
 * Email signup, account activation and first-time Google signup already route
 * to /onboarding; existing social connection/OAuth remains in Calendar.
 */
export function OnboardingFlow() {
  const router = useRouter();
  const search = useSearchParams();
  const { user } = useAuth();
  const t = useT();
  const [step, setStep] = useState<Step>("choice");
  const { channels, refresh } = useChannels();
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

  // The calendar offers a resume link after an agent user leaves this page to
  // connect a social provider. Do not auto-resume after onboarding completed.
  useEffect(() => {
    if (!user?.id || !user?.orgId) return;
    const saved = readOnboardingProgress(user.id, user.orgId);
    if (search.get("flow") === "agents" && saved?.intent === "agents" && !saved.completed) {
      setStep("agent");
    }
  }, [user?.id, user?.orgId, search]);

  const choose = (intent: OnboardingIntent) => {
    void recordClientFunnelStage("onboarding_type_selected", intent === "agents" ? "agents" : "scheduler");
    saveOnboardingProgress(user?.id, user?.orgId, {
      intent,
      completed: false,
      dismissed: false,
    });
    setStep(intent === "agents" ? "agent" : "welcome");
  };

  const finish = () => {
    markOnboardingCompleted(user?.id, user?.orgId);
    router.replace("/calendar");
  };

  const connectSocial = () => {
    markOnboardingCompleted(user?.id, user?.orgId);
    router.replace("/calendar?connect=1");
  };

  const steps: Step[] =
    step === "agent" ? ["choice", "agent"] : ["choice", "welcome", "connect"];

  return (
    <div className={styles.page}>
      <main className={styles.container + (
        step === "choice" || step === "agent" ? " " + styles.wideContainer : ""
      )}>
        <div className={styles.progress} aria-label={t("developerOnboarding.chooseKicker")}>
          {steps.map((part, index) => (
            <span
              key={part}
              aria-hidden="true"
              className={styles.progressDot + (
                steps.indexOf(step) >= index ? " " + styles.progressDotActive : ""
              )}
            />
          ))}
        </div>

        {step === "choice" && (
          <div className={styles.choice}>
            <p className={styles.eyebrow}>{t("developerOnboarding.chooseKicker")}</p>
            <h1 className={styles.choiceTitle}>{t("developerOnboarding.chooseTitle")}</h1>
            <p className={styles.choiceSubtitle}>{t("developerOnboarding.chooseSubtitle")}</p>
            {user?.onTrial && user.trialDaysLeft != null && (
              <p className={styles.trialBadge}>
                {t("onboarding.trialBadge", { days: user.trialDaysLeft })}
              </p>
            )}
            <div className={styles.choiceCards}>
              <button type="button" className={styles.choiceCard} onClick={() => choose("agents")}>
                <span className={styles.choiceIcon} aria-hidden="true">{"{ }"}</span>
                <span className={styles.choiceCardTitle}>
                  {t("developerOnboarding.chooseAgentsTitle")}
                </span>
                <span className={styles.choiceCardDesc}>
                  {t("developerOnboarding.chooseAgentsDescription")}
                </span>
                <span className={styles.choiceMeta}>
                  {t("developerOnboarding.chooseAgentsMeta")}
                </span>
                <span className={styles.choiceArrow} aria-hidden="true">→</span>
              </button>
              <button type="button" className={styles.choiceCard} onClick={() => choose("social")}>
                <span className={styles.choiceIcon} aria-hidden="true">▦</span>
                <span className={styles.choiceCardTitle}>
                  {t("developerOnboarding.chooseSocialTitle")}
                </span>
                <span className={styles.choiceCardDesc}>
                  {t("developerOnboarding.chooseSocialDescription")}
                </span>
                <span className={styles.choiceMeta}>
                  {t("developerOnboarding.chooseSocialMeta")}
                </span>
                <span className={styles.choiceArrow} aria-hidden="true">→</span>
              </button>
            </div>
            <button type="button" className={styles.skipButton} onClick={finish}>
              {t("developerOnboarding.chooseSkip")}
            </button>
          </div>
        )}

        {step === "welcome" && (
          <div className={styles.welcomeLayout}>
            <div className={styles.welcomeLeft}>
              <h1 className={styles.title}>
                {t("onboarding.welcomeTitle", {
                  name: user?.name ? ", " + user.name : "",
                })}
              </h1>
              <p className={styles.subtitle}>{t("onboarding.welcomeSubtitle")}</p>
              {user?.onTrial && user?.trialDaysLeft != null && (
                <p className={styles.trialBadge}>
                  {t("onboarding.trialBadge", { days: user.trialDaysLeft })}
                </p>
              )}
              <ul className={styles.valueProps}>
                <li>
                  <span className={styles.valuePropTitle}>{t("onboarding.valueProp1Title")}</span>
                  <span className={styles.valuePropDesc}>{t("onboarding.valueProp1Desc")}</span>
                </li>
                <li>
                  <span className={styles.valuePropTitle}>{t("onboarding.valueProp2Title")}</span>
                  <span className={styles.valuePropDesc}>{t("onboarding.valueProp2Desc")}</span>
                </li>
                <li>
                  <span className={styles.valuePropTitle}>{t("onboarding.valueProp3Title")}</span>
                  <span className={styles.valuePropDesc}>{t("onboarding.valueProp3Desc")}</span>
                </li>
              </ul>
              <button type="button" className={styles.primaryButton}
                onClick={() => setStep("connect")}>
                {t("onboarding.letsGo")}
              </button>
              <button type="button" className={styles.skipButton} onClick={finish}>
                {t("onboarding.skipSetup")}
              </button>
              <button type="button" className={styles.backButton} onClick={() => setStep("choice")}>
                {t("developerOnboarding.chooseBack")}
              </button>
            </div>
            <div className={styles.welcomeRight}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/onboarding-avatar.png" alt="" className={styles.welcomeImage} />
            </div>
          </div>
        )}

        {step === "connect" && (
          <div className={styles.stepContent}>
            <h1 className={styles.title}>{t("onboarding.connectTitle")}</h1>
            <p className={styles.subtitle}>{t("onboarding.connectDesc")}</p>

            {connectError && (
              <div
                role="alert"
                data-testid="onboarding-connect-error"
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  backgroundColor: "var(--bg)",
                  color: "var(--warning, #d97706)",
                  marginBottom: 14,
                  textAlign: "left",
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
                    data-testid="onboarding-configure-keys-btn"
                    onClick={() => setCredsModalOpen(true)}
                    style={{
                      alignSelf: "flex-start",
                      height: 30,
                      padding: "0 12px",
                      borderRadius: 6,
                      border: "1px solid var(--line)",
                      backgroundColor: "var(--page)",
                      color: "var(--fg)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Configure API Keys
                  </button>
                )}
              </div>
            )}

            {channels.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, textAlign: "left" }}>
                {channels.map((ch) => {
                  const ident = ch.identifier ?? "";
                  const kind = kindBadgeForProvider(ident);
                  return (
                    <div
                      key={ch.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--line-soft)",
                      }}
                    >
                      <PlatformIcon platform={iconKeyForProvider(ident, ch.platform)} size={20} />
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{ch.name}</span>
                      {kind && (
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{kind}</span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--success, #16a34a)" }}>
                        {ch.refreshNeeded ? "Reconnect" : "Connected"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              data-testid="onboarding-connect-btn"
              className={styles.primaryButton}
              onClick={() => {
                setConnectError(null);
                setAddOpen(true);
              }}
            >
              Connect an account
            </button>
            <button type="button" className={styles.skipButton} onClick={finish}>
              {channels.length > 0 ? "Continue to Schedule" : t("onboarding.skipLater")}
            </button>
            <button type="button" className={styles.backButton} onClick={() => setStep("welcome")}>
              {t("developerOnboarding.chooseBack")}
            </button>

            {addOpen && (
              <AddChannelModal
                onClose={() => setAddOpen(false)}
                onPick={(id, label) => {
                  void startPick(id, label);
                }}
              />
            )}

            {credsModalOpen && unconfiguredProvider && (
              <ProviderCredentialsModal
                providerId={unconfiguredProvider.id}
                label={unconfiguredProvider.label}
                onClose={() => setCredsModalOpen(false)}
                onSavedAndConnect={(id, label) => {
                  setCredsModalOpen(false);
                  void startPick(id, label);
                }}
              />
            )}

            <ConnectFlowExtraModals flow={connectFlow} />
          </div>
        )}

        {step === "agent" && (
          <AgentOnboarding onBack={() => setStep("choice")} />
        )}
      </main>
    </div>
  );
}
