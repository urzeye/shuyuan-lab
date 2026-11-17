#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";

const execFileAsync = promisify(execFile);

const projectRoot = process.cwd();
const skillRoot = path.join(projectRoot, ".claude", "skills", "xbs-source-generator");
const requiredFiles = [
  "SKILL.md",
  "references/cloudflare.md",
  "references/extraction.md",
  "references/xbs-rules.md",
  "references/example-source.json",
  "scripts/cloudflare-browser.mjs",
  "scripts/collect-site.mjs",
  "scripts/xbs-encode.mjs",
  "assets/cf-turnstile-patcher/manifest.json",
  "assets/cf-turnstile-patcher/script.js",
];
const forbiddenPatterns = [
  { pattern: /\/Users\//, label: "macOS absolute user path" },
  { pattern: /[A-Za-z]:\\Users\\/, label: "Windows absolute user path" },
  { pattern: /reverse-lab/i, label: "external reverse-lab dependency" },
  { pattern: /src\/labkit/i, label: "external labkit dependency" },
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(target) : [target];
    }),
  );
  return nested.flat();
}

for (const relativePath of requiredFiles) {
  await access(path.join(skillRoot, relativePath)).catch(() => {
    throw new Error(`missing required skill file: ${relativePath}`);
  });
}

const skillMarkdown = (await readFile(path.join(skillRoot, "SKILL.md"), "utf8")).replace(/\r\n/g, "\n");
const frontmatter = skillMarkdown.match(/^---\n([\s\S]*?)\n---\n/);
if (!frontmatter) throw new Error("SKILL.md must start with YAML frontmatter");
if (!/^name:\s*xbs-source-generator\s*$/m.test(frontmatter[1])) {
  throw new Error("SKILL.md frontmatter name must be xbs-source-generator");
}
if (!/^description:\s*\S.+$/m.test(frontmatter[1])) {
  throw new Error("SKILL.md frontmatter must include a non-empty description");
}

const manifest = JSON.parse(
  await readFile(
    path.join(skillRoot, "assets", "cf-turnstile-patcher", "manifest.json"),
    "utf8",
  ),
);
if (manifest.manifest_version !== 3) throw new Error("CF patcher must use manifest_version 3");
if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
  throw new Error("CF patcher manifest must register its content script");
}

// 脚本语法检查
for (const script of ["scripts/cloudflare-browser.mjs", "scripts/collect-site.mjs", "scripts/xbs-encode.mjs"]) {
  await execFileAsync(process.execPath, ["--check", path.join(skillRoot, script)]).catch((error) => {
    throw new Error(`${script} 语法检查失败: ${error.stderr || error.message}`);
  });
}

// XXTEA 密钥与 App 端一致性（xbs-encode.mjs 与 src/lib/xxtea.ts 各自内嵌 KEY_BYTES）
function extractKeyBytes(source, label) {
  const match = source.match(/KEY_BYTES\s*=\s*new Uint8Array\(\[([\s\S]*?)\]\)/);
  if (!match) throw new Error(`${label} 中未找到 KEY_BYTES`);
  return match[1].split(",").map((token) => token.trim()).filter(Boolean).join(",");
}
const skillKey = extractKeyBytes(
  await readFile(path.join(skillRoot, "scripts", "xbs-encode.mjs"), "utf8"),
  "xbs-encode.mjs",
);
const appKey = extractKeyBytes(
  await readFile(path.join(projectRoot, "src", "lib", "xxtea.ts"), "utf8"),
  "src/lib/xxtea.ts",
);
if (skillKey !== appKey) throw new Error("xbs-encode.mjs 与 src/lib/xxtea.ts 的 XXTEA 密钥不一致");

// skill 文档与权威规范的关键 token 同步（防双源漂移）
const xbsRules = await readFile(path.join(skillRoot, "references", "xbs-rules.md"), "utf8");
for (const token of [
  "|@replace:",
  "||@js:",
  "%@keyWord",
  "%@pageIndex",
  "%@filter",
  "%@result",
  "params.nativeTool",
  "JSParser",
  "requestFilters",
  "nextPageUrl",
  "lastChapterTitle",
]) {
  if (!xbsRules.includes(token)) {
    throw new Error(`references/xbs-rules.md 缺少规范 token: ${token}`);
  }
}

// 样例书源必须结构完整
const example = JSON.parse(
  await readFile(path.join(skillRoot, "references", "example-source.json"), "utf8"),
);
for (const key of ["searchBook", "bookDetail", "chapterList", "chapterContent"]) {
  if (!example[key] || typeof example[key] !== "object") {
    throw new Error(`example-source.json 缺少 ${key}`);
  }
}

for (const file of await listFiles(skillRoot)) {
  const content = await readFile(file, "utf8");
  for (const { pattern, label } of forbiddenPatterns) {
    if (pattern.test(content)) {
      throw new Error(`${path.relative(skillRoot, file)} contains ${label}`);
    }
  }
}

process.stdout.write(
  `Skill validation passed: ${path.relative(projectRoot, skillRoot)} (${requiredFiles.length} required files)\n`,
);
