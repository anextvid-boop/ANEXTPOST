import { api } from "./api";

export type BuilderLength = "short" | "standard";

export type SectionRole =
  | "hook"
  | "context"
  | "body"
  | "proof"
  | "takeaway"
  | "question"
  | "signoff"
  | "hashtags"
  | "graphic_note";

export interface BuilderSection {
  id: string;
  role: SectionRole;
  label: string;
  optional: boolean;
  includeInCaption: boolean;
  skipped?: boolean;
  text?: string;
}

export interface BuilderCollection {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isSampleExample: boolean;
  sampleBatch: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuilderPostType {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isSampleExample: boolean;
  sampleBatch: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuilderFormula {
  id: string;
  organizationId: string;
  name: string;
  length: BuilderLength;
  collectionId: string | null;
  postTypeId: string | null;
  sectionsJson: string;
  isSampleExample: boolean;
  sampleBatch: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuilderVariation {
  id: string;
  organizationId: string;
  sectionRole: SectionRole;
  title: string | null;
  content: string;
  collectionId: string | null;
  postTypeId: string | null;
  lengthHint: BuilderLength | null;
  isSampleExample: boolean;
  sampleBatch: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuilderStateResponse {
  collections: BuilderCollection[];
  postTypes: BuilderPostType[];
  formulas: BuilderFormula[];
  variations: BuilderVariation[];
}

export const SECTION_ROLE_META: Record<
  SectionRole,
  { label: string; hint: string; includeInCaption: boolean }
> = {
  hook: {
    label: "Hook / Opening",
    hint: "1–2 crisp lines that earn the first click or scroll-stop.",
    includeInCaption: true,
  },
  context: {
    label: "Context / Setup",
    hint: "Who this is for or the situation behind the post.",
    includeInCaption: true,
  },
  body: {
    label: "Core Message / Steps",
    hint: "The main insight, breakdown, or repeatable steps.",
    includeInCaption: true,
  },
  proof: {
    label: "Proof / Example",
    hint: "Concrete observation, example, or practical detail.",
    includeInCaption: true,
  },
  takeaway: {
    label: "Takeaway / Bridge",
    hint: "One clear lesson tying the post together.",
    includeInCaption: true,
  },
  question: {
    label: "CTA / Question",
    hint: "Invite a genuine reply or next step.",
    includeInCaption: true,
  },
  signoff: {
    label: "Sign-off",
    hint: "Optional short closing line.",
    includeInCaption: true,
  },
  hashtags: {
    label: "Hashtags",
    hint: "1–3 relevant hashtags on the final line.",
    includeInCaption: true,
  },
  graphic_note: {
    label: "On-Graphic Headline (Not in caption)",
    hint: "Text placed on the image/slide; excluded from the LinkedIn caption.",
    includeInCaption: false,
  },
};

export interface BuiltinFormulaPreset {
  id: string;
  name: string;
  summary: string;
  sequences: Record<BuilderLength, Omit<BuilderSection, "text">[]>;
}

export const BUILTIN_FORMULAS: BuiltinFormulaPreset[] = [
  {
    id: "builtin-how-to",
    name: "Practical How-To",
    summary: "Teach a repeatable process clearly.",
    sequences: {
      short: [
        { id: "s1", role: "hook", label: "Hook / Opening", optional: false, includeInCaption: true },
        { id: "s2", role: "body", label: "Core Steps", optional: false, includeInCaption: true },
        { id: "s3", role: "question", label: "CTA / Question", optional: true, includeInCaption: true },
        { id: "s4", role: "hashtags", label: "Hashtags", optional: true, includeInCaption: true, skipped: true },
      ],
      standard: [
        { id: "l1", role: "hook", label: "Hook / Opening", optional: false, includeInCaption: true },
        { id: "l2", role: "context", label: "Context / Setup", optional: true, includeInCaption: true },
        { id: "l3", role: "body", label: "Core Steps", optional: false, includeInCaption: true },
        { id: "l4", role: "proof", label: "Proof / Example", optional: true, includeInCaption: true },
        { id: "l5", role: "takeaway", label: "Takeaway / Bridge", optional: true, includeInCaption: true },
        { id: "l6", role: "question", label: "CTA / Question", optional: true, includeInCaption: true },
        { id: "l7", role: "hashtags", label: "Hashtags", optional: true, includeInCaption: true },
      ],
    },
  },
  {
    id: "builtin-short-visual",
    name: "Short-Form Visual",
    summary: "Pair an on-graphic headline with a tight caption.",
    sequences: {
      short: [
        { id: "v1", role: "graphic_note", label: "On-Graphic Headline (Not in caption)", optional: true, includeInCaption: false },
        { id: "v2", role: "hook", label: "Supporting Opening", optional: true, includeInCaption: true },
        { id: "v3", role: "body", label: "Core Message", optional: false, includeInCaption: true },
        { id: "v4", role: "question", label: "Closing Question", optional: true, includeInCaption: true },
        { id: "v5", role: "hashtags", label: "Hashtags", optional: true, includeInCaption: true, skipped: true },
      ],
      standard: [
        { id: "vl1", role: "graphic_note", label: "On-Graphic Headline (Not in caption)", optional: true, includeInCaption: false },
        { id: "vl2", role: "hook", label: "Supporting Opening", optional: false, includeInCaption: true },
        { id: "vl3", role: "body", label: "Core Message", optional: false, includeInCaption: true },
        { id: "vl4", role: "question", label: "Closing Question", optional: true, includeInCaption: true },
        { id: "vl5", role: "signoff", label: "Sign-off", optional: true, includeInCaption: true },
        { id: "vl6", role: "hashtags", label: "Hashtags", optional: true, includeInCaption: true },
      ],
    },
  },
  {
    id: "builtin-case",
    name: "Case Breakdown",
    summary: "Walk through a concrete project or decision.",
    sequences: {
      short: [
        { id: "c1", role: "hook", label: "Hook / Opening", optional: false, includeInCaption: true },
        { id: "c2", role: "proof", label: "What Changed / Result", optional: false, includeInCaption: true },
        { id: "c3", role: "takeaway", label: "Key Takeaway", optional: true, includeInCaption: true },
      ],
      standard: [
        { id: "cl1", role: "hook", label: "Hook / Opening", optional: false, includeInCaption: true },
        { id: "cl2", role: "context", label: "Starting Situation", optional: false, includeInCaption: true },
        { id: "cl3", role: "body", label: "What Was Done", optional: false, includeInCaption: true },
        { id: "cl4", role: "proof", label: "Observed Outcome", optional: true, includeInCaption: true },
        { id: "cl5", role: "takeaway", label: "Takeaway", optional: true, includeInCaption: true },
        { id: "cl6", role: "question", label: "CTA / Question", optional: true, includeInCaption: true },
      ],
    },
  },
  {
    id: "builtin-myth",
    name: "Myth & Nuance",
    summary: "Examine a common assumption and offer a grounded view.",
    sequences: {
      short: [
        { id: "m1", role: "hook", label: "Common Assumption", optional: false, includeInCaption: true },
        { id: "m2", role: "body", label: "Grounded Nuance", optional: false, includeInCaption: true },
        { id: "m3", role: "question", label: "Closing Question", optional: true, includeInCaption: true },
      ],
      standard: [
        { id: "ml1", role: "hook", label: "Common Assumption", optional: false, includeInCaption: true },
        { id: "ml2", role: "context", label: "Why People Believe It", optional: true, includeInCaption: true },
        { id: "ml3", role: "body", label: "Where It Breaks Down", optional: false, includeInCaption: true },
        { id: "ml4", role: "takeaway", label: "Practical Rule of Thumb", optional: true, includeInCaption: true },
        { id: "ml5", role: "question", label: "Closing Question", optional: true, includeInCaption: true },
      ],
    },
  },
  {
    id: "builtin-blogger-article",
    name: "Long-Form Blogger Article",
    summary: "8-part SEO blog structure with headline, H2 body, proof, lead magnet, CTA, bio, and labels.",
    sequences: {
      short: [
        { id: "bs1", role: "hook", label: "1. SEO Headline (Line 1 = Title)", optional: false, includeInCaption: true },
        { id: "bs2", role: "context", label: "2. Story / Pain Intro + Early Link", optional: true, includeInCaption: true },
        { id: "bs3", role: "body", label: "3. Scannable H2 Body + Links", optional: false, includeInCaption: true },
        { id: "bs4", role: "question", label: "6. Primary CTA + Next-Read Link", optional: true, includeInCaption: true },
        { id: "bs5", role: "hashtags", label: "8. Blog Labels (Labels: a, b)", optional: true, includeInCaption: true },
      ],
      standard: [
        { id: "bl1", role: "hook", label: "1. SEO Headline (Line 1 = Title)", optional: false, includeInCaption: true },
        { id: "bl2", role: "context", label: "2. Story / Pain Intro + Early Link", optional: true, includeInCaption: true },
        { id: "bl3", role: "body", label: "3. Scannable H2 Body + Authority Links", optional: false, includeInCaption: true },
        { id: "bl4", role: "proof", label: "4. Soft Product Placement + Proof", optional: true, includeInCaption: true },
        { id: "bl5", role: "takeaway", label: "5. Lead Magnet Bridge / Takeaway", optional: true, includeInCaption: true },
        { id: "bl6", role: "question", label: "6. Primary CTA + Next-Read Link", optional: true, includeInCaption: true },
        { id: "bl7", role: "signoff", label: "7. Author Bio & Brand Links", optional: true, includeInCaption: true },
        { id: "bl8", role: "hashtags", label: "8. Blog Labels (Labels: a, b)", optional: true, includeInCaption: true },
      ],
    },
  },
  {
    id: "builtin-video-shorts",
    name: "Video & Shorts (YouTube · TikTok · Reels)",
    summary: "Video-first hook/title, key takeaways or chapters, CTA link, and search tags.",
    sequences: {
      short: [
        { id: "vs1", role: "hook", label: "Video Hook / Title", optional: false, includeInCaption: true },
        { id: "vs2", role: "body", label: "Core Description / Takeaways", optional: false, includeInCaption: true },
        { id: "vs3", role: "question", label: "CTA + Link", optional: true, includeInCaption: true },
        { id: "vs4", role: "hashtags", label: "Tags / Hashtags", optional: true, includeInCaption: true },
      ],
      standard: [
        { id: "vl1", role: "hook", label: "Video Hook / SEO Title", optional: false, includeInCaption: true },
        { id: "vl2", role: "context", label: "Intro / What You'll Learn", optional: true, includeInCaption: true },
        { id: "vl3", role: "body", label: "Key Takeaways / Chapters", optional: false, includeInCaption: true },
        { id: "vl4", role: "question", label: "Primary CTA + Blog/Booking Link", optional: true, includeInCaption: true },
        { id: "vl5", role: "hashtags", label: "Search Tags / Hashtags", optional: true, includeInCaption: true },
      ],
    },
  },
  {
    id: "builtin-x-single",
    name: "X Single Punchy Post (≤280)",
    summary: "Scroll-stopping 1-line hook, tight core take, and reply-driving CTA under 280 chars.",
    sequences: {
      short: [
        { id: "xs1", role: "hook", label: "Opening Hook (≤80 chars)", optional: false, includeInCaption: true },
        { id: "xs2", role: "body", label: "Core Take (Short)", optional: false, includeInCaption: true },
        { id: "xs3", role: "question", label: "Reply CTA", optional: true, includeInCaption: true },
      ],
      standard: [
        { id: "xsl1", role: "hook", label: "Opening Hook (≤80 chars)", optional: false, includeInCaption: true },
        { id: "xsl2", role: "body", label: "Core Take (Short)", optional: false, includeInCaption: true },
        { id: "xsl3", role: "proof", label: "1-Line Proof / BTS", optional: true, includeInCaption: true },
        { id: "xsl4", role: "question", label: "Reply CTA", optional: true, includeInCaption: true },
        { id: "xsl5", role: "hashtags", label: "Tags (0–1 max)", optional: true, includeInCaption: true },
      ],
    },
  },
  {
    id: "builtin-x-thread",
    name: "X Multi-Tweet Thread (1/N)",
    summary: "Standalone hook tweet + structured breakdown tweets + final reply/link CTA.",
    sequences: {
      short: [
        { id: "xt1", role: "hook", label: "1/ Hook Tweet", optional: false, includeInCaption: true },
        { id: "xt2", role: "body", label: "2/ Core Breakdown", optional: false, includeInCaption: true },
        { id: "xt3", role: "question", label: "3/ Takeaway + Reply CTA", optional: true, includeInCaption: true },
      ],
      standard: [
        { id: "xtl1", role: "hook", label: "1/ Hook Tweet (≤80c opener)", optional: false, includeInCaption: true },
        { id: "xtl2", role: "context", label: "2/ Quick Setup", optional: true, includeInCaption: true },
        { id: "xtl3", role: "body", label: "3/ Step-by-Step Breakdown", optional: false, includeInCaption: true },
        { id: "xtl4", role: "proof", label: "4/ Real ANEXTVID Proof / BTS", optional: true, includeInCaption: true },
        { id: "xtl5", role: "takeaway", label: "5/ Punchline / Takeaway", optional: true, includeInCaption: true },
        { id: "xtl6", role: "question", label: "6/ Reply CTA / Link Drop", optional: true, includeInCaption: true },
      ],
    },
  },
  {
    id: "builtin-x-video-drop",
    name: "X YouTube / Video Drop",
    summary: "Curiosity hook + 1-line video takeaway + YouTube/ANEXTVID reply or link CTA.",
    sequences: {
      short: [
        { id: "xv1", role: "hook", label: "Video Curiosity Hook", optional: false, includeInCaption: true },
        { id: "xv2", role: "takeaway", label: "1-Line Key Takeaway", optional: false, includeInCaption: true },
        { id: "xv3", role: "question", label: "YouTube Link / Reply CTA", optional: true, includeInCaption: true },
      ],
      standard: [
        { id: "xvl1", role: "hook", label: "Video Curiosity Hook", optional: false, includeInCaption: true },
        { id: "xvl2", role: "context", label: "What the Video Covers", optional: true, includeInCaption: true },
        { id: "xvl3", role: "takeaway", label: "1-Line Key Takeaway", optional: false, includeInCaption: true },
        { id: "xvl4", role: "question", label: "YouTube Link / Reply CTA", optional: true, includeInCaption: true },
        { id: "xvl5", role: "signoff", label: "ANEXTVID / Contact", optional: true, includeInCaption: true },
      ],
    },
  },
];

export function assemblePostText(sections: BuilderSection[]): string {
  return sections
    .filter((s) => s.includeInCaption && !s.skipped)
    .map((s) => (s.text ?? "").trim())
    .filter((t) => t.length > 0)
    .join("\n\n");
}

export async function fetchBuilderState(): Promise<BuilderStateResponse> {
  return api.get<BuilderStateResponse>("/builder/state");
}

export async function createBuilderCollection(
  name: string,
  description?: string,
): Promise<BuilderCollection> {
  return api.post<BuilderCollection>("/builder/collections", {
    name,
    description,
  });
}

export async function renameBuilderCollection(
  id: string,
  name: string,
): Promise<BuilderCollection> {
  return api.patch<BuilderCollection>(
    `/builder/collections/${encodeURIComponent(id)}`,
    { name },
  );
}

export async function createBuilderPostType(
  name: string,
  description?: string,
): Promise<BuilderPostType> {
  return api.post<BuilderPostType>("/builder/post-types", {
    name,
    description,
  });
}

export async function renameBuilderPostType(
  id: string,
  name: string,
): Promise<BuilderPostType> {
  return api.patch<BuilderPostType>(
    `/builder/post-types/${encodeURIComponent(id)}`,
    { name },
  );
}

export async function createBuilderVariations(
  items: {
    sectionRole: SectionRole;
    title?: string | null;
    content: string;
    collectionId?: string | null;
    postTypeId?: string | null;
    lengthHint?: BuilderLength | null;
  }[],
): Promise<{ created: BuilderVariation[]; count: number }> {
  return api.post<{ created: BuilderVariation[]; count: number }>(
    "/builder/variations",
    { items },
  );
}

export async function updateBuilderVariation(
  id: string,
  patch: {
    content?: string;
    title?: string | null;
    sectionRole?: SectionRole;
    collectionId?: string | null;
    postTypeId?: string | null;
    lengthHint?: BuilderLength | null;
  },
): Promise<BuilderVariation> {
  return api.patch<BuilderVariation>(
    `/builder/variations/${encodeURIComponent(id)}`,
    patch,
  );
}

export async function deleteBuilderVariation(id: string): Promise<void> {
  await api.del(`/builder/variations/${encodeURIComponent(id)}`);
}

export async function loadSampleExamples(): Promise<{
  sampleBatch: string;
  createdCollections: number;
  createdPostTypes: number;
  createdFormulas: number;
  createdVariations: number;
}> {
  return api.post("/builder/examples/load", {});
}

export async function deleteSampleExamples(): Promise<{
  sampleBatch: string;
  deletedCollections: number;
  deletedPostTypes: number;
  deletedFormulas: number;
  deletedVariations: number;
}> {
  return api.del("/builder/examples");
}
