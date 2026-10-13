<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarAwardDto, BarDto, SlotResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import type { ArtName } from '../../art/generated/names';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum, formatPct } from '../../utils/format';
import DtArt from '../DtArt.vue';
import DtSheet from '../DtSheet.vue';
import QtySheet from '../QtySheet.vue';
import AwardChip from './AwardChip.vue';
import BarInfo from './BarInfo.vue';

/**
 * 老虎机（界面改版 P9）：三个转轮显示上一次开出的 3 格，下面抽 1 次、抽 10 次；
 * 礼券换蟹币、奖池和概率、我的统计各收成一行，点开从下面弹出
 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const last = ref<SlotResultDto | null>(null);
const exNum = ref(1);
const sheet = ref<'ex' | 'pool' | 'stats' | null>(null);

const slot = computed(() => props.data.slot);
function awardName(id: number): string {
  const a = slot.value.pool.find((x) => x.id === id);
  if (!a || a.kind === 'empty' || a.itemId === null) return t.value.bar.slot.empty;
  return a.kind === 'foods' ? catalog.foodName(a.itemId) : catalog.goodsName(a.itemId);
}
/** 转轮上的图：空格不画图，写“空” */
function awardArt(id: number): ArtName | null {
  const a = slot.value.pool.find((x) => x.id === id);
  if (!a || a.kind === 'empty' || a.itemId === null) return null;
  return a.kind === 'foods' ? catalog.foodArt(a.itemId) : catalog.goodsArt(a.itemId);
}
/** 抽 times 次的限制原因；空串表示能抽 */
function blockOf(times: number): string {
  if (!slot.value.emailVerified) return t.value.bar.slot.needEmail;
  if (props.data.krabCoins < times) return t.value.bar.slot.noKrab(props.data.krabCoins);
  return '';
}
const block1 = computed(() => blockOf(1));
const block10 = computed(() => blockOf(10));
const blockText = computed(() => block1.value || (block10.value ? t.value.bar.slot.ten(block10.value) : ''));
const sub = computed(() => t.value.bar.slot.floor(slot.value.floorLeft));
/** 转轮：上一次抽的最后一组 3 格；还没抽过是问号 */
const reels = computed(() => last.value?.spins.at(-1) ?? null);
const spinsText = computed(() =>
  (last.value?.spins ?? []).map((s, i) =>
    t.value.bar.slot.spinLine(i + 1, s.map((id) => awardName(id)).join(' / ')),
  ),
);
const rewards = computed<BarAwardDto[]>(() =>
  (last.value?.rewards ?? []).map((r) => ({ kind: r.kind, id: r.itemId, num: r.num, lucky: false })),
);
const statTotal = computed(() => slot.value.stats.reduce((s, x) => s + x.num, 0));
const statsText = computed(() =>
  slot.value.stats.length === 0
    ? t.value.bar.slot.noStats
    : t.value.bar.slot.statTotal(statTotal.value) +
      slot.value.stats
        .filter((s) => s.awardId !== 0)
        .slice(0, 3)
        .map((s) => t.value.bar.slot.statLine(awardName(s.awardId), s.num))
        .join(t.value.events.sep),
);
const exMax = computed(() => Math.min(99, Math.floor(props.data.tickets / props.data.krabCoinTickets)));
const exN = computed(() => Math.max(1, Math.min(exNum.value || 1, exMax.value)));
const exBlock = computed(() =>
  exMax.value < 1 ? t.value.bar.slot.noTickets(props.data.krabCoinTickets) : '',
);

