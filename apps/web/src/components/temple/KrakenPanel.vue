<script setup lang="ts">
import type { TempleDto } from '@dt/shared';
defineProps<{ data: TempleDto }>();
defineEmits<{ reload: [] }>();
</script>

<template>
  <div class="small text-muted">稍后开放</div>
</template>
