import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const TASK_ID_PATTERN = /^[a-f0-9-]{36}$/;
export const runtimeRoot = path.join(path.resolve(process.cwd()), ".runtime");
export const agentTasksRoot = path.join(runtimeRoot, "agent-tasks");

const requiredSnapshots = [
  "search.html",
  "detail.html",
  "chapters.html",
  "content.html",
];

interface TaskManifest {
  version: 1;
  taskId: string;
  siteUrl: string;
  testBook: string;
  createdAt: string;
  updatedAt: string;
}

interface CachedTaskResult {
  taskId?: string;
  siteUrl?: string;
  testBook?: string;
  result?: unknown;
  cost?: number;
  duration?: number;
}

interface TaskEvidence {
  site?: {
    requested_url?: string;
  };
  testBook?: string;
  search?: {
    external_discovery?: {
      query?: string;
    };
    successful?: {
      url?: string;
    };
  };
  chain?: Record<string, string>;
}

export interface StoredTask {
  taskId: string;
  taskDir: string;
  status: "done" | "evidence_ready" | "collecting" | "not_found";
  siteUrl: string;
  testBook: string;
  cached?: CachedTaskResult;
  evidence?: TaskEvidence;
}

async function readJson<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export function getTaskDir(taskId: string): string {
  return path.join(agentTasksRoot, taskId);
}

export function normalizeSiteUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  }
  url.searchParams.sort();
  return url.href;
}

export function isSameSiteUrl(left: string, right: string): boolean {
  try {
    return normalizeSiteUrl(left) === normalizeSiteUrl(right);
  } catch {
    return left.trim() === right.trim();
  }
}

function normalizeBook(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function inferLegacyTestBook(evidence: TaskEvidence | null): string {
  if (!evidence) return "";
  if (evidence.testBook?.trim()) return normalizeBook(evidence.testBook);

  const query = evidence.search?.external_discovery?.query || "";
  const quoted = query.match(/["“”]([^"“”]+)["“”]/)?.[1];
  if (quoted?.trim()) return normalizeBook(quoted);

  const searchUrl = evidence.search?.successful?.url || evidence.chain?.search || "";
  try {
    const url = new URL(searchUrl);
    const tagIndex = url.pathname.split("/").indexOf("tag");
    const tag = tagIndex >= 0 ? url.pathname.split("/")[tagIndex + 1] : "";
    return tag ? normalizeBook(decodeURIComponent(tag)) : "";
  } catch {
    return "";
  }
}

export async function readStoredTask(taskId: string): Promise<StoredTask> {
  const taskDir = getTaskDir(taskId);
  const manifest = await readJson<TaskManifest>(path.join(taskDir, "task.json"));
  const cached = await readJson<CachedTaskResult>(path.join(taskDir, "result.json"));
  const evidence = await readJson<TaskEvidence>(path.join(taskDir, "evidence.json"));
  const siteUrl =
    cached?.siteUrl || manifest?.siteUrl || evidence?.site?.requested_url || "";
  const testBook =
    cached?.testBook || manifest?.testBook || inferLegacyTestBook(evidence);

  if (cached?.result) {
    return {
      taskId,
      taskDir,
      status: "done",
      siteUrl,
      testBook,
      cached,
      evidence: evidence || undefined,
    };
  }

  if (evidence) {
    const chainComplete = requiredSnapshots.every(
      (name) =>
        existsSync(path.join(taskDir, name)) &&
        Boolean(evidence.chain?.[path.basename(name, ".html")]),
    );
    return {
      taskId,
      taskDir,
      status: chainComplete ? "evidence_ready" : "collecting",
      siteUrl,
      testBook,
      evidence,
    };
  }

  if (manifest) {
    return { taskId, taskDir, status: "collecting", siteUrl, testBook };
  }

  return {
    taskId,
    taskDir,
    status: "not_found",
    siteUrl: "",
    testBook: "",
  };
}

export async function claimTaskInput(
  taskId: string,
  requestedUrl: URL,
  testBook: string,
): Promise<StoredTask> {
  if (!TASK_ID_PATTERN.test(taskId)) throw new Error("invalid taskId");

  const stored = await readStoredTask(taskId);
  const normalizedUrl = normalizeSiteUrl(requestedUrl.href);
  const normalizedTestBook = normalizeBook(testBook);

  if (stored.siteUrl && !isSameSiteUrl(stored.siteUrl, normalizedUrl)) {
    throw new Error("保存的任务属于另一个目标站点，不能复用该 taskId");
  }
  if (
    stored.testBook &&
    normalizeBook(stored.testBook) !== normalizedTestBook
  ) {
    throw new Error("保存的任务使用了不同的测试书名，不能复用该 taskId");
  }

  const manifestPath = path.join(stored.taskDir, "task.json");
  const previous = await readJson<TaskManifest>(manifestPath);
  const now = new Date().toISOString();
  await mkdir(stored.taskDir, { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        taskId,
        siteUrl: normalizedUrl,
        testBook: normalizedTestBook,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      } satisfies TaskManifest,
      null,
      2,
    ),
    "utf8",
  );

  return stored;
}
