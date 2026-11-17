<template>
  <div id="app-shell">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="logo">
        <span class="logo-mark">
          <Icon
            name="book-open"
            :size="15"
          />
        </span>
        <div class="logo-text">
          <div class="logo-main">书源工坊</div>
          <div class="logo-sub">XBS 书源编辑器</div>
        </div>
      </div>

      <nav class="nav">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: store.activeTab === item.key }"
          @click="store.activeTab = item.key as any"
          :title="item.label"
        >
          <Icon
            :name="item.icon"
            :size="16"
            class="nav-icon"
          />
          <span class="nav-label">{{ item.label }}</span>
          <span
            v-if="item.key === 'sources' && store.sourceCount > 0"
            class="nav-badge"
          >
            {{ store.sourceCount }}
          </span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="footer-row">
          <a
            href="https://github.com/urzeye/shuyuan-lab"
            target="_blank"
            rel="noopener noreferrer"
            class="footer-link"
          >
            <svg
              class="gh-icon"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
            <span>GitHub</span>
          </a>
          <a
            href="https://github.com/urzeye/shuyuan-lab"
            target="_blank"
            rel="noopener noreferrer"
            class="star-btn"
            title="在 GitHub 上 Star 这个项目"
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="currentColor"
              aria-hidden="true"
            >
              <polygon
                points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
              />
            </svg>
            Star
            <span
              v-if="starCount !== null"
              class="star-count"
              >{{ starCount.toLocaleString() }}</span
            >
          </a>
        </div>
        <div class="footer-note">本地处理 · 数据不上传</div>
      </div>
    </aside>

    <!-- Main content -->
    <div class="main-area">
      <!-- Top bar -->
      <header class="topbar">
        <div class="topbar-title">
          <Icon
            v-if="currentNavItem"
            :name="currentNavItem.icon"
            :size="16"
          />
          {{ currentNavItem?.label }}
        </div>
        <div class="topbar-actions">
          <template v-if="store.activeTab === 'editor'">
            <label class="btn btn-sm btn-muted">
              <Icon
                name="file-lock"
                :size="14"
              />
              导入 XBS
              <input
                type="file"
                accept=".xbs"
                @change="onXbsFile"
              />
            </label>
            <label class="btn btn-sm btn-muted">
              <Icon
                name="file-json"
                :size="14"
              />
              导入 JSON
              <input
                type="file"
                accept=".json"
                @change="onJsonFile"
              />
            </label>
            <button
              class="btn btn-sm btn-primary"
              :disabled="!store.jsonText"
              @click="store.downloadXbs"
            >
              <Icon
                name="download"
                :size="14"
              />
              导出 XBS
            </button>
            <button
              class="btn btn-sm btn-blue"
              :disabled="!store.jsonText"
              @click="store.downloadJson"
            >
              <Icon
                name="download"
                :size="14"
              />
              导出 JSON
            </button>
          </template>
          <template
            v-if="store.activeTab === 'sources' && store.sourceCount > 0"
          >
            <span class="topbar-sep"></span>
            <!-- XBS Split Button -->
            <div
              class="split-btn"
              ref="xbsRef"
            >
              <button
                class="btn btn-sm btn-primary split-main"
                @click="store.downloadXbs"
              >
                <Icon
                  name="download"
                  :size="13"
                />
                XBS
              </button>
              <button
                class="btn btn-sm btn-primary split-arrow"
                @click.stop="xbsOpen = !xbsOpen"
              >
                <Icon
                  name="chevron-down"
                  :size="12"
                />
              </button>
              <div
                v-if="xbsOpen"
                class="split-menu"
              >
                <button
                  class="split-item"
                  @click="
                    store.downloadXbs;
                    xbsOpen = false;
                  "
                >
                  全部导出
                </button>
                <button
                  class="split-item"
                  :disabled="store.enabledCount === 0"
                  @click="
                    store.downloadXbsEnabled;
                    xbsOpen = false;
                  "
                >
                  仅导出启用（{{ store.enabledCount }} 条）
                </button>
              </div>
            </div>
            <!-- JSON Split Button -->
            <div
              class="split-btn"
              ref="jsonRef"
            >
              <button
                class="btn btn-sm btn-blue split-main"
                @click="store.downloadJson"
              >
                <Icon
                  name="download"
                  :size="13"
                />
                JSON
              </button>
              <button
                class="btn btn-sm btn-blue split-arrow"
                @click.stop="jsonOpen = !jsonOpen"
              >
                <Icon
                  name="chevron-down"
                  :size="12"
                />
              </button>
              <div
                v-if="jsonOpen"
                class="split-menu"
              >
                <button
                  class="split-item"
                  @click="
                    store.downloadJson;
                    jsonOpen = false;
                  "
                >
                  全部导出
                </button>
                <button
                  class="split-item"
                  :disabled="store.enabledCount === 0"
                  @click="
                    store.downloadJsonEnabled;
                    jsonOpen = false;
                  "
                >
                  仅导出启用（{{ store.enabledCount }} 条）
                </button>
              </div>
            </div>
          </template>
        </div>
      </header>

      <!-- Tab content -->
      <div class="content">
        <EditorView v-show="store.activeTab === 'editor'" />
        <div
          v-show="store.activeTab === 'sources'"
          class="sources-wrap"
        >
          <SourceTable v-if="store.sourceCount > 0" />
          <div
            v-else
            class="empty-sources"
          >
            <div class="empty-icon-wrap">
              <Icon
                name="library"
                :size="28"
              />
            </div>
            <p>还没有书源</p>
            <p class="hint">导入 XBS 或 JSON 文件后，这里会列出全部书源</p>
            <button
              class="btn btn-sm btn-primary mt"
              @click="store.activeTab = 'editor'"
            >
              去导入
            </button>
          </div>
        </div>
        <DocsView v-show="store.activeTab === 'docs'" />
        <div
          v-show="store.activeTab === 'ai'"
          class="ai-view"
        >
          <AiGeneratorPanel @added="store.activeTab = 'sources'" />
        </div>
      </div>
    </div>

    <ToastContainer :toasts="store.toasts" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useEditorStore } from "@/stores/editor";
