export const metadata = {
  title: "Privacy Policy · ANEXTPOST",
};

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "48px auto",
        padding: "0 20px",
        lineHeight: 1.65,
        color: "var(--fg, #f9fafb)",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
        ANEXTPOST Privacy Policy
      </h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Last updated: November 15, 2026
      </p>
      <p>
        ANEXTPOST collects only the account and OAuth token data required to
        connect your authorized social media channels, store your media library,
        and publish posts you schedule.
      </p>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 24 }}>
        1. Data Storage &amp; Security
      </h2>
      <p>
        OAuth access and refresh tokens are encrypted at rest and used solely to
        perform user-initiated publishing, analytics, and channel sync actions.
      </p>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 24 }}>
        2. Data Deletion
      </h2>
      <p>
        Disconnecting a channel removes its active connection from scheduling.
        To request full account or data deletion, contact the workspace
        administrator.
      </p>
    </main>
  );
}
