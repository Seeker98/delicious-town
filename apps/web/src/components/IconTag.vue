<script setup lang="ts">
/** 称号徽章（问题记录 539）：首页、访问好友页统一用访问页的黄底样式 */
defineProps<{ title: string }>();
</script>

<template>
  <span class="badge bg-warning text-dark me-1" data-testid="icon-tag">{{ title }}</span>
</template>
