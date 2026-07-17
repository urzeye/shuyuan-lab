import { defineStore } from "pinia";
import { ref, watch } from "vue";

const LS_KEY = "xbs_agent_config";
const LEGACY_LS_KEY = "xbs_ai_config";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort: "high" | "max";
}

function defaultConfig(): AiConfig {
  return {
    baseUrl: "",
    apiKey: "",
    model: "",
    reasoningEffort: "high",
  };
}

function normalizeConfig(raw: Partial<AiConfig>): AiConfig {
  return {
    ...defaultConfig(),
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "",
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey.trim() : "",
    model: typeof raw.model === "string" ? raw.model.trim() : "",
    reasoningEffort: raw.reasoningEffort === "max" ? "max" : "high",
  };
}

function persistedConfig(value: AiConfig) {
  return {
    baseUrl: value.baseUrl,
    apiKey: value.apiKey,
    model: value.model,
    reasoningEffort: value.reasoningEffort,
  };
}

function loadFromStorage(): AiConfig {
  try {
    const raw = localStorage.getItem(LS_KEY) || localStorage.getItem(LEGACY_LS_KEY);
    const config = raw
      ? normalizeConfig(JSON.parse(raw) as Partial<AiConfig>)
      : defaultConfig();
    // Normalize legacy config keys and remove fields no longer used by the Agent flow.
    localStorage.setItem(LS_KEY, JSON.stringify(persistedConfig(config)));
    localStorage.removeItem(LEGACY_LS_KEY);
    return config;
  } catch {
    // Ignore malformed legacy configuration.
  }
  return defaultConfig();
}

export const useAiConfigStore = defineStore("aiConfig", () => {
  const config = ref<AiConfig>(loadFromStorage());

  watch(
    config,
    (value) => localStorage.setItem(LS_KEY, JSON.stringify(persistedConfig(value))),
    { deep: true },
  );

  function save(value: AiConfig) {
    config.value = normalizeConfig(value);
  }

  return { config, save };
});
