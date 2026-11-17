<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          :class="['toast', `toast-${t.type}`]"
        >
          <span class="toast-icon">
            <Icon
              :name="ICONS[t.type]"
              :size="15"
            />
          </span>
          <span>{{ t.msg }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import type { ToastItem } from "@/lib/types";

defineProps<{ toasts: ToastItem[] }>();

const ICONS = {
  ok: "check-circle",
  err: "x-circle",
  info: "info",
  warn: "alert-triangle",
};
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 16px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 500;
  min-width: 200px;
  max-width: 360px;
  pointer-events: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  box-shadow: var(--shadow-lg);
}
.toast-ok .toast-icon {
  color: var(--green);
}
.toast-err .toast-icon {
  color: var(--red);
}
.toast-info .toast-icon {
  color: var(--blue);
}
.toast-warn .toast-icon {
  color: var(--amber);
}
.toast-icon {
  display: inline-flex;
  flex-shrink: 0;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
</style>
