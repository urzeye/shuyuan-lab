import { randomUUID } from "node:crypto";
import "dotenv/config";
import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { runSourceAgent } from "./agent-runner.js";
import type { AgentEvent, GenerateRequest } from "./agent-runner.js";
import { readStoredTask, TASK_ID_PATTERN } from "./task-store.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

function sendEvent(res: express.Response, event: AgentEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

app.get("/api/agent/health", (_req, res) => {
  res.json({
    status: "ok",
    sdk: "@anthropic-ai/claude-agent-sdk",
    skill: "xbs-source-generator",
    credentials: "dotenv",
  });
});

app.get("/api/agent/tasks/:taskId", async (req, res) => {
  const taskId = req.params.taskId;
  if (!TASK_ID_PATTERN.test(taskId)) {
    res.status(400).json({ error: "invalid taskId" });
    return;
  }

  const task = await readStoredTask(taskId);
  if (task.status === "done" && task.cached) {
    res.json({
      status: task.status,
      taskId,
      siteUrl: task.siteUrl,
      testBook: task.testBook,
      result: task.cached.result,
      cost: task.cached.cost,
      duration: task.cached.duration,
    });
    return;
  }

  res.json({
    status: task.status,
    taskId,
    siteUrl: task.siteUrl,
    testBook: task.testBook,
    chain: task.evidence?.chain || {},
  });
});

app.post("/api/agent/generate", async (req, res) => {
  const input = req.body as GenerateRequest;
  const taskId =
    input.taskId && TASK_ID_PATTERN.test(input.taskId)
      ? input.taskId
      : randomUUID();

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Task-Id", taskId);
  res.flushHeaders();

  const abortController = new AbortController();
  let finished = false;
  res.on("close", () => {
    if (!finished) abortController.abort();
  });

  try {
    for await (const event of runSourceAgent(
      { ...input, taskId },
      abortController,
    )) {
      sendEvent(res, event);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendEvent(res, { type: "error", content: message });
  } finally {
    finished = true;
    res.end();
  }
});

const distRoot = path.resolve(process.cwd(), "dist");
const webBase = "/shuyuan-lab";
if (existsSync(path.join(distRoot, "index.html"))) {
  app.use(webBase, express.static(distRoot));
  app.get("/", (_req, res) => res.redirect(`${webBase}/`));
  app.get(`${webBase}/{*path}`, (_req, res) => {
    res.sendFile(path.join(distRoot, "index.html"));
  });
}

const port = Number(process.env.AGENT_PORT || 3001);
app.listen(port, "127.0.0.1", () => {
  console.log(`[xbs-agent] listening on http://127.0.0.1:${port}`);
  if (existsSync(path.join(distRoot, "index.html"))) {
    console.log(`[xbs-agent] web UI: http://127.0.0.1:${port}${webBase}/`);
  }
});
