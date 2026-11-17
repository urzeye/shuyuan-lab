<template>
  <div class="sources-view">
    <!-- Toolbar -->
    <div class="s-toolbar">
      <div class="s-stats">
        共 <strong>{{ store.sourceCount }}</strong> 条
        <span class="s-stats-sep">·</span> 启用
        <strong class="green">{{ store.enabledCount }}</strong>
        <span class="s-stats-sep">·</span> 禁用
        <strong class="muted">{{ store.sourceCount - store.enabledCount }}</strong>
      </div>
      <div class="s-search-wrap">
        <Icon
          name="search"
          :size="14"
          class="s-search-icon"
        />
        <input
          v-model="search"
          class="s-search"
          placeholder="搜索书源名称或网址…"
          @input="resetPage"
        />
      </div>
      <div class="s-actions">
        <!-- Batch actions (visible when items selected) -->
        <template v-if="selected.size > 0">
          <span class="batch-hint">已选 {{ selected.size }} 条</span>
          <button
            class="btn btn-xs btn-success"
            @click="batchEnable"
          >
            <Icon
              name="check"
              :size="12"
            />
            批量启用
          </button>
          <button
            class="btn btn-xs btn-muted"
            @click="batchDisable"
          >
            <Icon
              name="ban"
              :size="12"
            />
            批量禁用
          </button>
          <button
            class="btn btn-xs btn-danger"
            @click="batchDelete"
          >
            <Icon
              name="trash"
              :size="12"
            />
            批量删除
          </button>
          <button
            class="btn btn-xs btn-muted"
            @click="selected.clear()"
          >
            取消选择
          </button>
        </template>
        <template v-else>
          <button
            class="btn btn-xs btn-muted"
            @click="openAdd"
          >
            <Icon
              name="plus"
              :size="12"
            />
            新增书源
          </button>
          <button
            class="btn btn-xs btn-muted"
            @click="store.setAllEnabled(true)"
          >
            全部启用
          </button>
          <button
            class="btn btn-xs btn-muted"
            @click="store.setAllEnabled(false)"
          >
            全部禁用
          </button>
          <span class="s-sep"></span>
          <button
            class="btn btn-xs btn-muted"
            :class="{ 'btn-active': checkerOpen }"
            @click="checkerOpen = !checkerOpen"
          >
            <Icon
              name="activity"
              :size="12"
            />
            有效性检测
          </button>
          <button
            class="btn btn-xs btn-blue"
            @click="store.activeTab = 'ai'"
          >
            <Icon
              name="sparkles"
              :size="12"
            />
            AI 生成书源
          </button>
        </template>
      </div>
    </div>

    <!-- Checker bar (inline, above table) -->
    <div
      v-if="checkerOpen"
      class="check-bar"
    >
      <div
        v-if="httpWarning"
        class="check-http-warn"
      >
        <Icon
          name="alert-triangle"
          :size="13"
        />
        当前页面为 HTTPS，HTTP 书源无法被浏览器检测，将自动跳过；本地运行可检测全部书源。
      </div>
      <div class="check-bar-row">
        <template v-if="!checker.running.value && !checkDone">
          <input
            v-model="checker.keyword.value"
            class="check-input"
            placeholder="输入搜索关键词，如：斗破苍穹"
            @keydown.enter="startCheck"
          />
          <label class="check-opt">
            <span>并发</span>
            <select v-model.number="checker.concurrency.value">
              <option
                v-for="n in [1, 3, 5, 10, 20]"
                :key="n"
                :value="n"
              >
                {{ n }}
              </option>
            </select>
          </label>
          <label class="check-opt">
            <span>超时 (s)</span>
            <select v-model.number="checker.timeout.value">
              <option
                v-for="n in [5, 8, 10, 15, 20]"
                :key="n"
                :value="n"
              >
                {{ n }}
              </option>
            </select>
          </label>
          <button
            class="btn btn-xs btn-primary"
            :disabled="!checker.keyword.value.trim()"
            @click="startCheck"
          >
            <Icon
              name="play"
              :size="12"
            />
            开始检测
          </button>
        </template>

        <template v-else>
          <div class="check-progress">
            <div
              class="check-progress-fill"
              :class="{ done: checkDone }"
              :style="{ width: checkProgress + '%' }"
            />
          </div>
          <div class="check-summary">
            <span class="cs-ok">
              <Icon
                name="check-circle"
                :size="12"
              />
              {{ checker.summary.value.ok }} 可达
            </span>
            <span
              v-if="checker.summary.value.unreachable > 0"
              class="cs-err"
            >
              <Icon
                name="x-circle"
                :size="12"
              />
              {{ checker.summary.value.unreachable }} 不可达
            </span>
            <span
              v-if="checker.summary.value.httpErr > 0"
              class="cs-http"
              title="服务器可达但搜索请求返回错误状态，可能是搜索规则问题，不代表书源失效"
            >
              <Icon
                name="alert-triangle"
                :size="12"
              />
              {{ checker.summary.value.httpErr }} 搜索异常
            </span>
            <span
              v-if="checker.summary.value.skip > 0"
              class="cs-skip"
            >
              {{ checker.summary.value.skip }} 跳过
            </span>
            <span
              v-if="checker.summary.value.interrupted > 0"
              class="cs-skip"
            >
              {{ checker.summary.value.interrupted }} 已中断
            </span>
            <span class="cs-total">/ {{ checker.summary.value.total }}</span>
          </div>
          <button
            v-if="checker.running.value"
            class="btn btn-xs btn-danger"
            @click="checker.stop"
          >
            停止
          </button>
          <template v-else>
            <button
              v-if="checker.summary.value.unreachable > 0"
              class="btn btn-xs btn-danger"
              @click="askDisableUnreachable"
            >
              <Icon
                name="ban"
                :size="12"
              />
              禁用不可达 ({{ checker.summary.value.unreachable }})
            </button>
            <button
              class="btn btn-xs btn-muted"
              @click="rerunCheck"
            >
              <Icon
                name="refresh-cw"
                :size="12"
              />
              重新检测
            </button>
            <button
              class="btn btn-xs btn-muted"
              @click="clearCheck"
            >
              清除结果
            </button>
          </template>
        </template>

        <button
          class="check-bar-close"
          title="收起"
          @click="checkerOpen = false"
        >
          <Icon
            name="x"
            :size="13"
          />
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th class="th-check">
              <input
                type="checkbox"
                :checked="allPageSelected"
                :indeterminate="somePageSelected"
                @change="toggleSelectPage"
                title="全选当前页"
              />
            </th>
            <th
              @click="setSort('sourceName')"
              :class="sortClass('sourceName')"
            >
              书源名称
            </th>
            <th
              @click="setSort('sourceUrl')"
              :class="sortClass('sourceUrl')"
            >
              网址
            </th>
            <th
              @click="setSort('enable')"
              :class="sortClass('enable')"
            >
              状态
            </th>
            <th
              v-if="hasCheckResults"
              class="th-check-result"
            >
              检测
            </th>
            <th
              @click="setSort('weight')"
              :class="sortClass('weight')"
            >
              权重
            </th>
            <th
              @click="setSort('lastModifyTime')"
              :class="sortClass('lastModifyTime')"
            >
              修改时间
            </th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in pagedRows"
            :key="row._key"
            :class="{ 'row-selected': selected.has(row._key) }"
          >
            <td class="td-check">
              <input
                type="checkbox"
                :checked="selected.has(row._key)"
                @change="toggleRow(row._key)"
              />
            </td>
            <td
              class="td-name td-name-link"
              :title="row.sourceName"
              @click="openDetail(row._key)"
            >
              {{ row.sourceName }}
            </td>
            <td class="td-url">
              <a
                v-if="row.sourceUrl"
                :href="row.sourceUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ row.sourceUrl }}
              </a>
              <span
                v-else
                class="muted"
                >—</span
              >
            </td>
            <td>
              <span :class="['badge', row.enable ? 'badge-on' : 'badge-off']">
                {{ row.enable ? "启用" : "禁用" }}
              </span>
            </td>
            <td
              v-if="hasCheckResults"
              class="td-check-result"
            >
              <template v-if="checkMap.get(row._key)">
                <span
                  v-if="checkMap.get(row._key)!.status === 'checking'"
                  class="cr cr-checking"
                >
                  <span class="cr-spinner"></span>检测中
                </span>
                <span
                  v-else-if="checkMap.get(row._key)!.status === 'pending'"
                  class="cr cr-pending"
                  >等待中</span
                >
                <span
                  v-else-if="checkMap.get(row._key)!.status === 'ok'"
                  class="cr cr-ok"
                >
                  <Icon
                    name="check-circle"
                    :size="12"
                  />{{ checkMap.get(row._key)!.ms }}ms
                </span>
                <span
                  v-else-if="checkMap.get(row._key)!.status === 'skip'"
                  class="cr cr-skip"
                  :title="checkMap.get(row._key)!.detail"
                  >跳过</span
                >
                <span
                  v-else-if="checkMap.get(row._key)!.errKind === 'http'"
                  class="cr cr-http"
                  :title="'搜索请求返回 ' + checkMap.get(row._key)!.detail + '，站点本身可能正常，可能只是搜索规则问题'"
                >
                  <Icon
                    name="alert-triangle"
                    :size="12"
                  />{{ checkMap.get(row._key)!.detail }}
                </span>
                <span
                  v-else-if="!checkMap.get(row._key)!.errKind"
                  class="cr cr-skip"
                  >已中断</span
                >
                <span
                  v-else
                  class="cr cr-err"
                  :title="checkMap.get(row._key)!.detail"
                >
                  <Icon
                    name="x-circle"
                    :size="12"
                  />{{ checkMap.get(row._key)!.detail }}
                </span>
              </template>
              <span
                v-else
                class="cr cr-skip"
                >—</span
              >
            </td>
            <td>{{ row.weight }}</td>
            <td class="td-date">{{ formatDate(row.lastModifyTime) }}</td>
            <td class="td-ops">
              <button
                class="switch"
                :class="{ on: row.enable }"
                :title="row.enable ? '点击禁用' : '点击启用'"
                :aria-checked="row.enable"
                role="switch"
                @click="store.toggleSource(row._key)"
              >
                <span class="switch-thumb"></span>
              </button>
              <button
                class="btn btn-xs btn-ghost danger-hover"
                title="删除该书源"
                @click="confirmDelete(row._key, row.sourceName)"
              >
                <Icon
                  name="trash"
                  :size="13"
                />
              </button>
            </td>
          </tr>
          <tr v-if="filteredRows.length === 0">
            <td
              :colspan="hasCheckResults ? 8 : 7"
              class="empty"
            >
              未找到匹配书源
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="pagination">
      <button
        class="btn btn-xs btn-muted"
        :disabled="page <= 1"
        @click="page--"
      >
        ‹ 上一页
      </button>
      <span class="page-info"
        >{{ page }} / {{ totalPages }}（共 {{ filteredRows.length }} 条）</span
      >
      <button
        class="btn btn-xs btn-muted"
        :disabled="page >= totalPages"
        @click="page++"
      >
        下一页 ›
      </button>
      <span class="page-size-label">每页</span>
      <select
        class="page-size-select"
        v-model="pageSize"
        @change="resetPage"
      >
        <option :value="10">10</option>
        <option :value="20">20</option>
        <option :value="50">50</option>
        <option :value="100">100</option>
      </select>
      <span class="page-size-label">条</span>
    </div>
  </div>

  <!-- Detail Drawer: edit single source JSON -->
  <SourceDrawer
    v-model="detailKey"
    :title="detailTitle"
  >
    <div
      v-if="detailKey !== null"
      class="detail-editor-wrap"
    >
      <JsonEditor
        v-model="detailJson"
        class="detail-editor"
      />
      <div
        class="detail-status"
        :class="{ invalid: detailError }"
      >
        <Icon
          :name="detailError ? 'x-circle' : 'check-circle'"
          :size="13"
        />
        {{ detailError ? `JSON 错误：${detailError}` : "JSON 格式有效" }}
      </div>
    </div>
    <template #footer>
      <button
        class="btn btn-sm btn-muted"
        @click="detailKey = null"
      >
        取消
      </button>
      <button
        class="btn btn-sm btn-primary"
        :disabled="Boolean(detailError)"
        @click="saveDetail"
      >
        保存
      </button>
    </template>
  </SourceDrawer>

  <!-- Add Drawer: new source form -->
  <SourceDrawer
    v-model="addOpen"
    title="新增书源"
  >
    <form
      class="add-form"
      @submit.prevent="saveAdd"
    >
      <label class="form-row">
        <span>书源名称 <em>*</em></span>
        <input
          v-model="addForm.sourceName"
          placeholder="如：起点中文网"
          required
        />
      </label>
      <label class="form-row">
        <span>书源网址 <em>*</em></span>
        <input
          v-model="addForm.sourceUrl"
          placeholder="https://"
          required
        />
      </label>
      <label class="form-row">
        <span>权重</span>
        <input
          v-model.number="addForm.weight"
          type="number"
          placeholder="0"
        />
      </label>
      <div class="form-row form-row-switch">
        <span>启用</span>
        <button
          type="button"
          class="switch"
          :class="{ on: addForm.enable }"
          role="switch"
          :aria-checked="addForm.enable"
          @click="addForm.enable = !addForm.enable"
        >
          <span class="switch-thumb"></span>
        </button>
      </div>
      <div class="form-hint">
        其余字段可在保存后点击书源名称，在 JSON 编辑器中完善
      </div>
    </form>
    <template #footer>
      <button
        type="button"
        class="btn btn-sm btn-muted"
        @click="addOpen = null"
      >
        取消
      </button>
      <button
        type="button"
        class="btn btn-sm btn-primary"
        @click="saveAdd"
      >
        创建
      </button>
    </template>
  </SourceDrawer>

  <!-- Delete confirmation -->
  <ConfirmDialog
    :open="deleteConfirm.open"
    :title="deleteConfirm.title"
    :message="deleteConfirm.message"
    :confirm-text="deleteConfirm.confirmText"
    @confirm="runDelete"
    @cancel="deleteConfirm.open = false"
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useEditorStore } from "@/stores/editor";
import { useSourceChecker } from "@/composables/useSourceChecker";
import SourceDrawer from "@/components/SourceDrawer.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import JsonEditor from "@/components/JsonEditor.vue";
import Icon from "@/components/Icon.vue";
import type { BookSource } from "@/lib/types";

