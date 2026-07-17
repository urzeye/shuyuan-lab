#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const children = [];
let shuttingDown = false;

function start(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
    // On POSIX this creates a process group so descendants can be terminated together.
    detached: !isWindows,
  });
  children.push({ name, child });

  child.once("error", (error) => {
    console.error(`[dev:${name}] 启动失败: ${error.message}`);
    shutdown(1);
  });
  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.error(`[dev:${name}] 已退出 (${reason})，正在停止其他开发进程…`);
    shutdown(code ?? 1);
  });
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;

  if (isWindows) {
    // Node/tsx watch and Vite both create descendants. /T is required to avoid
    // leaving the actual server process listening after the wrapper exits.
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") {
      console.error(`[dev] 停止 PID ${child.pid} 失败`, error);
    }
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) killTree(child);
  process.exitCode = exitCode;
  setImmediate(() => process.exit(exitCode));
}

const shutdownSignals = ["SIGINT", "SIGTERM", "SIGHUP"];
if (isWindows) shutdownSignals.push("SIGBREAK");
for (const signal of shutdownSignals) {
  process.once(signal, () =>
    shutdown(signal === "SIGINT" || signal === "SIGBREAK" ? 0 : 1),
  );
}
process.once("uncaughtException", (error) => {
  console.error(error);
  shutdown(1);
});
process.once("unhandledRejection", (error) => {
  console.error(error);
  shutdown(1);
});
process.once("exit", () => {
  // Last-resort cleanup for ordinary exits that did not pass through shutdown().
  for (const { child } of children) killTree(child);
});

const viteCli = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const viteArgs = [viteCli, "--host", "0.0.0.0"];
const webPort = process.env.WEB_PORT?.trim();
if (webPort) viteArgs.push("--port", webPort);

start("agent", [
  "--import",
  "tsx",
  path.join(projectRoot, "server", "index.ts"),
]);
start("web", viteArgs);
