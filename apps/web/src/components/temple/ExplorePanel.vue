<script setup lang="ts">
import { clampQty, formatNum } from '../../utils/format';
import { computed, ref } from 'vue';
import type { BarAwardDto, ExploreResultDto, TempleDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import DtArt from '../DtArt.vue';
import DtRow from '../DtRow.vue';
import QtySheet from '../QtySheet.vue';
import AwardChip from '../bar/AwardChip.vue';

/**
 * 探险（界面改版 P9）：上面体力；探险图一行一种（持有、每次体力），点“探险”弹出数量面板；
 * 刚才探险的成功次数、带回的食材在下面
 */
const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const goodsId = ref<number>(props.data.maps[0]?.goodsId ?? 0);
const times = ref(1);
const busy = ref(false);
const open = ref(false);
const result = ref<ExploreResultDto | null>(null);

const map = computed(() => props.data.maps.find((m) => m.goodsId === goodsId.value));
const byStrength = computed(() => (map.value ? Math.floor(props.data.strength / map.value.needStrength) : 0));
const max = computed(() => Math.min(map.value?.num ?? 0, byStrength.value, 99));
const n = computed(() => clampQty(times.value, max.value));
const block = computed(() => {
  const x = t.value.temple.explore;
  if ((map.value?.num ?? 0) < 1) return x.noMap;
  if (byStrength.value < 1) return x.noStrength(map.value!.needStrength, props.data.strength);
  return '';
});
/** 带回的食材按奖励小块画：神秘食材在前 */
const got = computed<BarAwardDto[]>(() =>
  [...(result.value?.rare ?? []), ...(result.value?.foods ?? [])].map((f) => ({
    kind: 'foods',
    id: f.foodsId,
    num: f.num,
    lucky: false,
  })),
);

function openMap(id: number) {
  goodsId.value = id;
  times.value = 1;
  open.value = true;
}
async function go() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    result.value = await endpoints.templeExplore(goodsId.value, n.value);
    open.value = false;
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.temple.explore.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="dt-card dt-bar-info">
    <span class="dt-bar-info-art is-warn"><DtArt name="res-strength" :size="28" /></span>
    <span class="dt-bar-info-main">
      <b data-testid="strength">{{ t.temple.explore.strength(formatNum(data.strength)) }}</b>
      <span>{{ t.temple.explore.intro }}</span>
    </span>
  </section>
  <div class="dt-block-head">
    <h2 class="dt-block-title">{{ t.temple.explore.mapsTitle }}</h2>
  </div>
  <div class="dt-card dt-rows-card">
    <DtRow v-for="m in data.maps" strong :key="m.goodsId" :data-testid="`map-${m.goodsId}`">
      <template #icon><DtArt :name="catalog.goodsArt(m.goodsId)" :size="28" /></template>
      <template #title>{{ catalog.goodsName(m.goodsId) }}</template>
      <template #sub>{{ t.temple.explore.mapLine(m.num, m.needStrength) }}</template>
      <template #end>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          :data-testid="`explore-open-${m.goodsId}`"
          @click="openMap(m.goodsId)"
        >
          {{ t.temple.explore.go }}
        </button>
      </template>
    </DtRow>
  </div>

  <template v-if="result">
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.temple.explore.lastTitle(result.success + result.fail) }}</h2>
    </div>
    <section :class="['dt-bar-result', result.success > 0 ? 'is-ok' : 'is-bad']" data-testid="explore-result">
      <b>{{ t.temple.explore.result(result.success, result.fail) }}</b>
      <div v-if="got.length > 0" class="dt-award-chips">
        <AwardChip v-for="(a, i) in got" :key="i" :award="a" />
      </div>
    </section>
  </template>

  <QtySheet
    v-model="times"
    :open="open"
    :title="catalog.goodsName(goodsId)"
    :art="catalog.goodsArt(goodsId)"
    :lines="[
      t.temple.explore.mapLine(map?.num ?? 0, map?.needStrength ?? 0),
      t.temple.explore.strength(formatNum(data.strength)),
    ]"
    :label="t.temple.explore.howMany"
    :max="max"
    :ok-text="t.temple.explore.btn(n)"
    :busy="busy"
    :reason="block"
    :sum="[
      [t.temple.explore.cost, t.temple.explore.strengthN(n * (map?.needStrength ?? 0)), true],
      [
        t.temple.explore.after,
        t.temple.explore.strengthN(Math.max(0, data.strength - n * (map?.needStrength ?? 0))),
      ],
    ]"
    testid="times"
    @close="open = false"
    @ok="go"
  />
</template>
