<script setup lang="ts">
import { computed } from 'vue';
import type { PlantDto, StealBlock } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import {
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
const t = useT();

const ripe = computed(() => props.plant.stage === 4);
const water = computed(() => waterBlock(props.plant, props.strength));
const reap = computed(() => {
  if (!props.friend) return reapBlock(props.plant, props.strength);
  if (props.stealBlock) return t.value.yard.plant.steal[props.stealBlock];
  return props.strength < 1 ? t.value.yard.noStrength : '';
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
    {{ t.yard.plant.harvest(plant.harvestNum, plant.harvestMax) }}
    <span v-if="plant.worm > 0" class="ms-1">🐛{{ plant.worm }}</span>
    <span v-if="plant.grass > 0" class="ms-1">🌿{{ plant.grass }}</span>
    <span v-if="plant.dry > 0" class="text-danger ms-1">{{ t.yard.plant.dry(plant.dry) }}</span>
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
      {{
        friend
          ? stealBlock === 'stolen'
            ? t.yard.plant.stolenBtn
            : t.yard.plant.stealBtn
          : t.yard.plant.reapBtn
      }}
    </button>
    <button
      v-if="!ripe || plant.dry > 0"
      class="btn btn-sm btn-primary"
      :disabled="busy || !!water"
      data-testid="plant-water"
      @click="fire('water')"
    >
      {{ plant.dry > 0 ? t.yard.plant.undry : t.yard.plant.water }}
    </button>
    <button
      v-if="plant.worm > 0"
      class="btn btn-sm btn-outline-primary"
      :disabled="busy || !!wormBlock(plant, strength)"
      data-testid="plant-deworm"
      @click="fire('deworm')"
    >
      {{ t.yard.plant.deworm }}
    </button>
    <button
      v-if="plant.grass > 0"
      class="btn btn-sm btn-outline-primary"
      :disabled="busy || !!grassBlock(plant, strength)"
      data-testid="plant-weed"
      @click="fire('weed')"
    >
      {{ t.yard.plant.weed }}
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
        {{ t.yard.plant.feed }}
      </button>
      <button
        class="btn btn-sm btn-outline-danger"
        :disabled="busy"
        data-testid="plant-remove"
        @click="fire('remove')"
      >
        {{ t.yard.plant.remove }}
      </button>
    </template>
  </div>
  <div v-if="main" class="text-danger" data-testid="plant-block">{{ main }}</div>
</template>
