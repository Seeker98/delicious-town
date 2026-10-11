<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MissileResultDto, TempleDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import type { ArtName } from '../../art/generated/names';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import DtArt from '../DtArt.vue';
import DtRow from '../DtRow.vue';
import FoodArt from '../FoodArt.vue';
import QtySheet from '../QtySheet.vue';

/**
 * 守护兽（界面改版 P9）：上面守护兽的大头像和血条；飞弹一行一种，点“发射”弹出数量面板；
 * 刚才发射的每一发伤害和掉落列在下面
 */
const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const goodsId = ref<number>(props.data.missiles[0]?.goodsId ?? 0);
const num = ref(1);
const busy = ref(false);
const open = ref(false);
const result = ref<MissileResultDto | null>(null);

const held = computed(() => props.data.missiles.find((m) => m.goodsId === goodsId.value)?.num ?? 0);
const max = computed(() => Math.min(held.value, 99));
const n = computed(() => Math.max(1, Math.min(num.value || 1, max.value)));
const g = computed(() => props.data.guardian);
const hpPct = computed(() => `${(g.value.hpLeft / Math.max(1, g.value.hpMax)) * 100}%`);
const block = computed(() => {
  const x = t.value.temple.guardian;
  if (props.data.star < 1) return t.value.temple.needStar(x.what);
  if (g.value.killed) return x.killed;
  if (max.value < 1) return x.noMissile;
  return '';
});
/** 掉落的道具：数量大于 0 的才列 */
const dropItems = computed(() => {
  const d = result.value?.drops;
  if (!d) return [];
  const x = t.value.temple.guardian.dropNames;
  const items: Array<[ArtName, string, number]> = [
    ['res-voucher', x.tickets, d.tickets],
    ['goods-map', x.maps, d.maps],
    ['goods-jade-seal', x.seals, d.seals],
    ['goods-token', x.dt, d.dtTickets],
  ];
  return items.filter(([, , v]) => v > 0);
});

function openMissile(id: number) {
  goodsId.value = id;
  num.value = 1;
  open.value = true;
}
async function fire() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    result.value = await endpoints.templeMissile(goodsId.value, n.value);
    open.value = false;
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.temple.guardian.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="dt-card dt-guardian">
    <span class="dt-guardian-art"><DtArt name="npc-guardian" :size="84" /></span>
    <span class="dt-guardian-main">
      <b
        >{{ t.temple.guardian.name
        }}<span v-if="g.killed" class="dt-tag dt-tag-ok ms-1">{{ t.temple.guardian.killedTag }}</span></b
      >
      <span class="dt-guardian-hp" data-testid="hp"
        >{{ t.temple.guardian.hpLabel }} <b>{{ formatNum(g.hpLeft) }}</b> / {{ formatNum(g.hpMax) }}</span
      >
      <span class="dt-guardian-bar" aria-hidden="true"><i :style="{ width: hpPct }"></i></span>
      <span class="dt-guardian-note">{{ t.temple.guardian.note }}</span>
    </span>
  </section>
  <div class="dt-block-head">
    <h2 class="dt-block-title">{{ t.temple.guardian.fireTitle }}</h2>
  </div>
  <div class="dt-card dt-rows-card">
    <DtRow
      v-for="m in data.missiles"
      :key="m.goodsId"
      class="dt-row-wrap"
      :data-testid="`missile-${m.goodsId}`"
    >
      <template #icon><DtArt :name="catalog.goodsArt(m.goodsId)" :size="28" /></template>
      <template #title>{{ catalog.goodsName(m.goodsId) }}</template>
      <template #sub>{{ m.num > 0 ? t.temple.guardian.have(m.num) : t.temple.guardian.haveNone }}</template>
      <template #end>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          :data-testid="`fire-open-${m.goodsId}`"
          @click="openMissile(m.goodsId)"
        >
          {{ t.temple.guardian.fireBtn }}
        </button>
      </template>
    </DtRow>
  </div>

  <template v-if="result">
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.temple.guardian.lastTitle(result.shots.length) }}</h2>
    </div>
    <section class="dt-bar-result is-plain" data-testid="shots">
      <div class="dt-shot-list">
        <span
          v-for="(s, i) in result.shots"
          :key="i"
          :class="{ 'is-crit': s.hit && s.crit, 'is-miss': !s.hit }"
          data-testid="shot"
          >{{
            !s.hit ? t.temple.guardian.miss : t.temple.guardian.hit(formatNum(s.damage), !!s.crit, !!s.killed)
          }}</span
        >
      </div>
      <template v-if="dropItems.length > 0 || result.drops.foods.length > 0">
        <div class="dt-bar-detail dt-muted">{{ t.temple.guardian.dropsTitle }}</div>
        <div class="dt-award-chips" data-testid="drops">
          <span v-for="[art, name, v] in dropItems" :key="name" class="dt-award-chip"
            ><span class="dt-award-chip-art"><DtArt :name="art" :size="20" /></span
            >{{ t.common.qty(name, v) }}</span
          >
          <span v-for="f in result.drops.foods" :key="f.foodsId" class="dt-award-chip"
            ><span class="dt-award-chip-art"><FoodArt :id="f.foodsId" :size="20" /></span
            >{{ t.common.qty(catalog.foodName(f.foodsId), f.num) }}</span
          >
        </div>
      </template>
      <div v-else class="dt-bar-detail dt-muted" data-testid="drops">{{ t.temple.guardian.noDrops }}</div>
    </section>
  </template>

  <QtySheet
    v-model="num"
    :open="open"
    :title="catalog.goodsName(goodsId)"
    :art="catalog.goodsArt(goodsId)"
    :lines="[held > 0 ? t.temple.guardian.have(held) : t.temple.guardian.haveNone]"
    :label="t.temple.guardian.howMany"
    :max="max"
    :ok-text="t.temple.guardian.fire(n)"
    :busy="busy"
    :reason="block"
    :sum="[
      [t.temple.guardian.name, t.temple.guardian.hp(formatNum(g.hpLeft), formatNum(g.hpMax), g.killed)],
      [t.temple.guardian.after, t.common.qty(catalog.goodsName(goodsId), Math.max(0, held - n))],
    ]"
    testid="num"
    @close="open = false"
    @ok="fire"
  />
</template>
