<template>
  <!-- Detail drawer -->
  <Teleport to="body">
    <Transition name="drawer-backdrop">
      <div
        v-if="modelValue !== null"
        class="drawer-backdrop"
        @click.self="$emit('update:modelValue', null)"
      />
    </Transition>
    <Transition name="drawer-slide">
      <aside
        v-if="modelValue !== null"
        class="drawer"
      >
        <div class="drawer-head">
          <span class="drawer-title">{{ title }}</span>
          <button
            class="drawer-close"
            @click="$emit('update:modelValue', null)"
            title="关闭"
          >
            <Icon
              name="x"
              :size="14"
            />
          </button>
        </div>
        <div class="drawer-body">
          <slot />
        </div>
        <div
          class="drawer-foot"
          v-if="$slots.footer"
        >
          <slot name="footer" />
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";

defineProps<{ modelValue: unknown; title?: string }>();
defineEmits<{ "update:modelValue": [val: null] }>();
</script>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 200;
}
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  width: min(560px, 95vw);
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.1);
  z-index: 201;
  display: flex;
  flex-direction: column;
}
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.drawer-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.drawer-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text2);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}
.drawer-close:hover {
  background: var(--surface2);
  color: var(--text);
}
.drawer-body {
  flex: 1;
  overflow: auto;
  padding: 20px;
  min-height: 0;
}
.drawer-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--surface2);
}

/* Transitions */
.drawer-backdrop-enter-active,
.drawer-backdrop-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-backdrop-enter-from,
.drawer-backdrop-leave-to {
  opacity: 0;
}
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}
</style>