const store = useEditorStore();
const checkerOpen = ref(false);
const checker = useSourceChecker();

const hasCheckResults = computed(() => checker.results.value.length > 0);
const checkMap = computed(
  () => new Map(checker.results.value.map((r) => [r.key, r])),
);
const checkDone = computed(
  () =>
    hasCheckResults.value &&
    !checker.running.value &&
    checker.summary.value.done >= checker.summary.value.total,
);
const checkProgress = computed(() => {
  const { done, total } = checker.summary.value;
  return total > 0 ? Math.round((done / total) * 100) : 0;
});
const httpWarning = computed(
  () =>
    location.protocol === "https:" &&
    store.sources.some((s) => s.sourceUrl.startsWith("http:")),
);

function startCheck() {
  if (!checker.keyword.value.trim() || checker.running.value) return;
  checker.start(store.sources);
}

function rerunCheck() {
  checkerOpen.value = true;
  checker.clear();
}

function clearCheck() {
  checker.clear();
  checkerOpen.value = false;
}

function askDisableUnreachable() {
  const keys = checker.unreachableKeys();
  if (keys.length === 0) return;
  askDelete(
    "禁用不可达书源",
    `将禁用 ${keys.length} 条不可达书源（网络错误/超时）。搜索异常（如 HTTP 404）的书源不受影响，可随时重新启用。`,
    () => {
      keys.forEach((k) => store.setSourceEnabled(k, false));
      store.toast(`已禁用 ${keys.length} 条不可达书源`, "ok");
    },
    "确认禁用",
  );
}

