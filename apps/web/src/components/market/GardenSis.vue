<script setup lang="ts">
import { ref, watch } from 'vue';
import type { MarketDto } from '@dt/shared';
import { gardenLines, pickLine } from '../../utils/gardenSis';
import GameImg from '../GameImg.vue';

/** 菜场吉祥物菜园姐（问题记录 176）：只说话，不发奖励；点一下换一句 */
const props = defineProps<{ data: MarketDto | null }>();
const line = ref('');
const next = () => {
  line.value = pickLine(gardenLines(props.data), line.value || null);
};
next();
// 菜场数据第一次到手时，换成可能看状态说的话
watch(
  () => props.data !== null,
  (has, had) => {
    if (has && !had) next();
  },
);
</script>

<template>
  <div
    class="d-flex align-items-center gap-2 border rounded p-2 mb-2 small"
    role="button"
    data-testid="garden-sis"
    @click="next"
  >
    <GameImg path="npc/菜园姐" alt="菜园姐" fallback-icon="bi-flower2" class="flex-shrink-0" />
    <div>
      <b>菜园姐：</b><span data-testid="garden-sis-line">{{ line }}</span>
    </div>
  </div>
</template>
