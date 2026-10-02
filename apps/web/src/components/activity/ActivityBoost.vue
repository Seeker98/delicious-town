<script setup lang="ts">
import { boostText, type ActivityDto, type BoostActivityDef } from '@dt/shared';

/** 全服加成卡片（148-4）：只显示加成项，没有领取 */
defineProps<{ a: ActivityDto & { kind: 'boost'; def: BoostActivityDef } }>();
</script>

<template>
  <div class="d-flex align-items-center gap-2" :data-testid="`boost-${a.id}`">
    <i class="bi bi-lightning-charge text-warning"></i>
    <span>{{ boostText(a.def.items) }}</span>
  </div>
</template>