const search = ref("");
const sortKey = ref<keyof BookSource>("sourceName");
const sortDir = ref<1 | -1>(1);
const page = ref(1);
const pageSize = ref(20);
const selected = ref(new Set<string>());

function setSort(key: keyof BookSource) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 1 ? -1 : 1;
  else {
    sortKey.value = key;
    sortDir.value = 1;
  }
  page.value = 1;
}

function sortClass(key: string) {
  if (sortKey.value !== key) return "sortable";
  return sortDir.value === 1 ? "sort-asc" : "sort-desc";
}

function resetPage() {
  page.value = 1;
}

const filteredRows = computed(() => {
  const q = search.value.toLowerCase();
  let rows = store.sources;
  if (q)
    rows = rows.filter(
      (r) =>
        r.sourceName.toLowerCase().includes(q) ||
        r.sourceUrl.toLowerCase().includes(q),
    );
  return [...rows].sort((a, b) => {
    let av: unknown = a[sortKey.value],
      bv: unknown = b[sortKey.value];
    if (typeof av === "boolean") av = av ? 1 : 0;
    if (typeof bv === "boolean") bv = bv ? 1 : 0;
    if ((av as number | string) < (bv as number | string))
      return -sortDir.value;
    if ((av as number | string) > (bv as number | string)) return sortDir.value;
    return 0;
  });
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)),
);

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});

