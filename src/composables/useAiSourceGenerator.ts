import { ref } from "vue";
import type { AiConfig } from "@/stores/aiConfig";

export interface GenerateStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

export interface GeneratedSource {
  raw: Record<string, unknown>;
  warning?: string;
  evidence?: {
    chain: Record<string, string>;
    challenge_detected: boolean;
    challenge_cleared: boolean;
    selector_checks: Array<{
      rule: string;
      role: string;
      xpath: string;
      count: number;
      sample?: string;
    }>;
  };
  summary?: string;
  cost?: number;
  duration?: number;
}

type AgentEvent = {
  type: "step" | "log" | "tool" | "result" | "error";
  step?: string;
  status?: "running" | "done" | "error";
  detail?: string;
  content?: string;
  toolName?: string;
  toolInput?: { command?: string; file_path?: string };
  result?: {
    source_json: Record<string, unknown>;
    evidence: GeneratedSource["evidence"];
    warnings: string[];
    summary: string;
  };
  cost?: number;
  duration?: number;
};

const initialSteps = (): GenerateStep[] => [
  { id: "service", label: "连接本地 Agent 服务", status: "pending" },
  { id: "skill", label: "加载 XBS 生成 Skill", status: "pending" },
  { id: "collect", label: "浏览器采集并处理 Cloudflare", status: "pending" },
  { id: "analyze", label: "Agent 分析页面与生成规则", status: "pending" },
  { id: "verify", label: "实测 XPath 与证据链", status: "pending" },
  { id: "result", label: "校验并返回书源 JSON", status: "pending" },
];

function parseFrames(buffer: string): { frames: AgentEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const chunks = normalized.split("\n\n");
  const rest = chunks.pop() || "";
  const frames: AgentEvent[] = [];
  for (const chunk of chunks) {
    const payload = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!payload) continue;
    frames.push(JSON.parse(payload) as AgentEvent);
  }
  return { frames, rest };
}

export function useAiSourceGenerator() {
  const steps = ref<GenerateStep[]>([]);
  const running = ref(false);
  const streamText = ref("");
  const result = ref<GeneratedSource | null>(null);
  const error = ref<string | null>(null);
  let controller: AbortController | null = null;

  function setStep(id: string, patch: Partial<GenerateStep>) {
    const step = steps.value.find((item) => item.id === id);
    if (step) Object.assign(step, patch);
  }

  function completeBefore(id: string) {
    const index = steps.value.findIndex((step) => step.id === id);
    steps.value.slice(0, index).forEach((step) => {
      if (step.status !== "error") step.status = "done";
    });
  }

  function appendLog(text: string) {
    const sanitized = text
      .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-***")
      .replace(/([?&](?:token|key|api_key)=)[^&\s]+/gi, "$1***");
    streamText.value += `${sanitized.trim()}\n`;
    if (streamText.value.length > 20_000) streamText.value = streamText.value.slice(-20_000);
  }

  function handleEvent(event: AgentEvent) {
    if (event.type === "step") {
      setStep("skill", {
        status: event.status || "running",
        detail: event.detail,
      });
      if (event.status === "done") completeBefore("result");
      return;
    }
    if (event.type === "tool") {
      const command = event.toolInput?.command || "";
      if (command.includes(" collect ")) {
        completeBefore("collect");
        setStep("collect", { status: "running", detail: "启动持久化 Chrome 与 CF 自动验证" });
      } else if (command.includes(" inspect ")) {
        completeBefore("verify");
        setStep("verify", { status: "running", detail: "对捕获快照执行 XPath" });
      } else if (event.toolName === "Read") {
        completeBefore("analyze");
        setStep("analyze", { status: "running", detail: "读取页面证据" });
      }
      appendLog(`[${event.toolName || "Tool"}] ${event.content || "执行中"}`);
      return;
    }
    if (event.type === "log" && event.content) {
      if (steps.value.find((step) => step.id === "collect")?.status === "running") {
        setStep("collect", { status: "done", detail: "页面链采集完成" });
        setStep("analyze", { status: "running", detail: "推导 XBS 规则" });
      }
      appendLog(event.content);
      return;
    }
    if (event.type === "error") throw new Error(event.content || "Agent 执行失败");
    if (event.type === "result" && event.result) {
      steps.value.forEach((step) => (step.status = "done"));
      const warnings = event.result.warnings || [];
      result.value = {
        raw: event.result.source_json,
        warning: warnings.length ? warnings.join("；") : undefined,
        evidence: event.result.evidence,
        summary: event.result.summary,
        cost: event.cost,
        duration: event.duration,
      };
    }
  }

  async function generate(
    siteUrl: string,
    testBook: string,
    aiConfig: AiConfig,
  ): Promise<GeneratedSource | null> {
    reset();
    running.value = true;
    steps.value = initialSteps();
    setStep("service", { status: "running" });
    controller = new AbortController();

    try {
      const response = await fetch("/api/agent/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          siteUrl,
          testBook: testBook.trim() || "斗罗大陆",
          apiKey: aiConfig.apiKey,
          baseUrl: aiConfig.baseUrl,
          model: aiConfig.model,
          reasoningEffort: aiConfig.reasoningEffort,
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Agent 服务请求失败: HTTP ${response.status}`);
      }
      setStep("service", { status: "done", detail: "SSE 已连接" });
      setStep("skill", { status: "running" });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const parsed = parseFrames(buffer);
        buffer = parsed.rest;
        for (const event of parsed.frames) handleEvent(event);
        if (done) break;
      }
      if (buffer.trim()) {
        const parsed = parseFrames(`${buffer}\n\n`);
        parsed.frames.forEach(handleEvent);
      }
      if (!result.value) throw new Error("Agent 流已结束，但没有返回书源结果");
      return result.value;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (message.includes("abort") || controller?.signal.aborted) {
        error.value = "生成任务已停止";
      } else {
        error.value = message;
      }
      const active = steps.value.find((step) => step.status === "running");
      if (active) {
        active.status = "error";
        active.detail = error.value;
      }
      return null;
    } finally {
      running.value = false;
      controller = null;
    }
  }

  function stop() {
    controller?.abort();
  }

  function reset() {
    controller?.abort();
    controller = null;
    steps.value = [];
    running.value = false;
    streamText.value = "";
    result.value = null;
    error.value = null;
  }

  return { steps, running, streamText, result, error, generate, stop, reset };
}
