<script setup lang="ts">
/**
 * 一级标签栏（界面改版设计 §4.2 第 5~7 条）：下划线式、吸顶；选中下划线的位置由 utils/tabsScroll.ts 负责。
 * 键盘（backlog）：只有选中的标签在 Tab 键顺序里，左右方向键、Home、End 在标签之间移动并切换；
 * disabled 时别的标签点不了（一番赏抽签进行中），选中的那个不受影响。
 * 读屏（backlog）：每个标签有 id，选中的那个用 aria-controls 指向内容区；内容区由页面包一层 DtTabPanel，
 * 两边按同一个 idPrefix 拼 id（utils/tabsIds.ts）。没选中的标签不写 aria-controls，因为它们的内容区没渲染
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { DT_TABS_ID_PREFIX, dtPanelId, dtTabId, holdTabs, releaseTabs } from '../utils/tabsIds';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    tabs: Array<{ key: string; label: string; badge?: number | string | null; testid?: string }>;
    /** data-testid 前缀：默认 tab-，交易所沿用 ex-tab-、收购 acquire-tab- */
    testidPrefix?: string;
    disabled?: boolean;
    /** 标签和内容区 id 的前缀，要和页面里 DtTabPanel 的一致；一屏只有一个标签栏时用默认值 */
    idPrefix?: string;
  }>(),
  { testidPrefix: 'tab-', disabled: false, idPrefix: DT_TABS_ID_PREFIX },
);
const emit = defineEmits<{ 'update:modelValue': [key: string] }>();
const list = ref<HTMLElement | null>(null);

// 标签栏显示着才登记，DtTabPanel 据此决定要不要标 tabpanel
const held = computed(() => (props.tabs.length > 1 ? props.idPrefix : null));
watch(
  held,
  (now, before) => {
    if (before) releaseTabs(before);
    if (now) holdTabs(now);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (held.value) releaseTabs(held.value);
});

const off = (key: string) => props.disabled && key !== props.modelValue;

function pick(key: string) {
  if (!off(key) && key !== props.modelValue) emit('update:modelValue', key);
}

function onKey(e: KeyboardEvent) {
  const keys = props.tabs.filter((x) => !off(x.key)).map((x) => x.key);
  const i = keys.indexOf(props.modelValue);
  const to =
    e.key === 'ArrowRight'
      ? keys[(i + 1) % keys.length]
      : e.key === 'ArrowLeft'
        ? keys[(i - 1 + keys.length) % keys.length]
        : e.key === 'Home'
          ? keys[0]
          : e.key === 'End'
            ? keys[keys.length - 1]
            : undefined;
  if (to === undefined) return;
  e.preventDefault();
  pick(to);
  const idx = props.tabs.findIndex((x) => x.key === to);
  list.value?.querySelectorAll<HTMLElement>('[role="tab"]')[idx]?.focus();
}
</script>

<template>
  <div v-if="tabs.length > 1" :class="['dt-tabs-bar', { 'has-end': !!$slots.end }]">
    <ul ref="list" class="nav nav-tabs" role="tablist" @keydown="onKey">
      <li v-for="x in tabs" :key="x.key" class="nav-item" role="presentation">
        <button
          type="button"
          role="tab"
          :id="dtTabId(idPrefix, x.key)"
          :aria-controls="x.key === modelValue ? dtPanelId(idPrefix, x.key) : undefined"
          :class="['nav-link', { active: x.key === modelValue }]"
          :aria-selected="x.key === modelValue"
          :tabindex="x.key === modelValue ? 0 : -1"
          :disabled="off(x.key)"
          :data-testid="x.testid ?? `${testidPrefix}${x.key}`"
          @click="pick(x.key)"
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