const allPageSelected = computed(
  () =>
    pagedRows.value.length > 0 &&
    pagedRows.value.every((r) => selected.value.has(r._key)),
);
const somePageSelected = computed(
  () =>
    !allPageSelected.value &&
    pagedRows.value.some((r) => selected.value.has(r._key)),
);

function toggleRow(key: string) {
  const s = new Set(selected.value);
  s.has(key) ? s.delete(key) : s.add(key);
  selected.value = s;
}
function toggleSelectPage() {
  const s = new Set(selected.value);
  if (allPageSelected.value) {
    pagedRows.value.forEach((r) => s.delete(r._key));
  } else {
    pagedRows.value.forEach((r) => s.add(r._key));
  }
  selected.value = s;
}
function batchEnable() {
  selected.value.forEach((k) => store.setSourceEnabled(k, true));
  selected.value = new Set();
}
function batchDisable() {
  selected.value.forEach((k) => store.setSourceEnabled(k, false));
  selected.value = new Set();
}
// ── Delete confirmation ─────────────────────────────────────
const deleteConfirm = ref({
  open: false,
  title: "",
  message: "",
  confirmText: "确认删除",
  action: null as null | (() => void),
});

function askDelete(
  title: string,
  message: string,
  action: () => void,
  confirmText = "确认删除",
) {
  deleteConfirm.value = { open: true, title, message, confirmText, action };
}
function runDelete() {
  deleteConfirm.value.action?.();
  deleteConfirm.value.open = false;
}

