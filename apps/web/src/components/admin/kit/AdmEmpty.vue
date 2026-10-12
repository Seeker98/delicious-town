<script setup lang="ts">
/** 后台空状态（界面改版 P12）：一句粗体说空了，下面灰字写为什么空 */
defineProps<{ title: string; text?: string }>();
</script>

<template>
  <div class="dt-adm-empty">
    <b>{{ title }}</b
    ><slot>{{ text }}</slot>
  </div>
</template>
