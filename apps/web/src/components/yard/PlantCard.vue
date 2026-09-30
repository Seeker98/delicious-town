<script setup lang="ts">
import { computed } from 'vue';
import type { PlantDto, StealBlock } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import {
  STEAL_TEXT,
  feedBlock,
  grassBlock,
  reapBlock,
  stageName,
  statusText,
  waterBlock,
  wormBlock,
  type PlantAction,
} from './plant';

const props = defineProps<{
  plant: PlantDto;
  strength: number;
  busy: boolean;
  /** 好友的作物：没有施肥、铲除；收获按钮是偷菜 */
  friend?: boolean;
  stealBlock?: StealBlock;
  fert?: { minutes: number; num: number } | null;
}>();
const emit = defineEmits<{ act: [action: PlantAction, plantId: number] }>();
const catalog = useCatalogStore();

const ripe = computed(() => props.plant.stage === 4);
const water = computed(() => waterBlock(props.plant, props.strength));
const reap = computed(() => {
  if (!props.friend) return reapBlock(props.plant, props.strength);
  if (props.stealBlock) return STEAL_TEXT[props.stealBlock];
  return props.strength < 1 ? '体力不够' : '';
});
const feed = computed(() =>
  feedBlock(props.plant, props.strength, props.fert?.minutes ?? 0, props.fert?.num ?? 0),
);
/** 主要动作（收获期是收获 / 偷菜，其他是浇水）灰掉的原因 */
const main = computed(() => (ripe.value ? reap.value : water.value));
const fire = (a: PlantAction) => emit('act', a, props.plant.id);
</script>

<template>
  <div class="fw-bold">{{ catalog.foodName(plant.foodsId) }} · {{ stageName(plant.stage) }}</div>
  <div>
    产量 {{ plant.harvestNum }}/{{ plant.harvestMax }}
    <span v-if="plant.worm > 0" class="ms-1">🐛{{ plant.worm }}</span>
    <span v-if="plant.grass > 0" class="ms-1">🌿{{ plant.grass }}</span>
    <span v-if="plant.dry > 0" class="text-danger ms-1">干涸 {{ plant.dry }}</span>
  </div>
  <div class="text-muted" data-testid="plant-status">{{ statusText(plant) }}</div>
  <div class="d-flex flex-wrap gap-1 mt-1">
    <button
      v-if="ripe"
      class="btn btn-sm btn-success"
      :disabled="busy || !!reap"
      data-testid="plant-reap"
      @click="fire('reap')"
    >
      {{ friend ? (stealBlock === 'stolen' ? '已偷' : '偷菜') : '收获' }}
    </button>
    <button
      v-if="!ripe || plant.dry > 0"
      class="btn btn-sm btn-primary"
      :disabled="busy || !!water"
      data-testid="plant-water"
      @click="fire('water')"
    >
      {{ plant.dry > 0 ? '解除干涸' : '浇水' }}
    </button>
    <button
      v-if="plant.worm > 0"
      class="btn btn-sm btn-outline-primary"
      :disabled="busy || !!wormBlock(plant, strength)"
      data-testid="plant-deworm"
      @click="fire('deworm')"
    >
      除虫
    </button>
    <button
      v-if="plant.grass > 0"
      class="btn btn-sm btn-outline-primary"
      :disabled="busy || !!grassBlock(plant, strength)"
      data-testid="plant-weed"
      @click="fire('weed')"
    >
      除草
    </button>
    <template v-if="!friend">
      <button
        v-if="plant.stage <= 3"
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy || !!feed"
        :title="feed"
        data-testid="plant-feed"
        @click="fire('feed')"
      >
        施肥
      </button>
      <button
        class="btn btn-sm btn-outline-danger"
        :disabled="busy"
        data-testid="plant-remove"
        @click="fire('remove')"
      >
        铲除
      </button>
    </template>
  </div>
  <div v-if="main" class="text-danger" data-testid="plant-block">{{ main }}</div>
</template>
