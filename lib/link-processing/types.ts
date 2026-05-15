export type SocialPlatform = "reddit" | "x" | "facebook";
export type LinkSource = SocialPlatform | "web";

export type LinkItem = {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  type: "link" | "todo";
  status: "active" | "completed" | "archived";
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ExtractedSocialLink = {
  platform: LinkSource;
  originalUrl: string;
  normalizedUrl: string;
  title: string;
  author: string | null;
  publishedAt: string | null;
  text: string;
  comments: string[];
  metrics: Record<string, string | number | boolean | null>;
  raw: unknown;
};

export type LinkBrief = {
  title: string;
  whySaved: string;
  fullContext: string;
  keyPoints: string[];
  notableDetails: string[];
  tags: string[];
};

export type WrittenLinkNote = {
  obsidianPath: string;
  status: "summarized" | "failed";
};

export type ProcessLinksSummary = {
  scanned: number;
  processed: number;
  summarized: number;
  failed: number;
  duplicates: number;
  skipped: number;
  errors: Array<{ itemId: string; reason: string }>;
};
