import {
  X_WRITING_GUIDE,
  X_TIEIN_SNIPPETS,
  getXWeightedLength,
  parseXMessage,
  splitIntoXThread,
} from "./x-copywriting";

describe("getXWeightedLength", () => {
  it("counts URLs as 23 chars regardless of actual length", () => {
    const url = "https://calendly.com/ejahronimo/30min?utm_source=x&utm_medium=social";
    expect(url.length).toBeGreaterThan(23);
    expect(getXWeightedLength(url)).toBe(23);
    expect(getXWeightedLength(`Book here: ${url}`)).toBe(11 + 23);
  });

  it("counts astral emojis as 2 weighted chars", () => {
    expect(getXWeightedLength("Hi 👇")).toBe(5); // 'H','i',' ' (3) + emoji (2)
  });
});

describe("splitIntoXThread", () => {
  it("respects explicit --- dividers", () => {
    const tweets = splitIntoXThread("Tweet one hook\n\n---\n\nTweet two takeaway");
    expect(tweets).toEqual(["Tweet one hook", "Tweet two takeaway"]);
  });

  it("packs long multi-paragraph text into <=280 char chunks", () => {
    const longText = [
      "First point about video production that is short.",
      "Second point: ".repeat(18).trim(),
      "Third point wrapping up with a question?",
    ].join("\n\n");
    const tweets = splitIntoXThread(longText);
    expect(tweets.length).toBeGreaterThanOrEqual(2);
    tweets.forEach((t) => {
      expect(getXWeightedLength(t)).toBeLessThanOrEqual(280);
    });
  });
});

describe("parseXMessage", () => {
  it("validates a punchy single X post with 0 hashtags and a reply CTA", () => {
    const post = "Most brand videos fail in the first 3 seconds.\n\nNot because of the camera—because there's no clear hook.\n\nWhat's the worst video intro you've seen this week?";
    const res = parseXMessage(post, "single");
    expect(res.weightedLength).toBeLessThanOrEqual(280);
    expect(res.hashtagCount).toBe(0);
    expect(res.checks.every((c) => c.passed)).toBe(true);
  });

  it("flags >1 hashtag and >280 chars in single mode", () => {
    const post = `${"a".repeat(285)} #video #marketing #film`;
    const res = parseXMessage(post, "single");
    expect(res.checks.find((c) => c.id === "budget")?.passed).toBe(false);
    expect(res.checks.find((c) => c.id === "hashtags")?.passed).toBe(false);
  });

  it("provides 6 guide steps and ANEXTVID/YouTube/Calendly tie-in snippets", () => {
    expect(X_WRITING_GUIDE).toHaveLength(6);
    expect(X_TIEIN_SNIPPETS.some((s) => s.text.includes("calendly.com/ejahronimo/30min"))).toBe(true);
    expect(X_TIEIN_SNIPPETS.some((s) => s.text.includes("anextvid@gmail.com"))).toBe(true);
  });
});
