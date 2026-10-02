<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { SeedsDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<SeedsDto | null>(null);
const busy = ref(false);
const shopSeed = ref<number>(0);
const shopNum = ref(1);
const exSeed = ref<number>(0);
const exTimes = ref(1);

async function load() {
  try {
    data.value = await endpoints.seeds();
    if (!shopSeed.value) shopSeed.value = data.value.shop.items[0]?.seedId ?? 0;
    if (!exSeed.value) exSeed.value = data.value.exchange[0]?.seedId ?? 0;
  } catch (e) {
    toast.push(errorMessage(e, t.value.yard.seed.loadFailed), 'danger');
  }
}
onMounted(load);

const item = computed(() => data.value?.shop.items.find((x) => x.seedId === shopSeed.value));
const shopMax = computed(() =>
  item.value && data.value ? Math.min(99, Math.floor(data.value.coin / item.value.price)) : 0,
);
const shopN = computed(() => Math.max(1, Math.min(shopNum.value || 1, shopMax.value)));
const shopBlock = computed(() =>
  item.value && shopMax.value < 1 ? t.value.yard.seed.noCoin(item.value.price) : '',
);

const ex = computed(() => data.value?.exchange.find((x) => x.seedId === exSeed.value));
const exMax = computed(() =>
  ex.value && data.value ? Math.min(99, Math.floor(data.value.essence / ex.value.essence)) : 0,
);
const exN = computed(() => Math.max(1, Math.min(exTimes.value || 1, exMax.value)));
const exBlock = computed(() =>
  ex.value && exMax.value < 1 ? t.value.yard.seed.noEssence(ex.value.essence, data.value?.essence ?? 0) : '',
);

async function run(fn: () => Promise<unknown>, ok: string, fail: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fail), 'danger');
  } finally {
    busy.value = false;
  }
}
const buy = () =>
  run(
    () => endpoints.seedBuy(shopSeed.value, shopN.value),
    t.value.yard.seed.bought(shopN.value),
    t.value.yard.seed.buyFailed,
  );
const exchange = () =>
  run(
    () => endpoints.seedExchange(exSeed.value, exN.value),
    t.value.yard.seed.exchanged,
    t.value.yard.seed.exFailed,
  );
</script>

<template>
  <div v-if="data" class="small">
    <h6>{{ t.yard.seed.mine }}</h6>
    <div data-testid="seed-stock" class="mb-2">
      <span v-if="data.stock.length === 0" class="text-muted">{{ t.yard.seed.none }}</span>
      <span v-for="s in data.stock" :key="s.seedId" class="badge text-bg-light border me-1">
        {{ catalog.seedName(s.seedId) }} × {{ s.num }}
      </span>
    </div>

    <h6>{{ t.yard.seed.shop }}</h6>
    <div v-if="!data.shop.open" class="text-muted mb-2" data-testid="shop-closed">
      {{ t.yard.seed.shopClosed }}
    </div>
    <template v-else>
      <div class="d-flex gap-1 align-items-center mb-1">
        <select v-model.number="shopSeed" class="form-select form-select-sm" data-testid="shop-seed">
          <option v-for="s in data.shop.items" :key="s.seedId" :value="s.seedId">
            {{ t.yard.seed.shopOption(catalog.seedName(s.seedId), s.price) }}
          </option>
        </select>
        <input
          v-model.number="shopNum"
          type="number"
          min="1"
          :max="Math.max(1, shopMax)"
          class="form-control form-control-sm"
          style="width: 70px"
          data-testid="shop-num"
        />
        <button
          class="btn btn-sm btn-primary text-nowrap"
          :disabled="busy || !!shopBlock"
          data-testid="shop-buy"
          @click="buy"
        >
          {{ t.yard.seed.buy(shopN) }}
        </button>
      </div>
      <div class="text-muted mb-1">{{ t.yard.seed.coin(data.coin) }}</div>
      <div v-if="shopBlock" class="text-danger mb-2" data-testid="shop-block">{{ shopBlock }}</div>
    </template>

    <h6>{{ t.yard.seed.exchange }}</h6>
    <div class="text-muted mb-1">{{ t.yard.seed.essence(data.essence) }}</div>
    <div class="d-flex gap-1 align-items-center mb-1">
      <select v-model.number="exSeed" class="form-select form-select-sm" data-testid="ex-seed">
        <option v-for="e in data.exchange" :key="e.seedId" :value="e.seedId">
          {{ t.yard.seed.exOption(catalog.seedName(e.seedId), e.seedNum, e.essence) }}
        </option>
      </select>
      <input
        v-model.number="exTimes"
        type="number"
        min="1"
        :max="Math.max(1, exMax)"
        class="form-control form-control-sm"
        style="width: 70px"
        data-testid="ex-times"
      />
      <button
        class="btn btn-sm btn-primary text-nowrap"
        :disabled="busy || !!exBlock"
        data-testid="ex-go"
        @click="exchange"
      >
        {{ t.yard.seed.exBtn(exN) }}
      </button>
    </div>
    <div v-if="exBlock" class="text-danger" data-testid="ex-block">{{ exBlock }}</div>
  </div>
</template>
