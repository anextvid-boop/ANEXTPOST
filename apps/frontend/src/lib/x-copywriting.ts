export type XPostMode = "single" | "thread" | "premium";

export const X_STANDARD_LIMIT = 280;
export const X_PREMIUM_LIMIT = 25000;
export const X_TCO_URL_LENGTH = 23;
export const X_HOOK_PREVIEW_CHARS = 80;

export interface XCheckItem {
  id: string;
  label: string;
  passed: boolean;
  hint: string;
}

export interface XThreadTweet {
  index: number;
  total: number;
  text: string;
  weightedLength: number;
  overLimit: boolean;
}

export interface XAnalysis {
  mode: XPostMode;
  rawLength: number;
  weightedLength: number;
  limit: number;
  remainingChars: number;
  urlCount: number;
  hashtagCount: number;
  hookLine: string;
  hookLength: number;
  tweets: XThreadTweet[];
  checks: XCheckItem[];
}

export interface XGuideStep {
  step: string;
  target: string;
  tip: string;
}

export interface XTieInSnippet {
  id: string;
  label: string;
  category: "youtube" | "anextvid" | "contact";
  targetRole: "body" | "question" | "signoff";
  text: string;
  note: string;
}

export const X_WRITING_GUIDE: XGuideStep[] = [
  {
    step: "1. Scroll-Stopping Hook",
    target: "≤80 chars",
    tip: "Only the first ~80 chars show before readers decide to stop. Lead with a sharp take, specific number, or real BTS moment.",
  },
  {
    step: "2. Tight Core Take",
    target: "120–180 chars",
    tip: "One clear idea per post. Short sentences and line breaks ('air') beat dense paragraphs on X.",
  },
  {
    step: "3. Grounded Proof / BTS",
    target: "1 concrete line",
    tip: "Anchor the idea in real ANEXTVID filming, lighting, editing, or creator workflow details—never generic hype.",
  },
  {
    step: "4. Reply-Bait / CTA",
    target: "1 short question",
    tip: "X weights replies heavily (~27x likes). Close with an easy question or keyword trigger (e.g. Reply \"VIDEO\").",
  },
  {
    step: "5. Links & Account Tie-In",
    target: "t.co = 23 chars",
    tip: "Every URL counts as 23 chars. External links in Tweet 1 can trim reach—drop YouTube or Calendly in the first reply when possible.",
  },
  {
    step: "6. Hashtag Discipline",
    target: "0–1 tag max",
    tip: "X's AI reads context natively. Use 0 hashtags (cleanest) or 1 max—2+ hashtags look spammy and can hurt distribution.",
  },
];

export const X_TIEIN_SNIPPETS: XTieInSnippet[] = [
  {
    id: "yt-reply",
    label: "YouTube (Reply)",
    category: "youtube",
    targetRole: "question",
    text: "Full breakdown is on YouTube (link in reply 👇) — what part do you want me to unpack next?",
    note: "Keeps Tweet 1 link-free for maximum reach",
  },
  {
    id: "yt-direct",
    label: "YouTube Direct",
    category: "youtube",
    targetRole: "signoff",
    text: "Watch the full breakdown on YouTube: https://www.youtube.com/@anextvid",
    note: "URL counts as 23 chars via t.co",
  },
  {
    id: "anextvid-site",
    label: "ANEXTVID Site",
    category: "anextvid",
    targetRole: "signoff",
    text: "Video production & brand systems: https://www.anextvid.com",
    note: "23-char t.co link to ANEXTVID",
  },
  {
    id: "calendly-30m",
    label: "Calendly 30m",
    category: "contact",
    targetRole: "question",
    text: "Planning a video shoot or content system? Grab 30 min here: https://calendly.com/ejahronimo/30min",
    note: "Direct booking link (23 chars via t.co)",
  },
  {
    id: "email-dm",
    label: "Email / DM",
    category: "contact",
    targetRole: "signoff",
    text: "Questions or project ideas? DM me here or email anextvid@gmail.com",
    note: "Zero external link penalty",
  },
  {
    id: "reply-trigger",
    label: "Reply Trigger",
    category: "anextvid",
    targetRole: "question",
    text: "Want our pre-shoot checklist? Reply \"SHOOT\" and I'll send it over.",
    note: "Drives high-weight replies",
  },
];

const URL_RE = /https?:\/\/[^\s)]+/gi;
const HASHTAG_RE = /(?:^|\s)#[a-zA-Z0-9_]+/g;
const CTA_SIGNAL_RE = /\?|reply|comment|dm\b|bookmark|save this|thoughts\??|agree\??|book\b|watch\b|email\b/i;

/**
 * Computes X weighted character length:
 * - Every http/https URL counts as 23 chars (t.co wrapping).
 * - Astral plane characters (most emojis) count as 2 chars.
 */
