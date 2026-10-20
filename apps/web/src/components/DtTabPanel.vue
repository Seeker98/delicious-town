<script setup lang="ts">
/**
 * 标签内容区（backlog：读屏的 tab ↔ tabpanel 对应）：页面把 DtTabs 下面的内容包一层，传当前选中的标签。
 * 外层是一个普通的 div，不带样式，里面的东西照原来排；标签栏没显示（只有一个标签）时只留这个 div、不标 tabpanel
 */
import { computed } from 'vue';
import { DT_TABS_ID_PREFIX, dtPanelId, dtTabId, tabsShown } from '../utils/tabsIds';

const props = withDefaults(
  defineProps<{
    /** 当前选中的标签（和 DtTabs 的 v-model 同一个值） */
    tab: string;
    /** 和 DtTabs 的 idPrefix 一致 */
    idPrefix?: string;
  }>(),
  { idPrefix: DT_TABS_ID_PREFIX },
);

const on = computed(() => tabsShown(props.idPrefix));
</script>

<!-- 只换属性、不换元素：标签栏出现或消失时里面的组件不重新挂载 -->
<template>
  <div
    :id="on ? dtPanelId(idPrefix, tab) : undefined"
    :role="on ? 'tabpanel' : undefined"
    :aria-labelledby="on ? dtTabId(idPrefix, tab) : undefined"
    :tabindex="on ? 0 : undefined"
  >
    <slot />
  </div>
</template>
