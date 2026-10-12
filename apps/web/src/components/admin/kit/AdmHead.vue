<script setup lang="ts">
/**
 * 后台页头（界面改版 P12）：标题（后面可跟小标签）+ 一句灰字说明，右边放主按钮；
 * 详情页上面一行面包屑（插槽 crumb）
 */
defineProps<{ title?: string; desc?: string }>();
</script>

<template>
  <header>
    <div v-if="$slots.crumb" class="dt-adm-crumb"><slot name="crumb" /></div>
    <div class="dt-adm-ph">
      <div>
        <h1>
          <slot name="title">{{ title }}</slot>
        </h1>
        <div v-if="desc || $slots.desc" class="dt-adm-ph-desc">
          <slot name="desc">{{ desc }}</slot>
        </div>
      </div>
      <div v-if="$slots.default" class="dt-adm-ph-acts"><slot /></div>
    </div>
  </header>
</template>