import EditorView from "@/views/EditorView.vue";
import SourceTable from "@/components/SourceTable.vue";
import DocsView from "@/views/DocsView.vue";
import AiGeneratorPanel from "@/components/AiGeneratorPanel.vue";
import Icon from "@/components/Icon.vue";

const xbsOpen = ref(false);
const jsonOpen = ref(false);
const xbsRef = ref<HTMLElement | null>(null);
const jsonRef = ref<HTMLElement | null>(null);

function onDocClick(e: MouseEvent) {
  if (xbsRef.value && !xbsRef.value.contains(e.target as Node))
    xbsOpen.value = false;
  if (jsonRef.value && !jsonRef.value.contains(e.target as Node))
    jsonOpen.value = false;
}
onMounted(() => document.addEventListener("click", onDocClick));
onUnmounted(() => document.removeEventListener("click", onDocClick));

// GitHub star count：仅作展示增强，限流/离线时静默降级为无数字按钮
const starCount = ref<number | null>(null);
onMounted(async () => {
  try {
    const r = await fetch(
      "https://api.github.com/repos/urzeye/shuyuan-lab",
    );
    if (r.ok) {
      const d = await r.json();
      starCount.value =
        typeof d.stargazers_count === "number" ? d.stargazers_count : null;
    }
  } catch {
    /* 静默降级 */
  }
});

import ToastContainer from "@/components/ToastContainer.vue";

const store = useEditorStore();

const navItems = [
  { key: "editor", icon: "convert", label: "格式转换" },
  { key: "sources", icon: "library", label: "书源管理" },
  { key: "ai", icon: "sparkles", label: "AI 生成书源" },
  { key: "docs", icon: "book-open", label: "规则文档" },
];

const currentNavItem = computed(() =>
  navItems.find((n) => n.key === store.activeTab),
);

function onXbsFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) {
    store.loadXbsFile(f);
    (e.target as HTMLInputElement).value = "";
  }
}
function onJsonFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) {
    store.loadJsonFile(f);
    (e.target as HTMLInputElement).value = "";
  }
}
</script>

<style>
/* ── Global Reset & CSS Variables (Modern Vercel / Linear Minimalist) ── */
:root {
  --bg: #fafafa;
  --surface: #ffffff;
  --surface2: #f3f4f6;
  --border: #eaeaea;
  --border-strong: #d4d4d4;
  --border-focus: #999999;
  --accent: #000000;
  --accent-hover: #333333;
  --accent-light: #ebebeb;
  --blue: #0070f3; /* 信息/蓝色动作 */
  --blue-hover: #0051b3;
  --blue-soft: #eff6ff;
  --green: #16a34a; /* 成功/启用 */
  --green-hover: #15803d;
  --green-soft: #f0fdf4;
  --red: #dc2626;
  --red-hover: #b91c1c;
  --red-soft: #fef2f2;
  --amber: #b45309;
  --amber-soft: #fffbeb;
  --amber-border: #fde68a;
  --star: #eab308;
  --text: #000000;
  --text2: #666666;
  --text3: #888888;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md:
    0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  --shadow-lg:
    0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --shadow-float: 0 12px 24px rgba(0, 0, 0, 0.15);
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
html,
body,
#app {
  height: 100%;
}
body {
  font-family:
    -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "PingFang SC",
    sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

/* ── Browser surfaces: selection, focus, scrollbars ── */
::selection {
  background: rgba(0, 0, 0, 0.88);
  color: #fff;
}

:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
  border-radius: 4px;
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #b5b5b5;
}
</style>

<style scoped>
#app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── Sidebar ── */
.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 1px 0 10px rgba(0, 0, 0, 0.02);
  z-index: 10;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px 20px 20px;
  border-bottom: none;
}
.logo-mark {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}
.logo-text {
  display: flex;
  flex-direction: column;
}
.logo-main {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.3px;
}
.logo-sub {
  font-size: 11.5px;
  color: var(--text3);
  font-weight: 500;
  margin-top: 2px;
}

.nav {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text2);
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.nav-item:hover {
  background: var(--surface2);
  color: var(--text);
}
.nav-item.active {
  background: var(--accent-light);
  color: var(--accent);
  font-weight: 600;
}
.nav-icon {
  display: inline-flex;
  flex-shrink: 0;
}
.nav-label {
  flex: 1;
}
.nav-badge {
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 12px;
  min-width: 22px;
  text-align: center;
}

.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.footer-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text3);
  text-decoration: none;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 8px;
  margin-left: -8px;
  border-radius: 6px;
  transition:
    background 0.15s,
    color 0.15s;
}
.footer-link:hover {
  color: var(--accent);
  background: var(--surface2);
}
.gh-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* Star 按钮：footer 的主行动，GitHub 黄星吸引注意 */
.star-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  box-shadow: var(--shadow-sm);
  transition:
    border-color 0.15s,
    background 0.15s;
  flex-shrink: 0;
}
.star-btn:hover {
  border-color: var(--border-focus);
  background: var(--surface2);
}
.star-btn svg {
  color: var(--star);
  transition: transform 0.15s;
}
.star-btn:hover svg {
  transform: scale(1.2);
}
.star-count {
  border-left: 1px solid var(--border);
  padding-left: 6px;
  color: var(--text2);
  font-variant-numeric: tabular-nums;
}
.footer-note {
  font-size: 11px;
  color: var(--text3);
  margin-top: 8px;
  padding: 0 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
.footer-note::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
}

/* ── Main area ── */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--bg);
}

/* ── Topbar (Glassmorphism) ── */
.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 24px;
  min-height: 60px;
  box-sizing: border-box;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  z-index: 5;
}
.topbar-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.2px;
  white-space: nowrap;
  flex-shrink: 0;
}
.topbar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.topbar-actions label {
  cursor: pointer;
}
.topbar-actions input {
  display: none;
}
.topbar-sep {
  display: inline-block;
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 4px;
}

