<template>
  <div
    class="dropzone"
    :class="{ 'drag-over': isDragging }"
    @dragover.prevent="isDragging = true"
    @dragleave="isDragging = false"
    @drop.prevent="onDrop"
    @click="triggerInput"
  >
    <input
      ref="inputRef"
      type="file"
      :accept="accept"
      @change="onChange"
    />
    <div class="dz-icon">
      <Icon
        :name="icon"
        :size="22"
      />
    </div>
    <div class="dz-title">{{ title }}</div>
    <div class="dz-sub">{{ sub }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Icon from "@/components/Icon.vue";

const props = defineProps<{
  accept: string;
  icon: string;
  title: string;
  sub: string;
}>();

const emit = defineEmits<{ file: [f: File] }>();

const inputRef = ref<HTMLInputElement>();
const isDragging = ref(false);

function triggerInput() {
  inputRef.value?.click();
}

function onChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) {
    emit("file", f);
    (e.target as HTMLInputElement).value = "";
  }
}

function onDrop(e: DragEvent) {
  isDragging.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) emit("file", f);
}
</script>

<style scoped>
.dropzone {
  border: 1.5px dashed var(--border-strong);
  border-radius: 12px;
  padding: 30px 20px;
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.18s,
    background 0.18s,
    transform 0.18s;
  background: var(--surface);
  user-select: none;
}
.dropzone:hover {
  border-color: var(--border-focus);
  background: var(--surface2);
}
.drag-over {
  border-color: var(--blue);
  background: var(--blue-soft);
}
input {
  display: none;
}
.dz-icon {
  width: 44px;
  height: 44px;
  margin: 0 auto 10px;
  border-radius: 11px;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text2);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    color 0.18s,
    border-color 0.18s,
    background 0.18s;
}
.dropzone:hover .dz-icon {
  color: var(--text);
  border-color: var(--border-strong);
}
.drag-over .dz-icon {
  color: var(--blue);
  border-color: var(--blue);
  background: #fff;
}
.dz-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text);
}
.dz-sub {
  font-size: 12px;
  color: var(--text3);
}
</style>
