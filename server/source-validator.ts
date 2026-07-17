import type { AgentStructuredResult } from "./source-schema.js";

const requiredRules = ["searchBook", "bookDetail", "chapterList", "chapterContent"];
const emptyShells = [
  "shudanDetail",
  "shupingList",
  "shupingHome",
  "searchShudan",
  "relatedWord",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasSensitiveMaterial(value: unknown): boolean {
  const text = JSON.stringify(value).toLowerCase();
  return [
    "cf_clearance",
    "cf-turnstile-response",
    "sk-ant-",
    "anthropic_api_key",
    ".runtime/browser-profiles",
  ].some((marker) => text.includes(marker));
}

export function normalizeAndValidateResult(
  result: AgentStructuredResult,
  requestedUrl: URL,
): AgentStructuredResult {
  const source = result.source_json;
  const warnings = [...result.warnings];

  if (!isRecord(source)) throw new Error("Agent 未返回书源对象");
  if (hasSensitiveMaterial(source)) throw new Error("书源结果包含浏览器会话或密钥材料");

  source.sourceName = String(source.sourceName || requestedUrl.hostname);
  source.sourceUrl = String(source.sourceUrl || requestedUrl.origin).replace(/\/+$/, "");
  source.enable = source.enable === false || source.enable === 0 ? 0 : 1;
  source.weight = String(source.weight || "9000");
  source.miniAppVersion = String(source.miniAppVersion || "2.53.2");
  if (!source.lastModifyTime || String(source.lastModifyTime) === "0") {
    source.lastModifyTime = String(Date.now() / 1000);
  }
  source.sourceType = String(source.sourceType || "text");
  // 不设置 httpHeaders 默认值——缺失或空对象都让 App 自行处理，空字符串会导致类型不匹配闪退
  // 不设置 desc/password 默认值——空字段直接省略，避免无意义的自动填充文本

  for (const key of requiredRules) {
    if (!isRecord(source[key])) throw new Error(`${key} 不是有效规则对象`);
    const rule = source[key] as Record<string, unknown>;
    if (rule.actionID !== key) {
      rule.actionID = key;
      warnings.push(`${key}.actionID 已由服务端修正`);
    }
    rule.parserID ??= "DOM";
    rule.responseFormatType ??= "html";
    // validConfig 不设默认空字符串——缺少时 App 自行处理，空字符串可能引起意外行为
  }

  const coreFields: Array<[string, string]> = [
    ["searchBook", "list"],
    ["searchBook", "detailUrl"],
    ["chapterList", "list"],
    ["chapterList", "url"],
    ["chapterContent", "content"],
  ];
  for (const [ruleName, field] of coreFields) {
    const rule = source[ruleName] as Record<string, unknown>;
    if (!String(rule[field] || "").trim()) {
      throw new Error(`${ruleName}.${field} 缺失，Agent 未形成最小可用规则`);
    }
  }

  for (const key of emptyShells) {
    if (!isRecord(source[key])) source[key] = { actionID: key, parserID: "DOM" };
  }
  if (!isRecord(source.bookWorld)) source.bookWorld = {};
  if (!isRecord(source.shudanList)) source.shudanList = {};

  for (const key of ["searchBook", "bookDetail"]) {
    const rule = source[key] as Record<string, unknown>;
    if ("state" in rule) {
      rule.status ??= rule.state;
      delete rule.state;
      warnings.push(`${key}.state 已修正为 status`);
    }
    if ("lastChapter" in rule) {
      rule.lastChapterTitle ??= rule.lastChapter;
      delete rule.lastChapter;
      warnings.push(`${key}.lastChapter 已修正为 lastChapterTitle`);
    }
  }

  const chapterContent = source.chapterContent as Record<string, unknown>;
  if ("filter" in chapterContent) {
    delete chapterContent.filter;
    warnings.push("无效的 chapterContent.filter 已移除，请检查 content 的 |@js: 过滤");
  }

  const checkMap = new Map(
    result.evidence.selector_checks.map((check) => [check.rule, check.count]),
  );
  for (const path of [
    "searchBook.list",
    "searchBook.detailUrl",
    "chapterList.list",
    "chapterList.url",
    "chapterContent.content",
  ]) {
    if (!checkMap.has(path)) warnings.push(`缺少 ${path} 的离线 XPath 检查记录`);
    else if ((checkMap.get(path) || 0) < 1) throw new Error(`${path} 的 XPath 检查结果为 0`);
  }

  if (!result.evidence.challenge_cleared) {
    throw new Error("Cloudflare 挑战未通过，不能把拦截页当作站点证据");
  }
  result.warnings = [...new Set(warnings)];
  return result;
}
