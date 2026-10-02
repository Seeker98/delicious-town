<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MissileResultDto, TempleDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const goodsId = ref<number>(
  props.data.missiles.find((m) => m.num > 0)?.goodsId ?? props.data.missiles[0]?.goodsId ?? 0,
);
const num = ref(1);
const busy = ref(false);
const result = ref<MissileResultDto | null>(null);

const held = computed(() => props.data.missiles.find((m) => m.goodsId === goodsId.value)?.num ?? 0);
const max = computed(() => Math.min(held.value, 99));
const n = computed(() => Math.max(1, Math.min(num.value || 1, max.value)));
const g = computed(() => props.data.guardian);
const block = computed(() => {
  const x = t.value.temple.guardian;
  if (props.data.star < 1) return t.value.temple.needStar(x.what);
  if (g.value.killed) return x.killed;
  if (max.value < 1) return x.noMissile;
  return '';
});

async function fire() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    result.value = await endpoints.templeMissile(goodsId.value, n.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.temple.guardian.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div data-testid="hp">
      {{ t.temple.guardian.hp(formatNum(g.hpLeft), formatNum(g.hpMax), g.killed) }}
    </div>
    <div class="progress mb-2" style="height: 8px">
      <div
        class="progress-bar bg-danger"
        :style="{ width: `${(g.hpLeft / Math.max(1, g.hpMax)) * 100}%` }"
      ></div>
    </div>
    <div class="d-flex gap-1 align-items-center mb-1">
      <select v-model.number="goodsId" class="form-select form-select-sm" data-testid="missile">
        <option v-for="m in data.missiles" :key="m.goodsId" :value="m.goodsId">
          {{ catalog.goodsName(m.goodsId) }}（{{ m.num }}）
        </option>
      </select>
      <input
        v-model.number="num"
        type="number"
        min="1"
        :max="Math.max(1, max)"
        class="form-control form-control-sm"
        style="width: 70px"
        data-testid="num"
      />
      <button
        class="btn btn-sm btn-danger text-nowrap"
        data-testid="fire"
        :disabled="busy || !!block"
        @click="fire"
      >
        {{ t.temple.guardian.fire(n) }}
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <template v-if="result">
      <ol class="mb-1" data-testid="shots">
        <li v-for="(s, i) in result.shots" :key="i">
          {{
            !s.hit ? t.temple.guardian.miss : t.temple.guardian.hit(formatNum(s.damage), !!s.crit, !!s.killed)
          }}
        </li>
      </ol>
      <div class="text-muted" data-testid="drops">
        {{
          t.temple.guardian.drops(
            result.drops.tickets,
            result.drops.maps,
            result.drops.seals,
            result.drops.dtTickets,
          )
        }}
        <span v-if="result.drops.foods.length > 0">
          {{
            t.temple.guardian.dropFoods(
              result.drops.foods.map((f) => `${catalog.foodName(f.foodsId)}×${f.num}`).join(t.events.sep),
            )
          }}
        </span>
      </div>
    </template>
  </div>
</template>
