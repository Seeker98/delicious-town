<script setup lang="ts">
/**
 * 后台卡片（界面改版 P12）：白底细边 12px 圆角。有标题时头一行写标题 + 灰字说明，右边放东西（插槽 right）；
 * 正文默认带内边距，放表格时写 flush
 */
defineProps<{ title?: string; sub?: string; flush?: boolean }>();
</script>

<template>
  <section class="dt-adm-box">
    <div v-if="title || $slots.head" class="dt-adm-bh">
      <slot name="head"
        ><b>{{ title }}</b
        ><span v-if="sub">{{ sub }}</span></slot
      >
      <div v-if="$slots.right" class="dt-adm-bh-r"><slot name="right" /></div>
    </div>
    <slot v-if="flush" />
    <div v-else class="dt-adm-bb"><slot /></div>
  </section>
</template>