/* Split button */
.split-btn {
  position: relative;
  display: inline-flex;
}
.split-main {
  border-radius: 6px 0 0 6px !important;
  border-right: 1px solid rgba(255, 255, 255, 0.25) !important;
}
.split-arrow {
  border-radius: 0 6px 6px 0 !important;
  padding: 6px 8px !important;
  font-size: 11px !important;
  min-width: 24px;
}
.split-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  min-width: 180px;
  z-index: 100;
  overflow: hidden;
}
.split-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 9px 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
  transition: background 0.1s;
}
.split-item:hover:not(:disabled) {
  background: var(--surface2);
}
.split-item:disabled {
  color: var(--text3);
  cursor: not-allowed;
}

/* ── Content Area ── */
.content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
}

.sources-wrap {
  flex: 1;
  min-height: 0;
  background: var(--surface);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ai-view {
  flex: 1;
  min-height: 0;
  display: flex;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.empty-sources {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text3);
}
.empty-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text3);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.empty-sources p {
  font-size: 16px;
  color: var(--text);
  font-weight: 500;
}
.empty-sources .hint {
  font-size: 13.5px;
  color: var(--text3);
  font-weight: 400;
}
.mt {
  margin-top: 12px;
}

/* ── Responsive: sidebar collapses to icon rail ── */
/* 必须放在 scoped 块内：scoped 基础样式带属性选择器，权重高于非 scoped 的媒体查询 */
@media (max-width: 960px) {
  .sidebar {
    width: 60px;
  }
  .logo {
    padding: 18px 0 14px;
    justify-content: center;
  }
  .logo-text,
  .nav-label,
  .nav-badge,
  .sidebar-footer {
    display: none;
  }
  .nav {
    padding: 8px;
  }
  .nav-item {
    justify-content: center;
    padding: 10px 0;
  }
  .topbar {
    padding: 8px 14px;
    flex-wrap: wrap;
    row-gap: 8px;
  }
  .content {
    padding: 12px 14px;
  }
}
</style>

<style>
/* ── Global Buttons (Vercel/Linear Style) ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
  box-shadow: var(--shadow-sm);
  font-family: inherit;
}
.btn:active {
  transform: scale(0.97);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.btn-xs {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}
.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  box-shadow: var(--shadow-md);
}

.btn-success {
  background: var(--green);
  color: #fff;
  border-color: var(--green);
  box-shadow: var(--shadow-sm);
}
.btn-success:hover:not(:disabled) {
  background: var(--green-hover);
  border-color: var(--green-hover);
  box-shadow: var(--shadow-md);
}

.btn-blue {
  background: var(--blue);
  color: #fff;
  border-color: var(--blue);
  box-shadow: var(--shadow-sm);
}
.btn-blue:hover:not(:disabled) {
  background: var(--blue-hover);
  border-color: var(--blue-hover);
  box-shadow: var(--shadow-md);
}

.btn-danger {
  background: var(--red);
  color: #fff;
  border-color: var(--red);
  box-shadow: var(--shadow-sm);
}
.btn-danger:hover:not(:disabled) {
  background: var(--red-hover);
  border-color: var(--red-hover);
  box-shadow: var(--shadow-md);
}

.btn-ghost {
  background: transparent;
  color: var(--text2);
  border: 1px solid transparent;
  box-shadow: none;
}
.btn-ghost:hover:not(:disabled) {
  background: var(--surface2);
  color: var(--text);
  box-shadow: none;
}
.btn-ghost.danger-hover:hover:not(:disabled) {
  background: var(--red-soft);
  color: var(--red);
}

.btn-muted {
  background: var(--surface);
  color: var(--text2);
  border: 1px solid var(--border);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}
.btn-muted:hover:not(:disabled) {
  border-color: var(--border-focus);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}
</style>
