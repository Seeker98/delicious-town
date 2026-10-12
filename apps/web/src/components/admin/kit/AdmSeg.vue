<script setup lang="ts" generic="T extends string | number | boolean | null">
/** 三段切换（界面改版 P12）：几个选项选一个，选中的白底浮起 */
defineProps<{ options: ReadonlyArray<readonly [T, string]>; testid?: string; disabled?: boolean }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="dt-adm-seg" role="group">
    <button
      v-for="[v, label] in options"
      :key="String(v)"
      type="button"
      :class="{ 'is-on': model === v }"
      :aria-pressed="model === v"
      :disabled="disabled"
      :data-testid="testid ? `${testid}-${v}` : undefined"
      @click="model = v"
    >
      {{ label }}
    </button>
  </div>
</template>