function batchDelete() {
  const count = selected.value.size;
  askDelete(
    "批量删除书源",
    `将删除选中的 ${count} 条书源，此操作不可撤销。`,
    () => {
      selected.value.forEach((k) => store.deleteSource(k));
      selected.value = new Set();
    },
  );
}

function formatDate(v: string | number | undefined): string {
  if (!v) return "—";
  let ms = typeof v === "number" ? v : Number(v);
  if (isNaN(ms)) return String(v);
  // lastModifyTime is in seconds if value < 1e11 (year ~5138); convert to ms
  if (ms < 1e11) ms *= 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("zh-CN");
}

function confirmDelete(key: string, name: string) {
  askDelete("删除书源", `将删除书源「${name}」，此操作不可撤销。`, () =>
    store.deleteSource(key),
  );
}

// ── Detail Drawer ────────────────────────────────────────────
const detailKey = ref<string | null>(null);
const detailJson = ref("");
const detailTitle = computed(() => {
  if (!detailKey.value) return "";
  const s = store.sources.find((x) => x._key === detailKey.value);
  return s ? `编辑：${s.sourceName}` : "编辑书源";
});
const detailError = computed(() => {
  if (!detailKey.value) return null;
  try {
    JSON.parse(detailJson.value);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
});

function openDetail(key: string) {
  const s = store.sources.find((x) => x._key === key);
  if (!s) return;
  detailJson.value = JSON.stringify(s._raw, null, 2);
  detailKey.value = key;
}

function saveDetail() {
  if (!detailKey.value) return;
  try {
    const obj = JSON.parse(detailJson.value) as Record<string, unknown>;
    store.updateSource(detailKey.value, obj);
    detailKey.value = null;
  } catch (e) {
    store.toast(`保存失败：${(e as Error).message}`, "err");
  }
}

// ── Add Drawer ───────────────────────────────────────────────
const addOpen = ref<null | true>(null);
const addForm = ref({ sourceName: "", sourceUrl: "", weight: 0, enable: true });

function openAdd() {
  addForm.value = { sourceName: "", sourceUrl: "", weight: 0, enable: true };
  addOpen.value = true;
}

function saveAdd() {
  if (!addForm.value.sourceName.trim() || !addForm.value.sourceUrl.trim()) {
    store.toast("书源名称和网址为必填项", "warn");
    return;
  }
  store.addSource({
    sourceName: addForm.value.sourceName.trim(),
    sourceUrl: addForm.value.sourceUrl.trim(),
    weight: addForm.value.weight,
    enable: addForm.value.enable,
    lastModifyTime: Math.floor(Date.now() / 1000),
  });
  addOpen.value = null;
}
</script>

<style scoped>
.sources-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 0;
}

