<script setup lang="ts">
import type { ActivityDto, BoostActivityDef } from '@dt/shared';
import { useT } from '../../composables/useT';

/** 全服加成卡片（148-4）：只显示加成项，没有领取；加成名按语言（问题记录 272） */
defineProps<{ a: ActivityDto & { kind: 'boost'; def: BoostActivityDef } }>();
const t = useT();
</script>

<template>
  <div class="d-flex align-items-center gap-2" :data-testid="`boost-${a.id}`">
    <i class="bi bi-lightning-charge text-warning"></i>
    <span>{{
      a.def.items.map((i) => `${t.activity.boosts[i.key] ?? i.key} ×${i.factor}`).join(t.events.sep)
    }}</span>
  </div>
</template>