async function spin(times: number) {
  if (busy.value || blockOf(times)) return;
  busy.value = true;
  try {
    last.value = await endpoints.barSlot(times);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.bar.slot.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
function openEx() {
  exNum.value = 1;
  sheet.value = 'ex';
}
async function exchange() {
  if (busy.value || exBlock.value) return;
  busy.value = true;
  try {
    await endpoints.barExchange(exN.value);
    sheet.value = null;
    toast.push(t.value.bar.slot.exDone(exN.value), 'success');
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.bar.slot.exFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BarInfo game="slot" :title="t.bar.slot.title" :sub="sub" />
  <section class="dt-card dt-bar-stage">
    <div class="dt-slot-reels" data-testid="slot-reels">
      <span v-for="i in 3" :key="i" class="dt-slot-reel">
        <template v-if="reels"
          ><DtArt v-if="awardArt(reels[i - 1]!)" :name="awardArt(reels[i - 1]!)!" :size="48" /><template
            v-else
            >{{ t.bar.slot.empty }}</template
          ></template
        ><template v-else>?</template>
      </span>
    </div>
    <div class="dt-bar-pair">
      <button
        type="button"
        class="btn btn-primary"
        data-testid="slot-1"
        :disabled="busy || !!block1"
        @click="spin(1)"
      >
        {{ t.bar.slot.spin1 }}
      </button>
      <button
        type="button"
        class="btn btn-outline-primary"
        data-testid="slot-10"
        :disabled="busy || !!block10"
        :title="block10"
        @click="spin(10)"
      >
        {{ t.bar.slot.spin10 }}
      </button>
    </div>
  </section>
  <div v-if="blockText" class="dt-bar-block" data-testid="slot-block">{{ blockText }}</div>
  <section
    v-if="last"
    :class="['dt-bar-result', { 'is-ok': rewards.length > 0 }]"
    role="status"
    data-testid="slot-result"
  >
    <b>{{ rewards.length > 0 ? t.bar.slot.gotHead : t.bar.slot.nothing }}</b>
    <div v-if="rewards.length > 0" class="dt-award-chips">
      <AwardChip v-for="(a, i) in rewards" :key="i" :award="a" />
    </div>
    <ul v-if="spinsText.length > 1" class="dt-bar-lines">
      <li v-for="(line, i) in spinsText" :key="i">{{ line }}</li>
    </ul>
  </section>
  <div class="dt-card dt-rows-card">
    <div class="dt-row">
      <span class="dt-row-ico"><DtArt name="res-krab" :size="22" /></span>
      <span class="dt-row-main"
        ><span class="dt-row-title is-strong">{{ t.bar.slot.exchange }}</span
        ><span class="dt-row-sub">{{ t.bar.slot.exRate(data.krabCoinTickets) }}</span></span
      >
      <span class="dt-row-end"
        ><button type="button" class="btn btn-sm btn-outline-primary" data-testid="ex-open" @click="openEx">
          {{ t.bar.slot.exBtnShort }}
        </button></span
      >
    </div>
    <button type="button" class="dt-row is-link" data-testid="slot-pool-open" @click="sheet = 'pool'">
      <span class="dt-row-ico"><DtArt name="food-master" :size="22" /></span>
      <span class="dt-row-main"
        ><span class="dt-row-title is-strong">{{ t.bar.slot.pool }}</span
        ><span class="dt-row-sub" data-testid="slot-rare-every">{{
          t.bar.slot.rareShort(slot.rareEvery)
        }}</span></span
      >
    </button>
    <button type="button" class="dt-row is-link" data-testid="slot-stats-open" @click="sheet = 'stats'">
      <span class="dt-row-ico"><DtArt name="food-spice" :size="22" /></span>
      <span class="dt-row-main"
        ><span class="dt-row-title is-strong">{{ t.bar.slot.stats }}</span
        ><span class="dt-row-sub" data-testid="slot-stats">{{ statsText }}</span></span
      >
    </button>
  </div>

  <QtySheet
    v-model="exNum"
    :open="sheet === 'ex'"
    :title="t.bar.slot.exchange"
    art="res-krab"
    :lines="[
      t.bar.slot.exRate(data.krabCoinTickets),
      t.bar.slot.exHave(formatNum(data.tickets), data.krabCoins),
    ]"
    :label="t.bar.slot.exHowMany"
    :max="exMax"
    :ok-text="t.bar.slot.exBtn(exN, exN * data.krabCoinTickets, formatNum(exN * data.krabCoinTickets))"
    :busy="busy"
    :reason="exBlock"
    :sum="[
      [t.bar.slot.exCost, t.bar.slot.tickets(formatNum(exN * data.krabCoinTickets)), true],
      [
        t.bar.slot.exAfter,
        t.bar.slot.tickets(formatNum(Math.max(0, data.tickets - exN * data.krabCoinTickets))),
      ],
    ]"
    testid="ex-num"
    @close="sheet = null"
    @ok="exchange"
  />
  <DtSheet :open="sheet === 'pool'" :title="t.bar.slot.pool" @close="sheet = null">
    <table class="dt-bar-table" data-testid="slot-pool">
      <tbody>
        <tr v-for="a in slot.pool" :key="a.id">
          <td>
            {{ awardName(a.id)
            }}<span v-if="a.rare" class="dt-tag dt-tag-warn ms-1">{{ t.bar.slot.rare }}</span>
          </td>
          <td class="text-end">{{ formatPct(a.rate, { digits: 2, min: 2 }) }}</td>
        </tr>
      </tbody>
    </table>
    <p class="dt-detail-note">{{ t.bar.slot.rareEvery(slot.rareEvery) }}</p>
  </DtSheet>
  <DtSheet :open="sheet === 'stats'" :title="t.bar.slot.stats" @close="sheet = null">
    <p v-if="slot.stats.length === 0" class="dt-detail-note">{{ t.bar.slot.noStats }}</p>
    <table v-else class="dt-bar-table" data-testid="slot-stats-table">
      <tbody>
        <tr v-for="s in slot.stats" :key="s.awardId">
          <td>{{ awardName(s.awardId) }}</td>
          <td class="text-end">{{ t.bar.slot.cells(s.num) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="slot.stats.length > 0" class="dt-detail-note">{{ t.bar.slot.cellsTotal(statTotal) }}</p>
  </DtSheet>
</template>