.s-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface2);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.s-stats {
  font-size: 13px;
  color: var(--text2);
  flex-shrink: 0;
  white-space: nowrap;
}
.s-stats strong {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.s-stats strong.green {
  color: var(--green);
}
.s-stats strong.muted {
  color: var(--text3);
}
.s-stats-sep {
  color: var(--border-strong);
  margin: 0 2px;
}
.s-search-wrap {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 320px;
  display: flex;
  align-items: center;
}
.s-search-icon {
  position: absolute;
  left: 10px;
  color: var(--text3);
  pointer-events: none;
}
.s-search {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 6px 12px 6px 30px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}
.s-search:focus {
  border-color: var(--accent);
}
.s-search::placeholder {
  color: var(--text3);
}
.s-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: center;
}
.s-sep {
  display: inline-block;
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 2px;
}
.btn-active {
  border-color: var(--accent);
  color: var(--text);
}

/* ── Inline checker bar ── */
.check-bar {
  border-bottom: 1px solid var(--border);
  background: var(--surface2);
  flex-shrink: 0;
}
.check-http-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--amber);
  background: var(--amber-soft);
  border-bottom: 1px solid var(--amber-border);
}
.check-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  flex-wrap: wrap;
}
.check-input {
  flex: 1;
  min-width: 180px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  outline: none;
}
.check-input:focus {
  border-color: var(--accent);
}
.check-opt {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text2);
  white-space: nowrap;
}
.check-opt select {
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  outline: none;
}
.check-progress {
  flex: 1;
  min-width: 120px;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.check-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s ease;
}
.check-progress-fill.done {
  background: var(--green);
}
.check-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.check-summary > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}
.cs-ok {
  color: var(--green);
}
.cs-err {
  color: var(--red);
}
.cs-http {
  color: var(--amber);
  cursor: help;
}
.cs-skip {
  color: var(--text3);
}
.cs-total {
  color: var(--text2);
  font-weight: 400;
}
.check-bar-close {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text3);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  flex-shrink: 0;
}
.check-bar-close:hover {
  background: var(--surface);
  color: var(--text);
}

