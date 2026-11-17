<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div
        v-if="open"
        class="confirm-backdrop"
        @click.self="$emit('cancel')"
      >
        <div
          class="confirm-dialog"
          role="alertdialog"
          :aria-label="title"
        >
          <div class="confirm-icon">
            <Icon
              name="alert-triangle"
              :size="20"
            />
          </div>
          <div class="confirm-text">
            <div class="confirm-title">{{ title }}</div>
            <div class="confirm-msg">{{ message }}</div>
          </div>
          <div class="confirm-actions">
            <button
              class="btn btn-sm btn-muted"
              @click="$emit('cancel')"
            >
              取消
            </button>
            <button
              ref="confirmBtn"
              class="btn btn-sm btn-danger"
              @click="$emit('confirm')"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import Icon from "@/components/Icon.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
  }>(),
  { confirmText: "确认删除" },
);
defineEmits<{ confirm: []; cancel: [] }>();

const confirmBtn = ref<HTMLButtonElement>();
watch(
  () => props.open,
  async (v) => {
    if (v) {
      await nextTick();
      confirmBtn.value?.focus();
    }
  },
);
</script>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  z-index: 300;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 18vh;
}
.confirm-dialog {
  width: min(400px, calc(100vw - 32px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-float);
  padding: 18px 20px;
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 12px;
}
.confirm-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--red-soft);
  color: var(--red);
  display: flex;
  align-items: center;
  justify-content: center;
}
.confirm-text {
  min-width: 0;
}
.confirm-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-top: 7px;
}
.confirm-msg {
  font-size: 13px;
  color: var(--text2);
  margin-top: 6px;
  line-height: 1.6;
  word-break: break-all;
}
.confirm-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.18s ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
.confirm-fade-enter-active .confirm-dialog {
  transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.confirm-fade-enter-from .confirm-dialog {
  transform: translateY(8px) scale(0.98);
}
</style>
