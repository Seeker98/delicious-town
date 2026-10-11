<script setup lang="ts">
/** 一级标签栏（界面改版设计 §4.2 第 5~7 条）：下划线式、吸顶；选中下划线的位置由 utils/tabsScroll.ts 负责 */
withDefaults(
  defineProps<{
    modelValue: string;
    tabs: Array<{ key: string; label: string; badge?: number | string | null; testid?: string }>;
    /** data-testid 前缀：默认 tab-，交易所沿用 ex-tab-、收购 acquire-tab- */
    testidPrefix?: string;
  }>(),
  { testidPrefix: 'tab-' },
);
defineEmits<{ 'update:modelValue': [key: string] }>();
</script>

<template>
  <div v-if="tabs.length > 1" :class="['dt-tabs-bar', { 'has-end': !!$slots.end }]">
    <ul class="nav nav-tabs" role="tablist">
      <li v-for="x in tabs" :key="x.key" class="nav-item" role="presentation">
        <button
          type="button"
          role="tab"
          :class="['nav-link', { active: x.key === modelValue }]"
          :aria-selected="x.key === modelValue"
          :data-testid="x.testid ?? `${testidPrefix}${x.key}`"
          @click="$emit('update:modelValue', x.key)"
        >
          {{ x.label }}<span v-if="x.badge" class="badge rounded-pill bg-danger ms-1">{{ x.badge }}</span
          ><slot name="extra" :tab="x.key" />
        </button>
      </li>
    </ul>
    <!-- 标签栏右边的一个链接（界面改版 P10：广场的“论坛 ›”） -->
    <span v-if="$slots.end" class="dt-tabs-end"><slot name="end" /></span>
  </div>
</template>