/* ── Per-row check result cell ── */
.td-check-result {
  white-space: nowrap;
}
.cr {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.cr-ok {
  color: var(--green);
}
.cr-err {
  color: var(--red);
}
.cr-http {
  color: var(--amber);
  cursor: help;
}
.cr-skip,
.cr-pending {
  color: var(--text3);
}
.cr-checking {
  color: var(--blue);
}
.cr-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--border);
  border-top-color: var(--blue);
  border-radius: 50%;
  animation: cr-spin 0.7s linear infinite;
}
@keyframes cr-spin {
  to {
    transform: rotate(360deg);
  }
}

.table-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
}
.table-scroll::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.table-scroll::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th {
  padding: 9px 14px;
  text-align: left;
  color: var(--text3);
  font-weight: 600;
  font-size: 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface2);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}
th.sortable {
  cursor: pointer;
}
th.sortable:hover {
  color: var(--text);
}
th.sort-asc::after {
  content: " ↑";
  color: var(--accent);
}
th.sort-desc::after {
  content: " ↓";
  color: var(--accent);
}

td {
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
tr:last-child td {
  border-bottom: none;
}
tr:hover td {
  background: #fafafa;
}

.td-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.td-url {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.td-url a {
  color: var(--accent);
  text-decoration: none;
  font-size: 12px;
}
.td-url a:hover {
  text-decoration: underline;
}
.td-date {
  white-space: nowrap;
  color: var(--text3);
  font-size: 12px;
}
.td-ops {
  display: flex;
  gap: 5px;
  white-space: nowrap;
  align-items: center;
}
.muted {
  color: var(--text3);
}
.empty {
  text-align: center;
  color: var(--text3);
  padding: 32px;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}
.badge-on {
  background: var(--green-soft);
  color: var(--green);
  border: 1px solid #bbf7d0;
}
.badge-off {
  background: var(--surface2);
  color: var(--text3);
  border: 1px solid var(--border);
}

/* 启用开关 */
.switch {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface2);
  cursor: pointer;
  padding: 0;
  transition:
    background 0.18s,
    border-color 0.18s;
  flex-shrink: 0;
}
.switch-thumb {
  position: absolute;
  top: 1.5px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
  transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.switch.on {
  background: var(--green);
  border-color: var(--green);
}
.switch.on .switch-thumb {
  transform: translateX(14px);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--surface2);
  flex-shrink: 0;
}
.page-info {
  font-size: 13px;
  color: var(--text3);
}
.page-size-label {
  font-size: 13px;
  color: var(--text3);
}
.page-size-select {
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  outline: none;
}
.page-size-select:focus {
  border-color: var(--accent);
}

.th-check,
.td-check {
  width: 36px;
  text-align: center;
  padding: 0 8px;
}

.batch-hint {
  font-size: 12px;
  color: var(--text2);
  margin-right: 4px;
}

.td-name-link {
  cursor: pointer;
  color: var(--accent);
  text-decoration: underline;
  text-decoration-color: transparent;
  transition: text-decoration-color 0.15s;
}
.td-name-link:hover {
  text-decoration-color: var(--accent);
}

.detail-editor-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: calc(100vh - 170px);
}
.detail-editor {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.detail-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--green);
  padding: 0 2px;
}
.detail-status.invalid {
  color: var(--red);
}

.add-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text2);
}
.form-row span em {
  color: var(--red);
  font-style: normal;
}
.form-row input[type="text"],
.form-row input[type="number"],
.form-row input:not([type="checkbox"]) {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.form-row input:focus {
  border-color: var(--accent);
}
.form-row-switch {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.form-hint {
  font-size: 12px;
  color: var(--text3);
  padding: 8px 12px;
  background: var(--surface2);
  border-radius: 6px;
  border-left: 3px solid var(--border);
}
</style>
