export interface ModelCitation {
  path: string;
  quote: string;
}

export interface ModelAnswer {
  status: "answered" | "no_match";
  answer: string | null;
  citations: ModelCitation[];
}

const MARKDOWN_FENCE = /```(?:json)?\s*\n([\s\S]*?)```/g;

function validate(value: unknown): ModelAnswer | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;
  if (o.status !== "answered" && o.status !== "no_match") return null;
  if (o.answer !== null && typeof o.answer !== "string") return null;
  if (!Array.isArray(o.citations)) return null;
  for (const c of o.citations) {
    if (typeof c !== "object" || c === null) return null;
    const cc = c as Record<string, unknown>;
    if (typeof cc.path !== "string" || typeof cc.quote !== "string") return null;
  }
  return {
    status: o.status,
    answer: o.answer as string | null,
    citations: (o.citations as ModelCitation[]).map((c) => ({ path: c.path, quote: c.quote })),
  };
}

// Extract the json answer from markdown block, removing any prose around the block.
export function extractAnswer(text: string): ModelAnswer | null {
  let last: ModelAnswer | null = null;
  for (const m of text.matchAll(MARKDOWN_FENCE)) {
    try {
      const v = validate(JSON.parse(m[1]));
      if (v) last = v;
    } catch {
      // not JSON — skip this block
    }
  }
  if (!last) {
    try {
      last = validate(JSON.parse(text.trim()));
    } catch {
      // fall through
    }
  }
  return last;
}
