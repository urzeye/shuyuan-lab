#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const skillRoot = path.join(projectRoot, ".claude", "skills", "xbs-source-generator");
const requiredFiles = [
  "SKILL.md",
  "references/cloudflare.md",
  "references/extraction.md",
  "references/xbs-rules.md",
  "scripts/cloudflare-browser.mjs",
  "scripts/collect-site.mjs",
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

const skillMarkdown = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
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
