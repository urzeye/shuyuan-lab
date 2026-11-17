#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  clearCloudflare,
  launchChallengeContext,
} from "./cloudflare-browser.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, "..");
const extensionDir = path.join(skillDir, "assets", "cf-turnstile-patcher");
function findProjectRoot(startDir) {
  let dir = startDir;
  while (true) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("找不到项目根目录（未找到 package.json）");
    dir = parent;
  }
}
const projectRoot = findProjectRoot(skillDir);

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function assertHttpUrl(value, label) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must use http or https`);
  }
  if (url.username || url.password) throw new Error(`${label} must not contain credentials`);
  return url;
}

function sameSite(candidate, origin) {
  try {
    return new URL(candidate).origin === origin;
  } catch {
    return false;
  }
}

function cleanSnapshot(html, maxLength = 350_000) {
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/>\s*</g, ">\n<")
    .replace(/[ \t]{2,}/g, " ");
  const truncated = cleaned.length > maxLength;
  return {
    html: truncated ? `${cleaned.slice(0, maxLength)}\n<!-- snapshot truncated -->` : cleaned,
    truncated,
  };
}

async function pageInventory(page, origin) {
  return page.evaluate((allowedOrigin) => {
    const textOf = (element) => (element?.textContent || "").replace(/\s+/g, " ").trim();
    const forms = [...document.forms].map((form) => ({
      action: new URL(form.action || location.href, location.href).href,
      method: (form.method || "get").toLowerCase(),
      inputs: [...form.querySelectorAll("input")].map((input) => ({
        name: input.name,
        type: input.type,
        placeholder: input.placeholder,
        value: input.type === "hidden" ? input.value : "",
      })),
    }));
    const links = [...document.querySelectorAll("a[href]")]
      .map((anchor) => ({
        text: textOf(anchor).slice(0, 160),
        href: new URL(anchor.getAttribute("href"), location.href).href,
        rel: anchor.getAttribute("rel") || "",
      }))
      .filter((link) => link.href.startsWith(allowedOrigin))
      .slice(0, 1200);
    const metas = [...document.querySelectorAll("meta[property], meta[name]")]
      .map((meta) => ({
        key: meta.getAttribute("property") || meta.getAttribute("name") || "",
        content: (meta.getAttribute("content") || "").slice(0, 500),
      }))
      .filter((meta) => /^(og:|description|keywords)/i.test(meta.key));
    return {
      forms,
      links,
      metas,
      textSample: textOf(document.body).slice(0, 5000),
    };
  }, origin);
}

async function capture(page, role, outputDir, origin, response = null) {
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  const cloudflare = await clearCloudflare(page);
  const html = await page.content().catch(() => "");
  const snapshotPath = path.join(outputDir, `${role}.html`);
  const snapshot = cleanSnapshot(html);
  await writeFile(snapshotPath, snapshot.html, "utf8");
  const inventory = await pageInventory(page, origin).catch(() => ({
    forms: [],
    links: [],
    metas: [],
    textSample: "",
  }));
  const status = cloudflare.finalStatus ?? response?.status?.() ?? null;
  const recoveredChallengeResponse =
    status === 403 &&
    cloudflare.detected &&
    cloudflare.cleared &&
    !cloudflare.error &&
    html.length > 5_000 &&
    inventory.textSample.length > 300;
  return {
    role,
    url: page.url(),
    title: await page.title(),
    status,
    accessible:
      status === null ||
      (status >= 200 && status < 400) ||
      recoveredChallengeResponse,
    recovered_challenge_response: recoveredChallengeResponse,
    snapshot_path: snapshotPath,
    snapshot_truncated: snapshot.truncated,
    html_length: html.length,
    ...inventory,
    cloudflare,
    error: cloudflare.detected && !cloudflare.cleared ? "challenge_timeout" : null,
  };
}

function mergeCloudflareEvidence(evidence, cloudflare) {
  evidence.cloudflare.challenge_detected ||= Boolean(cloudflare?.detected);
  evidence.cloudflare.challenge_cleared &&= cloudflare?.cleared !== false;
  evidence.cloudflare.attempts += cloudflare?.attempts || 0;
  for (const method of cloudflare?.methods || []) {
    if (!evidence.cloudflare.methods.includes(method)) evidence.cloudflare.methods.push(method);
  }
  evidence.cloudflare.clicks.push(...(cloudflare?.clicks || []));
  if (cloudflare?.finalTitle) evidence.cloudflare.final_title = cloudflare.finalTitle;
  if (cloudflare?.error) evidence.cloudflare.error = cloudflare.error;
}

function recordPage(evidence, capture) {
  evidence.pages.push(capture);
  mergeCloudflareEvidence(evidence, capture.cloudflare);
  return capture;
}

function requireAccessible(capture) {
  if (capture.error) throw new Error(`${capture.error}: ${capture.url}`);
  if (!capture.accessible) {
    throw new Error(`HTTP ${capture.status}: ${capture.url}`);
  }
}

function searchForms(homePage, siteUrl, book) {
  const candidates = [];
  const likelyInput = /^(q|s|wd|key|keyword|searchkey|search_key|query|name)$/i;
  for (const form of homePage.forms) {
    const input = form.inputs.find(
      (item) => likelyInput.test(item.name) || /搜索|书名|search/i.test(item.placeholder),
    );
    if (!input?.name) continue;
    const candidate = {
      kind: "form",
      method: form.method,
      action: form.action,
      input: input.name,
      hidden: Object.fromEntries(
        form.inputs.filter((item) => item.type === "hidden" && item.name).map((item) => [item.name, item.value]),
      ),
      note: `homepage ${form.method.toUpperCase()} form`,
    };
    candidates.push(candidate);
    if (
      candidate.method === "post" &&
      /\/modules\/article\/search\.php$/i.test(new URL(candidate.action).pathname) &&
      !Object.hasOwn(candidate.hidden, "searchtype")
    ) {
      candidates.push({
        ...candidate,
        hidden: { ...candidate.hidden, searchtype: "all" },
        note: `${candidate.note} with Jieqi searchtype=all`,
      });
    }
  }

  const known = [
    [`/tag/${encodeURIComponent(book)}/`, null],
    ["/search", "keyword"],
    ["/search", "searchkey"],
    ["/search.html", "searchkey"],
    ["/search.htm", "keyword"],
    ["/search.php", "keyword"],
    ["/search.php", "searchkey"],
    ["/s.php", "q"],
    ["/modules/article/search.php", "searchkey"],
    ["/", "s"],
  ];
  for (const [pathname, key] of known) {
    const url = new URL(pathname, siteUrl);
    if (key) url.searchParams.set(key, book);
    candidates.push({
      kind: "url",
      method: "get",
      url: url.href,
      note: key ? `fallback ${key}` : "fallback keyword tag",
    });
  }
  return candidates;
}

function normalizeBookText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·•:：,，。.!！?？'"“”‘’《》〈〉【】()[\]{}_-]+/g, "");
}

function matchingBookLinks(links, book) {
  const normalizedBook = normalizeBookText(book);
  if (!normalizedBook) return [];
  return links.filter((link) => normalizeBookText(link.text).includes(normalizedBook));
}

function canonicalPageUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
  return url.href;
}

async function attemptSearch(context, candidate, siteUrl, book, origin, homePage) {
  const page = await context.newPage();
  try {
    let response;
    if (candidate.kind === "form" && candidate.method === "post") {
      await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await clearCloudflare(page);
      // HTML 里的 action 通常是相对路径，绝对 URL 匹配几乎必落空；
      // 按待填 input 的 name 定位表单更本质。
      const byInput = page.locator("form").filter({ has: page.locator(`[name="${candidate.input}"]`) }).first();
      const byAction = page.locator(`form[action="${candidate.action}"]`).first();
      const scoped = (await byInput.count()) ? byInput : byAction;
      if (!(await scoped.count())) throw new Error("search form was not found after navigation");
      await scoped.evaluate((element, hidden) => {
        for (const [name, value] of Object.entries(hidden)) {
          let input = element.querySelector(`input[name="${CSS.escape(name)}"]`);
          if (!input) {
            input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            element.append(input);
          }
          input.value = String(value);
        }
      }, candidate.hidden || {});
      await scoped.locator(`[name="${candidate.input}"]`).fill(book);
      [response] = await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null),
        scoped.locator('[type="submit"], button').first().click(),
      ]);
    } else {
      let target = candidate.url;
      if (candidate.kind === "form") {
        const url = new URL(candidate.action, siteUrl);
        for (const [key, value] of Object.entries(candidate.hidden || {})) url.searchParams.set(key, value);
        url.searchParams.set(candidate.input, book);
        target = url.href;
      }
      if (!sameSite(target, origin)) throw new Error("cross-origin search candidate rejected");
      response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45_000 });
    }
    const cf = await clearCloudflare(page);
    const inventory = await pageInventory(page, origin);
    const exactBookLinks = matchingBookLinks(inventory.links, book);
    const titleHit = normalizeBookText(inventory.textSample).includes(normalizeBookText(book));
    const finalUrl = page.url();
    const sameAsHomeUrl = canonicalPageUrl(finalUrl) === canonicalPageUrl(homePage.url);
    const linkSet = (links) => JSON.stringify(links.map((link) => `${link.text}|${link.href}`).sort());
    const sameAsHomeContent =
      inventory.links.length > 0 && linkSet(inventory.links) === linkSet(homePage.links);
    const homeLike = sameAsHomeContent || (sameAsHomeUrl && exactBookLinks.length === 0);
    const emptyResult = exactBookLinks.length === 0;
    const blocked = !cf.cleared || ([403, 429].includes(response?.status?.() ?? 200) && !titleHit);
    return {
      page,
      response,
      cf,
      title: await page.title(),
      titleHit,
      exactBookLinks,
      resultCount: exactBookLinks.length,
      textLength: inventory.textSample.length,
      emptyResult,
      homeLike,
      blocked,
      finalUrl,
      textSample: inventory.textSample,
      candidate,
    };
  } catch (error) {
    await page.close();
    return { error: error instanceof Error ? error.message : String(error), candidate };
  }
}

function detailPathPrefixOf(pathname) {
  const match = pathname.match(/^(.+\/)?\d{2,}(?:\.html?|\/?)$/);
  return match ? match[1] || "/" : null;
}

// 从站内链接统计详情页路径前缀（如 /book/、/bookinfo/），
// 取代硬编码的 /book/ 约定。计数过低的视为噪声。
function inferDetailPathPrefix(...pageInfos) {
  const counts = new Map();
  for (const pageInfo of pageInfos) {
    for (const link of pageInfo?.links || []) {
      let pathname;
      try {
        pathname = new URL(link.href).pathname;
      } catch {
        continue;
      }
      const prefix = detailPathPrefixOf(pathname);
      if (!prefix || prefix === "/") continue;
      counts.set(prefix, (counts.get(prefix) || 0) + 1);
    }
  }
  const ranked = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] || null;
}

function scoreBookLink(link, book, pathPrefix = "/book/") {
  let score = 0;
  const normalizedText = normalizeBookText(link.text);
  const normalizedBook = normalizeBookText(book);
  const looksLikeExactResult =
    normalizedText === normalizedBook ||
    normalizedText.startsWith(`${normalizedBook}无弹窗`) ||
    normalizedText.startsWith(`${normalizedBook}最新章节`) ||
    normalizedText.startsWith(`${normalizedBook}章节列表`) ||
    normalizedText.startsWith(`${normalizedBook}txt全集`);
  if (looksLikeExactResult) score += 140;
  else if (normalizedText.startsWith(normalizedBook)) score += 60;
  else if (normalizedText.includes(normalizedBook)) score += 40;
  try {
    if (pathPrefix && detailPathPrefixOf(new URL(link.href).pathname) === pathPrefix) score += 20;
  } catch {
    // 非法 URL 不加结构分
  }
  if (/book|novel|article|txt|read|info|\d{3,}/i.test(link.href)) score += 10;
  if (/search|login|register|author|tag|category/i.test(link.href)) score -= 30;
  return score;
}

function unwrapDuckDuckGoUrl(value) {
  try {
    const url = new URL(value);
    if (/(^|\.)duckduckgo\.com$/i.test(url.hostname) && url.pathname === "/l/") {
      return url.searchParams.get("uddg") || value;
    }
    return value;
  } catch {
    return value;
  }
}

async function discoverDetailLinks(context, origin, hostname, book, pathPrefix = "/book/") {
  if (process.env.XBS_AGENT_EXTERNAL_DISCOVERY === "false") {
    return { engine: "duckduckgo-html", disabled: true, candidates: [] };
  }
  const page = await context.newPage();
  const query = `site:${hostname}${pathPrefix} "${book}"`;
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);
  try {
    const response = await page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    const raw = await page.evaluate(() =>
      [...document.querySelectorAll(".result")].slice(0, 20).map((element) => ({
        text: (element.querySelector(".result__title")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim(),
        href: element.querySelector(".result__a")?.href || "",
        snippet: (element.querySelector(".result__snippet")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500),
      })),
    );
    const candidates = raw
      .map((item) => ({ ...item, href: unwrapDuckDuckGoUrl(item.href) }))
      .filter(
        (item) =>
          sameSite(item.href, origin) &&
          detailPathPrefixOf(new URL(item.href).pathname) === pathPrefix &&
          normalizeBookText(`${item.text} ${item.snippet}`).includes(normalizeBookText(book)),
      );
    return {
      engine: "duckduckgo-html",
      query,
      status: response?.status?.() ?? null,
      final_url: page.url(),
      candidates,
    };
  } catch (error) {
    return {
      engine: "duckduckgo-html",
      query,
      error: error instanceof Error ? error.message : String(error),
      candidates: [],
    };
  } finally {
    await page.close();
  }
}

function scoreChapterLink(link) {
  let score = 0;
  if (/第[\d零一二三四五六七八九十百千万]+[章节回卷]/.test(link.text)) score += 50;
  if (/chapter|read|\d+[_.\/-]\d+|\/\d+\.html?/i.test(link.href)) score += 10;
  if (/上一|下一|目录|书架|最新|排行|推荐/.test(link.text)) score -= 40;
  return score;
}

function findDirectoryLink(detailPage) {
  return detailPage.links
    .map((link) => ({
      ...link,
      score:
        (/完整目录|全部章节|章节目录|正文目录|查看目录/.test(link.text) ? 100 : 0) +
        (/目录/.test(link.text) ? 50 : 0) +
        (/^开始阅读$/.test(link.text) ? 20 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .find((link) => link.score > 0);
}

async function collect(args) {
  if (!args.url || !args.book || !args.output) {
    throw new Error("collect requires --url, --book, and --output");
  }
  const site = assertHttpUrl(args.url, "url");
  const outputPath = path.resolve(args.output);
  const outputDir = path.dirname(outputPath);
  const runtimeRoot = path.join(projectRoot, ".runtime");
  if (!outputPath.startsWith(`${runtimeRoot}${path.sep}`)) {
    throw new Error("output must be inside .runtime/");
  }
  await mkdir(outputDir, { recursive: true });
  const headless = args.headless === "true" || process.env.XBS_AGENT_HEADLESS === "true";
  const context = await launchChallengeContext({
    hostname: site.hostname,
    runtimeRoot,
    extensionDir,
    headless,
  });

  const evidence = {
    version: 1,
    site: {
      requested_url: site.href,
      hostname: site.hostname,
      captured_at: new Date().toISOString(),
    },
    testBook: args.book,
    cloudflare: {
      challenge_detected: false,
      challenge_cleared: true,
      attempts: 0,
      methods: [],
      clicks: [],
    },
    search: { successful: null, attempts: [] },
    pages: [],
    chain: {},
    warnings: [],
  };

  try {
    const home = context.pages()[0] || (await context.newPage());
    const homeResponse = await home.goto(site.href, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const effectiveOrigin = new URL(home.url()).origin;
    const homeCapture = await capture(home, "home", outputDir, effectiveOrigin, homeResponse);
    recordPage(evidence, homeCapture);
    evidence.chain.home = homeCapture.url;
    evidence.site.final_url = homeCapture.url;
    requireAccessible(homeCapture);

    const candidates = searchForms(homeCapture, homeCapture.url, args.book);
    let searchResult = null;
    for (const candidate of candidates.slice(0, 12)) {
      const attempted = await attemptSearch(
        context,
        candidate,
        homeCapture.url,
        args.book,
        effectiveOrigin,
        homeCapture,
      );
      evidence.search.attempts.push({
        candidate,
        final_url: attempted.finalUrl,
        status: attempted.response?.status?.() ?? null,
        title: attempted.title,
        text_length: attempted.textLength ?? 0,
        title_hit: attempted.titleHit || false,
        exact_book_links: (attempted.exactBookLinks || []).slice(0, 20),
        result_count: attempted.resultCount ?? 0,
        empty_result: attempted.emptyResult ?? true,
        home_like: attempted.homeLike ?? false,
        blocked: attempted.blocked || false,
        cloudflare: attempted.cf,
        error: attempted.error,
      });
      if (attempted.cf) mergeCloudflareEvidence(evidence, attempted.cf);
      if (
        attempted.page &&
        attempted.resultCount > 0 &&
        !attempted.homeLike &&
        !attempted.blocked
      ) {
        searchResult = attempted;
        break;
      }
      if (attempted.page) await attempted.page.close();
    }

    if (searchResult?.page) {
      const searchCapture = await capture(
        searchResult.page,
        "search",
        outputDir,
        effectiveOrigin,
        searchResult.response,
      );
      recordPage(evidence, searchCapture);
      requireAccessible(searchCapture);
      evidence.chain.search = searchCapture.url;
      evidence.search.successful = {
        ...searchResult.candidate,
        final_url: searchCapture.url,
        // 表单提交由浏览器按页面编码处理；URL 模板固定 UTF-8 百分编码，
        // 老站（GBK）只能用表单路径时，requestInfo 需要 @js: POST 而非 URL 模板。
        encoding: searchResult.candidate.kind === "form" ? "form-native" : "utf-8-url",
      };

      // 控制词探针：用不可能存在的书名复搜同一接口。结果页仍含测试书
      // 或与书搜索结果完全相同，说明该接口返回静态内容，是伪搜索。
      const controlTerm = `源检测${Math.random().toString(36).slice(2, 8)}`;
      const probe = await attemptSearch(
        context,
        searchResult.candidate,
        homeCapture.url,
        controlTerm,
        effectiveOrigin,
        homeCapture,
      );
      evidence.search.control_probe = {
        term: controlTerm,
        final_url: probe.finalUrl ?? null,
        contains_test_book: Boolean(
          probe.textSample &&
            normalizeBookText(probe.textSample).includes(normalizeBookText(args.book)),
        ),
        same_text_as_book_search: Boolean(
          probe.textSample && probe.textSample === searchResult.textSample,
        ),
        error: probe.error,
      };
      if (probe.page) await probe.page.close();

      const detailPathPrefix =
        inferDetailPathPrefix(homeCapture, searchCapture) || "/book/";
      evidence.search.detail_path_prefix = detailPathPrefix;
      const nativeDetailCandidates = searchCapture.links
        .map((link) => ({ ...link, score: scoreBookLink(link, args.book, detailPathPrefix) }))
        .sort((a, b) => b.score - a.score)
        .filter((link) => link.score > 20);
      const discovery = await discoverDetailLinks(
        context,
        effectiveOrigin,
        site.hostname,
        args.book,
        detailPathPrefix,
      );
      evidence.search.external_discovery = discovery;
      const detailCandidates = [...nativeDetailCandidates, ...discovery.candidates]
        .map((link) => ({ ...link, score: scoreBookLink(link, args.book, detailPathPrefix) }))
        .sort((a, b) => b.score - a.score)
        .filter(
          (link, index, links) =>
            link.score > 20 && links.findIndex((candidate) => candidate.href === link.href) === index,
        );
      let detailLink = null;
      let detail = null;
      let detailResponse = null;

      for (const candidate of detailCandidates.slice(0, 10)) {
        if (!sameSite(candidate.href, effectiveOrigin)) continue;
        const page = await context.newPage();
        const response = await page.goto(candidate.href, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await clearCloudflare(page);
        const status = response?.status?.() ?? null;
        const title = normalizeBookText(await page.title());
        const target = normalizeBookText(args.book);
        if ((status === null || (status >= 200 && status < 400)) && title.includes(target)) {
          detailLink = candidate;
          detail = page;
          detailResponse = response;
          break;
        }
        evidence.search.rejected_detail_links ||= [];
        evidence.search.rejected_detail_links.push({
          href: candidate.href,
          text: candidate.text,
          status,
          title: await page.title(),
        });
        await page.close();
      }

      if (detailLink && detail) {
        const detailCapture = await capture(detail, "detail", outputDir, effectiveOrigin, detailResponse);
        recordPage(evidence, detailCapture);
        requireAccessible(detailCapture);
        evidence.chain.detail = detailCapture.url;

        const directoryLink = findDirectoryLink(detailCapture);
        let chapterCapture = detailCapture;
        let chapterRecord;
        if (
          directoryLink &&
          directoryLink.href !== detailCapture.url &&
          sameSite(directoryLink.href, effectiveOrigin)
        ) {
          const chapters = await context.newPage();
          const chaptersResponse = await chapters.goto(directoryLink.href, {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
          });
          chapterCapture = await capture(chapters, "chapters", outputDir, effectiveOrigin, chaptersResponse);
          recordPage(evidence, chapterCapture);
          requireAccessible(chapterCapture);
          chapterRecord = chapterCapture;
        } else {
          chapterRecord = { ...detailCapture, role: "chapters", snapshot_path: detailCapture.snapshot_path };
          evidence.pages.push(chapterRecord);
        }
        evidence.chain.chapters = chapterCapture.url;
        // 目录分页提示：存在"下一页"类链接时，chapterList 规则可能只覆盖第一页。
        chapterRecord.paginated_hint = chapterRecord.links.some(
          (link) => /^(下一页|下页|next)$/i.test(link.text.trim()),
        );

        const firstChapter = chapterCapture.links
          .map((link) => ({ ...link, score: scoreChapterLink(link) }))
          .sort((a, b) => b.score - a.score)
          .find((link) => link.score > 20);
        if (firstChapter && sameSite(firstChapter.href, effectiveOrigin)) {
          const content = await context.newPage();
          const contentResponse = await content.goto(firstChapter.href, {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
          });
          const contentCapture = await capture(content, "content", outputDir, effectiveOrigin, contentResponse);
          recordPage(evidence, contentCapture);
          requireAccessible(contentCapture);
          evidence.chain.content = contentCapture.url;
        } else evidence.warnings.push("No verified first chapter link was found.");
      } else evidence.warnings.push("No detail link matching the test book was found.");
    } else evidence.warnings.push("No search candidate returned a page containing the test book.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    evidence.error = message;
    evidence.warnings.push(message);
    throw error;
  } finally {
    await writeFile(outputPath, JSON.stringify(evidence, null, 2), "utf8");
    await context.close();
  }

  process.stdout.write(`${JSON.stringify({ ok: true, evidence: outputPath, chain: evidence.chain, warnings: evidence.warnings })}\n`);
}

async function inspect(args) {
  if (!args.evidence || (!args["checks-json"] && (!args.role || !args.xpath))) {
    throw new Error("inspect requires --evidence plus --checks-json, or --role and --xpath");
  }
  const evidencePath = path.resolve(args.evidence);
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  let checks;
  if (args["checks-json"]) {
    try {
      checks = JSON.parse(args["checks-json"]);
    } catch {
      throw new Error("--checks-json is not valid JSON");
    }
    if (!Array.isArray(checks) || checks.length === 0) {
      throw new Error("--checks-json must be a non-empty array");
    }
    for (const check of checks) {
      if (!check.role || !check.xpath) throw new Error("each check needs role and xpath");
    }
  } else {
    checks = [
      {
        rule: args.rule || `${args.role} ${args.xpath}`,
        role: args.role,
        xpath: args.xpath,
        contextXpath: args["context-xpath"],
      },
    ];
  }

  const snapshotDir = `${path.dirname(evidencePath)}${path.sep}`;
  const htmlByRole = new Map();
  const snapshotError = new Map();
  for (const check of checks) {
    if (htmlByRole.has(check.role) || snapshotError.has(check.role)) continue;
    const pageInfo = evidence.pages.find((item) => item.role === check.role);
    if (!pageInfo) {
      snapshotError.set(check.role, `role not captured: ${check.role}`);
      continue;
    }
    const snapshotPath = path.resolve(pageInfo.snapshot_path);
    if (!snapshotPath.startsWith(snapshotDir)) {
      snapshotError.set(check.role, "snapshot is outside the evidence directory");
      continue;
    }
    htmlByRole.set(check.role, await readFile(snapshotPath, "utf8"));
  }

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }
  try {
    const results = [];
    for (const check of checks) {
      if (snapshotError.has(check.role)) {
        results.push({
          rule: check.rule,
          role: check.role,
          xpath: check.xpath,
          count: 0,
          sample: null,
          error: snapshotError.get(check.role),
        });
        continue;
      }
      const page = await browser.newPage();
      try {
        await page.setContent(htmlByRole.get(check.role), { waitUntil: "domcontentloaded" });
        const result = await page.evaluate(
          ({ xpath, contextXpath }) => {
            const evaluate = (expression, root) => {
              const result = document.evaluate(
                expression,
                root,
                null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                null,
              );
              return Array.from({ length: result.snapshotLength }, (_, index) => result.snapshotItem(index));
            };
            const roots = contextXpath ? evaluate(contextXpath, document) : [document];
            const matches = roots.flatMap((root) => evaluate(xpath, root));
            const samples = matches.slice(0, 8).map((node) => ({
              node: node.nodeName,
              value:
                node.nodeType === Node.ATTRIBUTE_NODE || node.nodeType === Node.TEXT_NODE
                  ? node.nodeValue?.trim().slice(0, 500)
                  : node.textContent?.replace(/\s+/g, " ").trim().slice(0, 500),
              href: node instanceof Element ? node.getAttribute("href") : null,
              class: node instanceof Element ? node.getAttribute("class") : null,
              id: node instanceof Element ? node.id || null : null,
            }));
            return { root_count: roots.length, count: matches.length, samples };
          },
          { xpath: check.xpath, contextXpath: check.contextXpath || null },
        );
        results.push({
          rule: check.rule,
          role: check.role,
          xpath: check.xpath,
          count: result.count,
          root_count: result.root_count,
          sample: result.samples[0]?.value ?? null,
          samples: result.samples,
        });
      } catch (error) {
        results.push({
          rule: check.rule,
          role: check.role,
          xpath: check.xpath,
          count: 0,
          sample: null,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await page.close().catch(() => {});
      }
    }
    // rule/role/xpath/count/sample 字段与服务端 selector_checks schema 对齐，
    // 可直接转录进结构化输出。
    process.stdout.write(`${JSON.stringify({ checks: results }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "collect";
try {
  if (command === "inspect") await inspect(args);
  else await collect(args);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
}
