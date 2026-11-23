export interface BloggerCheckItem {
  id: string;
  label: string;
  passed: boolean;
  hint: string;
}

export interface BloggerAnalysis {
  title: string;
  titleLength: number;
  body: string;
  labels: string[];
  wordCount: number;
  charCount: number;
  readingMinutes: number;
  h2Count: number;
  linkCount: number;
  checks: BloggerCheckItem[];
}

export type BloggerPreviewBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "hr" }
  | { type: "ul"; items: string[] }
  | { type: "p"; text: string };

export type BloggerInlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; text: string; href: string };

export interface BloggerGuideStep {
  step: string;
  target: string;
  tip: string;
}

export const BLOGGER_WRITING_GUIDE: BloggerGuideStep[] = [
  {
    step: "1. SEO Headline (Line 1)",
    target: "45–65 chars",
    tip: "Put the main keyword + clear outcome on line 1. Line 1 automatically becomes your Blogger post title.",
  },
  {
    step: "2. Story / PAS Intro + Early Link",
    target: "80–150 words",
    tip: "Name the reader's problem in 2–3 short paragraphs and include 1 early internal link to a core page or guide.",
  },
  {
    step: "3. Scannable H2/H3 Body + Links",
    target: "500–1,000+ words",
    tip: "Break every 200–300 words with ## Heading, ### Subheading, - bullet lists, **bold** takeaways, and [Anchor](https://...) links.",
  },
  {
    step: "4. Soft Product Placement + Proof",
    target: "100–200 words",
    tip: "Show a real example, metric, or workflow where your product/service naturally solves the step just explained.",
  },
  {
    step: "5. Lead Magnet Bridge",
    target: "40–80 words",
    tip: "Offer a downloadable checklist, template, or resource for readers who want the fast path.",
  },
  {
    step: "6. Primary CTA + Next-Read Link",
    target: "40–80 words",
    tip: "Close with one clear next step (book, reply, try) plus a 'Read next:' link to keep readers on your blog.",
  },
  {
    step: "7. Author Bio & Brand Links",
    target: "30–60 words",
    tip: "1–2 sentences establishing who you are, what you build, and where readers can connect.",
  },
  {
    step: "8. Blog Labels / Topics",
    target: "2–5 labels",
    tip: "Use `Labels: Video Marketing, Content Systems` on the final line to tag your Blogger post automatically.",
  },
];

const LABELS_LINE_RE = /^(?:labels|tags)\s*:\s*(.+)$/i;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL_RE = /https?:\/\/[^\s)]+/g;

export function parseBloggerMessage(message: string): BloggerAnalysis {
  const normalized = message.replace(/\r\n/g, "\n");
  const rawLines = normalized.split("\n");
  const firstNonEmptyIdx = rawLines.findIndex((l) => l.trim().length > 0);

  if (firstNonEmptyIdx === -1) {
    return {
      title: "",
      titleLength: 0,
      body: "",
      labels: [],
      wordCount: 0,
      charCount: 0,
      readingMinutes: 0,
      h2Count: 0,
      linkCount: 0,
      checks: buildChecks("", "", [], 0, 0, 0),
    };
  }

  const title = rawLines[firstNonEmptyIdx].trim();
  const restLines = rawLines.slice(firstNonEmptyIdx + 1);

  // Extract trailing `Labels: a, b, c` line if present
  const labels: string[] = [];
  const bodyLines: string[] = [];
  for (let i = 0; i < restLines.length; i++) {
    const line = restLines[i];
    const isNearEnd = i >= restLines.length - 2;
    const match = isNearEnd ? line.trim().match(LABELS_LINE_RE) : null;
    if (match) {
      match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((lbl) => labels.push(lbl));
    } else {
      bodyLines.push(line);
    }
  }

  const body = bodyLines.join("\n").trim();
  const wordCount = body ? body.split(/\s+/).filter(Boolean).length : 0;
  const readingMinutes = wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 200)) : 0;
  const h2Count = bodyLines.filter((l) => /^#{2,3}\s+\S/.test(l.trim())).length;

  const mdLinks = body.match(MARKDOWN_LINK_RE)?.length ?? 0;
  const bodyWithoutMd = body.replace(MARKDOWN_LINK_RE, "");
  const bareLinks = bodyWithoutMd.match(BARE_URL_RE)?.length ?? 0;
  const linkCount = mdLinks + bareLinks;

  return {
    title,
    titleLength: title.length,
    body,
    labels,
    wordCount,
    charCount: normalized.trim().length,
    readingMinutes,
    h2Count,
    linkCount,
    checks: buildChecks(title, body, labels, wordCount, h2Count, linkCount),
  };
}

function buildChecks(
  title: string,
  body: string,
  labels: string[],
  wordCount: number,
  h2Count: number,
  linkCount: number,
): BloggerCheckItem[] {
  return [
    {
      id: "title",
      label: title ? `Headline (${title.length} chars)` : "Headline (Line 1)",
      passed: title.length >= 15 && title.length <= 75,
      hint: "Aim for 45–65 characters on Line 1 for clean Google search display.",
    },
    {
      id: "headings",
      label: `Subheadings (${h2Count})`,
      passed: h2Count >= 1,
      hint: "Add ## or ### headings to make long-form articles scannable.",
    },
    {
      id: "depth",
      label: `Depth (${wordCount} words)`,
      passed: wordCount >= 600,
      hint: "600–1,500+ words performs best for search-driven Blogger posts.",
    },
    {
      id: "links",
      label: `Links (${linkCount})`,
      passed: linkCount >= 1,
      hint: "Include [Anchor Text](https://...) internal or authority links.",
    },
    {
      id: "labels",
      label: `Labels (${labels.length})`,
      passed: labels.length >= 1,
      hint: "Add `Labels: Topic 1, Topic 2` at the end to categorize on Blogger.",
    },
  ];
}

export function renderBloggerPreviewBlocks(body: string): BloggerPreviewBlock[] {
  if (!body.trim()) return [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: BloggerPreviewBlock[] = [];
  let listItems: string[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: "p", text: paragraphLines.join(" ").trim() });
      paragraphLines = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: "ul", items: listItems });
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line === "---") {
      flushParagraph();
      flushList();
      blocks.push({ type: "hr" });
      continue;
    }
    if (line.startsWith("> ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "blockquote", text: line.slice(2).trim() });
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      listItems.push(line.replace(/^[-*]\s+/, "").trim());
      continue;
    }
    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

const INLINE_TOKEN_RE = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*)/g;

export function parseInlineBloggerTokens(text: string): BloggerInlineToken[] {
  const tokens: BloggerInlineToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_TOKEN_RE.lastIndex = 0;

  while ((match = INLINE_TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    if (match[2] && match[3]) {
      tokens.push({ type: "link", text: match[2], href: match[3] });
    } else if (match[4]) {
      tokens.push({ type: "bold", text: match[4] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", text: text.slice(lastIndex) });
  }
  return tokens;
}
