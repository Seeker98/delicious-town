<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MissileResultDto, TempleDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
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
  if (props.data.star < 1) return '1 星以后才能挑战守护兽';
  if (g.value.killed) return '今天已经击败守护兽了，明天再来';
  if (max.value < 1) return '没有这种飞弹（商店、黑市有售，守护兽暴击也可能掉）';
  return '';
});

async function fire() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    result.value = await endpoints.templeMissile(goodsId.value, n.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '发射失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div data-testid="hp">
      守护兽 HP {{ formatNum(g.hpLeft) }} / {{ formatNum(g.hpMax) }}{{ g.killed ? '（已击败）' : '' }}
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
        发射 ×{{ n }}
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <template v-if="result">
      <ol class="mb-1" data-testid="shots">
        <li v-for="(s, i) in result.shots" :key="i">
          {{
            !s.hit
              ? '没打中'
              : `伤害 ${formatNum(s.damage)}${s.crit ? '（暴击）' : ''}${s.killed ? '，击败了守护兽！' : ''}`
          }}
        </li>
      </ol>
      <div class="text-muted" data-testid="drops">
        掉落：神秘礼券 {{ result.drops.tickets }}、探险图 {{ result.drops.maps }}、厨神玉玺
        {{ result.drops.seals }}、美味券 {{ result.drops.dtTickets }}
        <span v-if="result.drops.foods.length > 0">
          ；食材
          {{ result.drops.foods.map((f) => `${catalog.foodName(f.foodsId)}×${f.num}`).join('、') }}
        </span>
      </div>
    </template>
  </div>
</template>
