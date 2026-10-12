<script setup lang="ts" generic="T extends string | number | boolean | null">
/** 后台标签页（界面改版 P12）：下划线式；放在卡片顶上时左右留 16px，单独用时写 bare */
defineProps<{ options: ReadonlyArray<readonly [T, string]>; testid?: string }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="dt-adm-tabs" role="tablist">
    <button
      v-for="[v, label] in options"
      :key="String(v)"
      type="button"
      role="tab"
      :class="{ 'is-on': model === v }"
      :aria-selected="model === v"
      :data-testid="testid ? `${testid}-${v}` : undefined"
      @click="model = v"
    >
      {{ label }}
    </button>
  </div>
</template>