export function getXWeightedLength(text: string): number {
  if (!text) return 0;
  const placeholder = "x".repeat(X_TCO_URL_LENGTH);
  const normalized = text.replace(/\r\n/g, "\n").replace(URL_RE, placeholder);
  let count = 0;
  for (const ch of normalized) {
    const cp = ch.codePointAt(0) ?? 0;
    count += cp > 0xffff ? 2 : 1;
  }
  return count;
}

/**
 * Splits a message into X thread tweets (each targeting <= 280 weighted chars).
 * Respects explicit `---` separators first, then packs paragraphs cleanly.
 */
export function splitIntoXThread(text: string, maxChars = X_STANDARD_LIMIT): string[] {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];

  // Explicit thread divider `---` on its own line
  const explicitBlocks = trimmed
    .split(/\n\s*---\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const rawChunks: string[] = [];
  for (const block of explicitBlocks) {
    if (getXWeightedLength(block) <= maxChars - 6) {
      rawChunks.push(block);
      continue;
    }
    // Pack by paragraph (\n\n)
    const paras = block.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let current = "";
    for (const para of paras) {
      const candidate = current ? `${current}\n\n${para}` : para;
      if (getXWeightedLength(candidate) <= maxChars - 6) {
        current = candidate;
      } else {
        if (current) rawChunks.push(current);
        if (getXWeightedLength(para) <= maxChars - 6) {
          current = para;
        } else {
          // Word-wrap overly long paragraph
          const words = para.split(/\s+/);
          let line = "";
          for (const w of words) {
            const next = line ? `${line} ${w}` : w;
            if (getXWeightedLength(next) <= maxChars - 6) {
              line = next;
            } else {
              if (line) rawChunks.push(line);
              line = w;
            }
          }
          current = line;
        }
      }
    }
    if (current) rawChunks.push(current);
  }

  return rawChunks;
}

export function parseXMessage(message: string, mode: XPostMode = "single"): XAnalysis {
  const normalized = message.replace(/\r\n/g, "\n").trim();
  const limit = mode === "premium" ? X_PREMIUM_LIMIT : X_STANDARD_LIMIT;
  const rawLength = normalized.length;
  const weightedLength = getXWeightedLength(normalized);
  const urlCount = normalized.match(URL_RE)?.length ?? 0;
  const hashtagCount = normalized.match(HASHTAG_RE)?.length ?? 0;

  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const hookLine = lines[0] ?? "";
  const hookLength = getXWeightedLength(hookLine);

  const rawTweets =
    mode === "thread"
      ? splitIntoXThread(normalized, X_STANDARD_LIMIT)
      : normalized
        ? [normalized]
        : [];

  const total = rawTweets.length;
  const tweets: XThreadTweet[] = rawTweets.map((t, idx) => {
    const display = total > 1 && mode === "thread" ? `${t}\n\n${idx + 1}/${total}` : t;
    const wl = getXWeightedLength(display);
    return {
      index: idx + 1,
      total,
      text: display,
      weightedLength: wl,
      overLimit: mode !== "premium" && wl > X_STANDARD_LIMIT,
    };
  });

  const remainingChars = limit - weightedLength;

  const budgetPassed =
    mode === "thread"
      ? tweets.length > 0 && tweets.every((t) => !t.overLimit)
      : weightedLength > 0 && weightedLength <= limit;

  const checks: XCheckItem[] = [
    {
      id: "budget",
      label:
        mode === "thread"
          ? `Thread (${tweets.length} ${tweets.length === 1 ? "tweet" : "tweets"})`
          : `${weightedLength}/${limit} chars`,
      passed: budgetPassed,
      hint:
        mode === "thread"
          ? "Each tweet in a thread must stay under 280 weighted chars (URLs = 23 chars)."
          : mode === "premium"
            ? "X Premium supports up to 25,000 chars."
            : "Standard X posts allow 280 weighted chars (URLs count as 23 chars via t.co).",
    },
    {
      id: "hook",
      label: hookLine ? `Hook (${hookLength}c)` : "Opening Hook",
      passed: hookLength >= 10 && hookLength <= X_HOOK_PREVIEW_CHARS + 10,
      hint: "Keep line 1 punchy (≤80–90 chars) so it hooks readers before the fold.",
    },
    {
      id: "cta",
      label: "Reply / CTA",
      passed: CTA_SIGNAL_RE.test(normalized),
      hint: "Replies are weighted heavily on X. End with a sharp question or reply trigger.",
    },
    {
      id: "hashtags",
      label: `Tags (${hashtagCount})`,
      passed: hashtagCount <= 1,
      hint: "Use 0–1 hashtag max on X. 2+ hashtags look spammy and can reduce reach.",
    },
    {
      id: "links",
      label: urlCount === 0 ? "Link-free body" : `Links (${urlCount})`,
      passed: urlCount <= 1,
      hint: "URLs count as 23 chars. For max reach, keep Tweet 1 link-free and drop YouTube/Calendly in the reply.",
    },
  ];

  return {
    mode,
    rawLength,
    weightedLength,
    limit,
    remainingChars,
    urlCount,
    hashtagCount,
    hookLine,
    hookLength,
    tweets,
    checks,
  };
}
