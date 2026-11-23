import {
  BLOGGER_WRITING_GUIDE,
  parseBloggerMessage,
  parseInlineBloggerTokens,
  renderBloggerPreviewBlocks,
} from "./blogger-copywriting";

describe("parseBloggerMessage", () => {
  it("handles empty input", () => {
    const res = parseBloggerMessage("   \n  ");
    expect(res.title).toBe("");
    expect(res.body).toBe("");
    expect(res.labels).toEqual([]);
    expect(res.wordCount).toBe(0);
    expect(res.readingMinutes).toBe(0);
    expect(res.checks.every((c) => !c.passed)).toBe(true);
  });

  it("extracts title from line 1, headings, links, and trailing Labels", () => {
    const sample = [
      "How to Build a Repeatable Video Content System",
      "",
      "Most teams struggle because they film without a plan. See [our guide](https://example.com/guide).",
      "",
      "## Step 1: Plan the Shoot",
      "- Pick 3 core topics",
      "- Outline talking points",
      "",
      "Labels: Video Marketing, Content Systems, ANEXTVID",
    ].join("\n");

    const res = parseBloggerMessage(sample);
    expect(res.title).toBe("How to Build a Repeatable Video Content System");
    expect(res.h2Count).toBe(1);
    expect(res.linkCount).toBe(1);
    expect(res.labels).toEqual(["Video Marketing", "Content Systems", "ANEXTVID"]);
    expect(res.readingMinutes).toBe(1);
    expect(res.checks.find((c) => c.id === "title")?.passed).toBe(true);
    expect(res.checks.find((c) => c.id === "headings")?.passed).toBe(true);
    expect(res.checks.find((c) => c.id === "links")?.passed).toBe(true);
    expect(res.checks.find((c) => c.id === "labels")?.passed).toBe(true);
  });
});

describe("renderBloggerPreviewBlocks", () => {
  it("parses h2, h3, blockquote, hr, bullet lists, and paragraphs", () => {
    const blocks = renderBloggerPreviewBlocks(
      "Intro paragraph.\n\n## Section One\n### Subpoint\n> Key quote\n---\n- First\n- Second\n\nClosing.",
    );
    expect(blocks).toEqual([
      { type: "p", text: "Intro paragraph." },
      { type: "h2", text: "Section One" },
      { type: "h3", text: "Subpoint" },
      { type: "blockquote", text: "Key quote" },
      { type: "hr" },
      { type: "ul", items: ["First", "Second"] },
      { type: "p", text: "Closing." },
    ]);
  });

  it("parses inline bold and markdown links", () => {
    expect(
      parseInlineBloggerTokens("Visit **ANEXTVID** at [anextvid.com](https://www.anextvid.com) today."),
    ).toEqual([
      { type: "text", text: "Visit " },
      { type: "bold", text: "ANEXTVID" },
      { type: "text", text: " at " },
      { type: "link", text: "anextvid.com", href: "https://www.anextvid.com" },
      { type: "text", text: " today." },
    ]);
  });

  it("provides all 8 Blogger guide steps", () => {
    expect(BLOGGER_WRITING_GUIDE).toHaveLength(8);
  });
});
