<script setup lang="ts">
import { formatNum } from '../../utils/format';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { YardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import PlantCard from './PlantCard.vue';
import type { PlantAction } from './plant';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<YardDto | null>(null);
const busy = ref(false);
const picks = ref<Record<number, number>>({});
const fertId = ref<number>(0);

async function load() {
  try {
    data.value = await endpoints.yard();
    // 空地的下拉框默认选第一颗种子；选的种子用完后回到还有的种子
    const stock = new Set(data.value.seeds.map((s) => s.seedId));
    const first = data.value.seeds[0]?.seedId ?? 0;
    for (const l of data.value.lands)
      if (!l.plant && !stock.has(picks.value[l.no] ?? -1)) picks.value[l.no] = first;
    if (!fertId.value)
      fertId.value =
        data.value.fertilizers.find((f) => f.num > 0)?.goodsId ?? data.value.fertilizers[0]?.goodsId ?? 0;
  } catch (e) {
    toast.push(errorMessage(e, t.value.yard.land.loadFailed), 'danger');
  }
}
/** 倒计时、虫草干涸会随时间变化：获得焦点时和每分钟重新读取 */
let timer: ReturnType<typeof setInterval> | undefined;
const onFocus = () => void load();
onMounted(() => {
  void load();
  window.addEventListener('focus', onFocus);
  timer = setInterval(() => void load(), 60_000);
});
onBeforeUnmount(() => {
  window.removeEventListener('focus', onFocus);
  if (timer) clearInterval(timer);
});

const cells = computed(() => {
  const d = data.value;
  if (!d) return [];
  return Array.from({ length: d.maxLands }, (_, i) => ({
    no: i + 1,
    land: d.lands.find((l) => l.no === i + 1) ?? null,
  }));
});
const nextNo = computed(() => (data.value?.lands.length ?? 0) + 1);
const expandBlock = computed(() => {
  const d = data.value;
  if (!d || d.nextLandCoin === null) return '';
  return d.coin < d.nextLandCoin ? t.value.yard.land.noCoin(d.nextLandCoin, d.coin) : '';
});
const fert = computed(() => data.value?.fertilizers.find((f) => f.goodsId === fertId.value) ?? null);
const sowBlock = computed(() => {
  if (!data.value) return '';
  if (data.value.seeds.length === 0) return t.value.yard.land.noSeeds;
  if (data.value.strength < 1) return t.value.yard.noStrength;
  return '';
});
const seedOf = (no: number) => picks.value[no] ?? data.value?.seeds[0]?.seedId ?? 0;

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

function onAct(a: PlantAction, plantId: number) {
  const l = t.value.yard.land;
  if (a === 'water') void run(() => endpoints.yardWater(plantId), l.watered, l.waterFailed);
  else if (a === 'deworm') void run(() => endpoints.yardDeworm(plantId), l.dewormed, l.dewormFailed);
  else if (a === 'weed') void run(() => endpoints.yardWeed(plantId), l.weeded, l.weedFailed);
  else if (a === 'feed') void run(() => endpoints.yardFeed(plantId, fertId.value), l.fed, l.feedFailed);
  else if (a === 'reap') void run(() => endpoints.yardReap(plantId), l.reaped, l.reapFailed);
  else if (window.confirm(l.removeConfirm))
    void run(() => endpoints.yardRemove(plantId), l.removed, l.removeFailed);
}
</script>

<template>
  <div v-if="data" class="small">
    <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
      <span>{{ t.yard.land.strength(formatNum(data.strength)) }}</span>
      <span>{{ t.yard.land.coin(data.coin) }}</span>
      <span class="ms-auto">{{ t.yard.land.fertilizer }}</span>
      <select v-model.number="fertId" class="form-select form-select-sm w-auto" data-testid="fert">
        <option v-for="f in data.fertilizers" :key="f.goodsId" :value="f.goodsId">
          {{ t.yard.land.fertOption(catalog.goodsName(f.goodsId), f.num, f.minutes) }}
        </option>
      </select>
    </div>
    <div class="row g-1">
      <div v-for="c in cells" :key="c.no" class="col-4">
        <div class="border rounded p-1 h-100" :data-testid="`land-${c.no}`">
          <template v-if="c.land">
            <div class="text-muted">
              {{ t.yard.land.landHead(c.no, c.land.level)
              }}<template v-if="c.land.bonus > 0">{{ t.yard.land.bonus(c.land.bonus) }}</template>
            </div>
            <div v-if="c.land.expNext !== null" class="text-muted">
              {{ t.yard.land.exp(c.land.exp, c.land.expNext) }}
            </div>
            <PlantCard
              v-if="c.land.plant"
              :plant="c.land.plant"
              :strength="data.strength"
              :busy="busy"
              :fert="fert"
              @act="onAct"
            />
            <template v-else>
              <select
                v-model.number="picks[c.no]"
                class="form-select form-select-sm my-1"
                :data-testid="`sow-seed-${c.no}`"
              >
                <option v-for="s in data.seeds" :key="s.seedId" :value="s.seedId">
                  {{ catalog.seedName(s.seedId) }} × {{ s.num }}
                </option>
              </select>
              <button
                class="btn btn-sm btn-primary"
                :disabled="busy || !!sowBlock"
                :data-testid="`sow-${c.no}`"
                @click="
                  run(() => endpoints.yardPlant(c.no, seedOf(c.no)), t.yard.land.sowed, t.yard.land.sowFailed)
                "
              >
                {{ t.yard.land.sow }}
              </button>
              <div v-if="sowBlock" class="text-danger">{{ sowBlock }}</div>
            </template>
          </template>
          <template v-else-if="c.no === nextNo">
            <button
              class="btn btn-sm btn-outline-primary"
              :disabled="busy || !!expandBlock"
              data-testid="expand"
              @click="run(() => endpoints.yardExpand(), t.yard.land.expanded, t.yard.land.expandFailed)"
            >
              {{ t.yard.land.expand(data.nextLandCoin) }}
            </button>
            <div v-if="expandBlock" class="text-danger" data-testid="expand-block">{{ expandBlock }}</div>
          </template>
          <div v-else class="text-muted">{{ t.yard.land.locked }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
