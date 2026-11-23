export const metadata = {
  title: "Terms of Service · ANEXTPOST",
};

export default function TermsPage() {
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
        ANEXTPOST Terms of Service
      </h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Last updated: November 15, 2026
      </p>
      <p>
        ANEXTPOST is a social media scheduling and content management
        application. By connecting your social media accounts (including TikTok,
        YouTube, LinkedIn, Instagram, and Facebook), you authorize ANEXTPOST to
        display your connected profile details and publish content you
        explicitly schedule or approve.
      </p>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 24 }}>
        1. Acceptable Use
      </h2>
      <p>
        You are responsible for all content you upload, schedule, and publish
        through ANEXTPOST and must comply with each connected platform&apos;s
        terms and community guidelines.
      </p>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 24 }}>
        2. Account Access &amp; Revocation
      </h2>
      <p>
        You may disconnect any linked social channel or revoke OAuth access at
        any time from ANEXTPOST or from your social platform&apos;s security
        settings.
      </p>
    </main>
  );
}
