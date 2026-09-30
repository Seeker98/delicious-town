<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { KrakenFeedDto, TempleDto, TentacleShopDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { GRADE_NAMES, ROAD_NAMES } from '../../utils/labels';

const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const num = ref(1);
const busy = ref(false);
const result = ref<KrakenFeedDto | null>(null);
const shop = ref<TentacleShopDto | null>(null);

onMounted(async () => {
  try {
    shop.value = await endpoints.tentacleShop();
  } catch (e) {
    toast.push(errorMessage(e, '读取触手商店失败'), 'danger');
  }
});

const k = computed(() => props.data.kraken);
const target = computed(() => catalog.mc(k.value.targetMcId));
const max = computed(() => Math.max(0, (k.value.current?.leftNum ?? 0) - 1));
const n = computed(() => Math.max(1, Math.min(num.value || 1, max.value)));
const hoursText = computed(() => k.value.hours.map(([a, b]) => `${a}~${b} 点`).join('、'));
const block = computed(() => {
  if (props.data.star < 1) return '1 星以后才能投喂';
  if (!k.value.feedable) return `现在不是投喂时间（${hoursText.value}）`;
  if (k.value.fed) return '今天已经投喂过了';
  if (!k.value.current) return '先在特色菜页烹制一道特色菜';
  if (max.value < 1) return '在售份数不够（投喂后至少要留 1 份）';
  return '';
});
const punishText = (p: NonNullable<KrakenFeedDto['punish']>) =>
  p.kind === 'forget' ? '遗忘了这道特色菜' : `试炼${p.kind === 'exp' ? '经验' : '价值'} −${p.value}%`;

async function feed() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    result.value = await endpoints.krakenFeed(n.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '投喂失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
async function shopAct(fn: () => Promise<TentacleShopDto>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    shop.value = await fn();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="mb-1">
      克拉肯今天想吃：<b>{{ target?.name ?? catalog.mcName(k.targetMcId) }}</b>
      <span class="text-muted">（{{ ROAD_NAMES[target?.road ?? 0] }}；投喂时间 {{ hoursText }}）</span>
    </div>
    <div v-if="k.current" class="mb-1">
      在售：{{ catalog.mcName(k.current.mcId) }} {{ GRADE_NAMES[k.current.grade] }}，剩
      {{ k.current.leftNum }} 份
    </div>
    <div class="d-flex gap-1 align-items-center mb-1">
      <input
        v-model.number="num"
        type="number"
        min="1"
        :max="Math.max(1, max)"
        class="form-control form-control-sm"
        style="width: 80px"
        data-testid="kraken-num"
      />
      <button
        class="btn btn-sm btn-primary text-nowrap"
        data-testid="kraken-feed"
        :disabled="busy || !!block"
        @click="feed"
      >
        投喂 {{ n }} 份
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="result" class="mb-2" data-testid="kraken-result">
      好感度 {{ result.favor }} （{{
        result.relation === 'same' ? '正是它想吃的' : result.relation === 'road' ? '同一道' : '不太合口味'
      }}） ；种子 {{ result.seeds.map((s) => `${catalog.seedName(s.seedId)}×${s.num}`).join('、') }}
      <span v-if="result.krabCoin > 0">；蟹币 {{ result.krabCoin }}</span>
      <span v-if="result.tentacle">；触手 1</span>
      <span v-if="result.punish" class="text-danger">；{{ punishText(result.punish) }}</span>
    </div>

    <h6 class="mt-3">触手商店</h6>
    <template v-if="shop">
      <div class="text-muted mb-1">持有触手 {{ shop.tentacles }}；用"特色菜等级"条触手换一张残卷</div>
      <div v-for="(s, i) in shop.slots" :key="i" class="d-flex align-items-center border-bottom py-1">
        <span class="flex-fill">{{ catalog.mcName(s.mcId) }}（{{ catalog.mc(s.mcId)?.level }} 级）</span>
        <button
          class="btn btn-sm btn-outline-success"
          :data-testid="`tentacle-${i}`"
          :disabled="busy || s.bought || shop.tentacles < (catalog.mc(s.mcId)?.level ?? 99)"
          @click="shopAct(() => endpoints.tentacleExchange(i), '兑换失败')"
        >
          {{ s.bought ? '已兑换' : `换（${catalog.mc(s.mcId)?.level ?? '?'} 条触手）` }}
        </button>
      </div>
      <button
        class="btn btn-sm btn-link"
        data-testid="tentacle-refresh"
        :disabled="busy || shop.tentacles < shop.refreshCost"
        @click="shopAct(() => endpoints.tentacleRefresh(), '刷新失败')"
      >
        {{ shop.refreshCost === 0 ? '免费刷新' : '刷新（1 条触手）' }}
      </button>
    </template>

    <h6 class="mt-3">种子库存</h6>
    <div data-testid="seeds">
      <span v-if="data.seeds.length === 0" class="text-muted">还没有种子（投喂克拉肯可以得到）</span>
      <span v-for="s in data.seeds" :key="s.seedId" class="me-2"
        >{{ catalog.seedName(s.seedId) }}×{{ s.num }}</span
      >
    </div>
    <div class="text-muted">菜园开放后可以种</div>
  </div>
</template>
