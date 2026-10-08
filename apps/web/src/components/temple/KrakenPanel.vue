<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { KrakenFeedDto, TempleDto, TentacleShopDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { GRADE_NAMES, ROAD_NAMES } from '../../utils/labels';

const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const num = ref(1);
const busy = ref(false);
const result = ref<KrakenFeedDto | null>(null);
const shop = ref<TentacleShopDto | null>(null);

onMounted(async () => {
  try {
    shop.value = await endpoints.tentacleShop();
  } catch (e) {
    toast.push(errorMessage(e, t.value.temple.kraken.shopFailed), 'danger');
  }
});

const k = computed(() => props.data.kraken);
const target = computed(() => catalog.mc(k.value.targetMcId));
const max = computed(() => Math.max(0, (k.value.current?.leftNum ?? 0) - 1));
const n = computed(() => Math.max(1, Math.min(num.value || 1, max.value)));
const hoursText = computed(() =>
  k.value.hours.map(([a, b]) => t.value.temple.kraken.hours(a, b)).join(t.value.events.sep),
);
const block = computed(() => {
  const x = t.value.temple.kraken;
  if (props.data.star < 1) return t.value.temple.needStar(x.what);
  if (!k.value.feedable) return x.notTime(hoursText.value);
  if (k.value.fed) return x.fed;
  if (!k.value.current) return x.noDish;
  if (max.value < 1) return x.notEnough;
  return '';
});
const punishText = (p: NonNullable<KrakenFeedDto['punish']>) =>
  p.kind === 'forget'
    ? t.value.temple.kraken.forget
    : t.value.temple.kraken.punish(p.kind === 'exp', p.value);

async function feed() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    result.value = await endpoints.krakenFeed(n.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.temple.kraken.failed), 'danger');
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
      {{ t.temple.kraken.wants }}<b>{{ target?.name ?? catalog.mcName(k.targetMcId) }}</b>
      <span class="text-muted">{{
        t.temple.kraken.wantsMeta(ROAD_NAMES[target?.road ?? 0] ?? '', hoursText)
      }}</span>
    </div>
    <div v-if="k.current" class="mb-1">
      {{
        t.temple.kraken.current(
          catalog.mcName(k.current.mcId),
          GRADE_NAMES[k.current.grade] ?? '',
          k.current.leftNum,
        )
      }}
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
        {{ t.temple.kraken.feed(n) }}
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="result" class="mb-2" data-testid="kraken-result">
      {{ t.temple.kraken.favor(result.favor)
      }}{{
        t.temple.kraken.relation[
          result.relation === 'same' ? 'same' : result.relation === 'road' ? 'road' : 'other'
        ]
      }}{{
        t.temple.kraken.seeds(
          result.seeds.map((s) => t.common.qty(catalog.seedName(s.seedId), s.num)).join(t.events.sep),
        )
      }}
      <span v-if="result.krabCoin > 0">{{ t.temple.kraken.krabCoin(result.krabCoin) }}</span>
      <span v-if="result.tentacle">{{ t.temple.kraken.tentacle }}</span>
      <span v-if="result.punish" class="text-danger">{{ t.common.semi }}{{ punishText(result.punish) }}</span>
    </div>

    <h6 class="mt-3">{{ t.temple.kraken.shop }}</h6>
    <template v-if="shop">
      <div class="text-muted mb-1">{{ t.temple.kraken.shopRule(shop.tentacles) }}</div>
      <div v-for="(s, i) in shop.slots" :key="i" class="d-flex align-items-center border-bottom py-1">
        <span class="flex-fill">{{
          t.temple.kraken.mcOption(catalog.mcName(s.mcId), catalog.mc(s.mcId)?.level ?? '?')
        }}</span>
        <button
          class="btn btn-sm btn-outline-primary"
          :data-testid="`tentacle-${i}`"
          :disabled="busy || s.bought || shop.tentacles < (catalog.mc(s.mcId)?.level ?? 99)"
          @click="shopAct(() => endpoints.tentacleExchange(i), t.temple.kraken.exFailed)"
        >
          {{ s.bought ? t.temple.kraken.bought : t.temple.kraken.exchange(catalog.mc(s.mcId)?.level ?? '?') }}
        </button>
      </div>
      <button
        type="button"
        class="dt-link-btn"
        data-testid="tentacle-refresh"
        :disabled="busy || shop.tentacles < shop.refreshCost"
        @click="shopAct(() => endpoints.tentacleRefresh(), t.temple.kraken.refreshFailed)"
      >
        {{ shop.refreshCost === 0 ? t.temple.kraken.freeRefresh : t.temple.kraken.refresh }}
      </button>
    </template>

    <h6 class="mt-3">{{ t.temple.kraken.seedStock }}</h6>
    <div data-testid="seeds">
      <span v-if="data.seeds.length === 0" class="text-muted">{{ t.temple.kraken.noSeeds }}</span>
      <span v-for="s in data.seeds" :key="s.seedId" class="me-2">{{
        t.common.qty(catalog.seedName(s.seedId), s.num)
      }}</span>
    </div>
    <div class="text-muted">{{ t.temple.kraken.plantLater }}</div>
  </div>
</template>
