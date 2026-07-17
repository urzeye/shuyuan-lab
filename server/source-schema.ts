export const generatedSourceSchema = {
  type: "object",
  properties: {
    source_json: {
      type: "object",
      properties: {
        sourceName: { type: "string", minLength: 1 },
        sourceUrl: { type: "string", minLength: 1 },
        enable: { type: ["integer", "boolean"] },
        weight: { type: ["string", "number"] },
        miniAppVersion: { type: "string" },
        lastModifyTime: { type: ["string", "number"] },
        sourceType: { enum: ["text", "comic", "audio", "video"] },
        httpHeaders: { type: ["string", "object"] },
        searchBook: { type: "object" },
        bookDetail: { type: "object" },
        chapterList: { type: "object" },
        chapterContent: { type: "object" },
      },
      required: [
        "sourceName",
        "sourceUrl",
        "enable",
        "weight",
        "miniAppVersion",
        "sourceType",
        "searchBook",
        "bookDetail",
        "chapterList",
        "chapterContent",
      ],
      additionalProperties: true,
    },
    evidence: {
      type: "object",
      properties: {
        chain: {
          type: "object",
          properties: {
            home: { type: "string" },
            search: { type: "string" },
            detail: { type: "string" },
            chapters: { type: "string" },
            content: { type: "string" },
          },
          required: ["home", "search", "detail", "chapters", "content"],
          additionalProperties: false,
        },
        challenge_detected: { type: "boolean" },
        challenge_cleared: { type: "boolean" },
        selector_checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rule: { type: "string" },
              role: { enum: ["search", "detail", "chapters", "content"] },
              xpath: { type: "string" },
              count: { type: "integer", minimum: 0 },
              sample: { type: "string" },
            },
            required: ["rule", "role", "xpath", "count"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "chain",
        "challenge_detected",
        "challenge_cleared",
        "selector_checks",
      ],
      additionalProperties: false,
    },
    warnings: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["source_json", "evidence", "warnings", "summary"],
  additionalProperties: false,
} as const;

export interface AgentStructuredResult {
  source_json: Record<string, unknown>;
  evidence: {
    chain: Record<string, string>;
    challenge_detected: boolean;
    challenge_cleared: boolean;
    selector_checks: Array<{
      rule: string;
      role: "search" | "detail" | "chapters" | "content";
      xpath: string;
      count: number;
      sample?: string;
    }>;
  };
  warnings: string[];
  summary: string;
}
