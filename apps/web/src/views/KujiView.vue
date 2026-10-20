<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { KujiAwardDto, KujiDrawDto, KujiLine, KujiViewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtSheet from '../components/DtSheet.vue';
import DtStepper from '../components/DtStepper.vue';
import DtTabPanel from '../components/DtTabPanel.vue';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum, gameDateTime } from '../utils/format';

/**
 * 一番赏（一番赏设计 §7.2）：奖池看板、买券、抽签。
 * 界面改版 P8：主题卡、奖池卡（剩余进度、各赏一行）、抽签和买券一张卡，抽完从下面弹出结果
 */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<KujiViewDto | null>(null);
const result = ref<KujiDrawDto | null>(null);
const buyNum = ref(1);
const busy = ref(false);
/** 普通 / 豪华（240-2）：记在网址的 line 里，刷新后保持 */
const line = useTabQuery<KujiLine>({ tabs: ['normal', 'deluxe'], param: 'line', omitWhen: 'normal' });
const lineItems = computed(() => [
  { key: 'normal', label: t.value.kuji.lineNormal },
  { key: 'deluxe', label: t.value.kuji.lineDeluxe },
]);
const deluxe = computed(() => line.value === 'deluxe');
/** 抽签进行中不让切线（原来按钮禁用） */
function pickLine(x: string) {
  if (busy.value || x === line.value) return;
  line.value = x as KujiLine;
}

const awardText = (a: KujiAwardDto) =>
  [
    ...(a.goods ?? []).map((g) =>
      g.num > 1 ? t.value.common.qty(catalog.goodsName(g.id), g.num) : catalog.goodsName(g.id),
    ),
    ...(a.foods ?? []).map((f) => t.value.common.qty(catalog.foodName(f.id), f.num)),
    ...(a.diamond ? [t.value.kuji.diamond(formatNum(a.diamond))] : []),
    ...(a.coin ? [t.value.kuji.coin(formatNum(a.coin))] : []),
    ...(a.exp ? [t.value.kuji.exp(formatNum(a.exp))] : []),
    ...(a.renown ? [t.value.kuji.renown(formatNum(a.renown))] : []),
  ].join(t.value.events.sep);
/** 限定称号写出名字（240-2：豪华池按月轮换）；目录里没有时照旧写“附限定图标” */
const iconText = (key: string) => {
  const title = catalog.icon(key)?.title;
  return title ? t.value.kuji.iconNamed(title) : t.value.kuji.icon;
};
const tierName = (k: string) => (k === 'last' ? t.value.kuji.lastTier : t.value.kuji.tier(k));
const recentTime = (iso: string) => gameDateTime(iso);
/** 结果面板里大赏用实色徽章 */
const isBig = (key: string) => !!data.value?.tiers.find((x) => x.key === key)?.big;
const canDraw = (n: number) =>
  !!data.value &&
  !busy.value &&
  !data.value.closedToday &&
  data.value.tickets >= n &&
  data.value.pool.left >= n &&
  n <= data.value.maxDraw;

/**
 * 抽签按钮（backlog 一番赏）：1、5、10 里不超过单次上限的，上限大于 10 时再加一个按上限抽；
 * 池里剩下的不到一个按钮时，加一个"抽完剩下的"
 */
const drawOptions = computed(() => {
  const v = data.value;
  if (!v) return [];
  const out = [1, 5, 10].filter((n) => n <= v.maxDraw);
  if (v.maxDraw > 10) out.push(v.maxDraw);
  const left = v.pool.left;
  if (left > 1 && left <= v.maxDraw && !out.includes(left)) out.push(left);
  return out.sort((a, b) => a - b);
});
/** 买券数量：要整数，且不超过今天还能买的（backlog 一番赏） */
const buyHint = computed(() => {
  const v = data.value;
  const n = buyNum.value;
  if (!v) return '';
  if (!Number.isInteger(n) || n < 1) return t.value.kuji.buyInt;
  if (n > v.buyLeft) return t.value.kuji.buyMax(v.buyLeft);
  return '';
});
const buyOk = computed(() => buyHint.value === '');

/** 请求发起后切了线，响应就作废：不能把别的线的看板写进当前页（240-2 终审 I-1） */
const stale = (l: KujiLine) => l !== line.value;

async function load() {
  const l = line.value;
  try {
    const v = l === 'deluxe' ? await endpoints.kuji('deluxe') : await endpoints.kuji();
    if (!stale(l)) data.value = v;
  } catch (e) {
    if (!stale(l)) toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}
async function buy() {
  const n = buyNum.value;
  if (!Number.isInteger(n) || n < 1) return;
  busy.value = true;
  const l = line.value;
  try {
    const v = l === 'deluxe' ? await endpoints.kujiBuy(n, 'deluxe') : await endpoints.kujiBuy(n);
    toast.push(l === 'deluxe' ? t.value.kuji.boughtDeluxe(n) : t.value.kuji.bought(n));
    if (!stale(l)) data.value = v;
  } catch (e) {
    toast.push(errorMessage(e, t.value.kuji.buyFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
async function draw(n: number) {
  busy.value = true;
  const l = line.value;
  try {
    const r = l === 'deluxe' ? await endpoints.kujiDraw(n, 'deluxe') : await endpoints.kujiDraw(n);
    if (stale(l)) return;
    result.value = r;
    data.value = r.view;
  } catch (e) {
    toast.push(errorMessage(e, t.value.kuji.drawFailed), 'danger');
    if (!stale(l)) await load();
  } finally {
    busy.value = false;
  }
}
onMounted(() => void load());
watch(line, () => {
  result.value = null;
  data.value = null;
  void load();
});
</script>

<template>
  <DtTabs
    :model-value="line"
    :tabs="lineItems"
    :disabled="busy"
    testid-prefix="kj-line-"
    @update:model-value="pickLine"
  />
  <DtTabPanel :tab="line">
    <template v-if="data">
      <!-- 月度主题（问题记录 274）：A/B/C/最后赏的手办只在这个月抽得到 -->
      <section v-if="data.theme" class="dt-kuji-theme" data-testid="kj-theme">
        <span class="dt-kuji-theme-art"><DtArt name="goods-souvenir" :size="44" /></span>
        <div class="dt-min0">
          <b>{{
            t.kuji.theme(
              data.theme.month,
              catalog.data('kujiThemes', data.theme.month)?.name ?? data.theme.name,
            )
          }}</b>
          <div>
            {{ catalog.data('kujiThemes', data.theme.month)?.desc ?? data.theme.desc
            }}{{ t.kuji.themeLimited }}
          </div>
        </div>
      </section>
      <div v-if="data.closedToday" class="dt-act-note is-warn" data-testid="kj-closed">
        {{ t.kuji.closed }}
      </div>

      <section class="dt-card dt-rows-card" data-testid="kj-pool">
        <div class="dt-kuji-pool">
          <div class="dt-kuji-pool-head">
            <b>{{ t.kuji.pool(data.pool.day, data.pool.seq) }}</b>
            <span>{{ t.kuji.left(data.pool.left, data.pool.total) }}</span>
          </div>
          <span class="dt-meter"
            ><i :style="{ width: `${(data.pool.left / Math.max(1, data.pool.total)) * 100}%` }"></i
          ></span>
          <div class="dt-meta mt-2">
            {{ t.kuji.rule(data.pool.total) }}
            <span v-if="deluxe" data-testid="kj-deluxe-note">{{ t.kuji.deluxeNote }}</span>
          </div>
        </div>
        <div
          v-for="x in data.tiers"
          :key="x.key"
          :class="['dt-kuji-tier', { 'is-out': x.left === 0 }]"
          :data-testid="`kj-tier-${x.key}`"
        >
          <span :class="['dt-kuji-badge', { 'is-big': x.big }]" :aria-label="tierName(x.key)">{{
            x.key
          }}</span>
          <span class="dt-kuji-award"
            >{{ awardText(x.award) }}<span v-if="x.big" class="dt-tag dt-tag-warn ms-1">{{ t.kuji.big }}</span
            ><span v-if="x.icon" class="dt-kuji-icon">{{ iconText(x.icon) }}</span></span
          >
          <span class="dt-kuji-count">{{ x.left }} / {{ x.count }}</span>
        </div>
        <div class="dt-kuji-tier" data-testid="kj-last">
          <span class="dt-kuji-badge is-last">{{ t.kuji.lastTier }}</span>
          <span class="dt-kuji-award"
            >{{ awardText(data.last.award)
            }}<span v-if="data.last.icon" class="dt-kuji-icon"
              >{{ iconText(data.last.icon) }} · {{ t.kuji.lastWho }}</span
            ><span v-else class="dt-kuji-icon">{{ t.kuji.lastWho }}</span></span
          >
        </div>
      </section>

      <section class="dt-card dt-kuji-play">
        <div class="dt-kuji-play-head">
          <span data-testid="kj-tickets">{{
            deluxe ? t.kuji.ticketsDeluxe(data.tickets) : t.kuji.tickets(data.tickets)
          }}</span>
          <span class="dt-meta" data-testid="kj-coin">{{ t.kuji.balance(formatNum(data.coin)) }}</span>
        </div>
        <div class="dt-kuji-draws">
          <button
            v-for="(n, i) in drawOptions"
            :key="n"
            type="button"
            :class="['btn', i === 0 ? 'btn-primary' : 'btn-outline-primary']"
            :disabled="!canDraw(n)"
            :data-testid="`kj-draw-${n}`"
            @click="draw(n)"
          >
            {{ t.kuji.draw(n) }}
          </button>
        </div>
        <div class="dt-kuji-buy">
          <span class="dt-field-label"
            ><b>{{ t.kuji.buy }}</b
            ><small>{{ t.kuji.buyLeft(data.buyLeft) }}</small></span
          >
          <DtStepper
            v-model="buyNum"
            :min="1"
            :max="Math.max(1, data.buyLeft)"
            :disabled="data.buyLeft === 0"
            testid="kj-buy-num"
          />
          <button
            type="button"
            class="dt-price-btn"
            :disabled="busy || data.buyLeft === 0 || !buyOk"
            :aria-label="t.kuji.buyAria(buyNum, formatNum(buyNum * data.price))"
            data-testid="kj-buy"
            @click="buy"
          >
            <DtArt name="res-coin-silver" :size="16" />{{ formatNum(buyNum * data.price) }}
          </button>
        </div>
        <div v-if="buyHint" class="dt-detail-note text-danger" data-testid="kj-buy-hint">{{ buyHint }}</div>
      </section>

      <section class="dt-block">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.kuji.recent }}</h2>
        </div>
        <div data-testid="kj-recent">
          <DtEmpty v-if="data.recent.length === 0" :title="t.kuji.noRecent" />
          <div v-else class="dt-card dt-rows-card">
            <div v-for="(x, i) in data.recent" :key="i" class="dt-row">
              <span class="dt-row-main"
                ><span class="dt-row-title">{{ t.kuji.recentLine(x.restName, tierName(x.tier)) }}</span></span
              >
              <span class="dt-row-value">{{ recentTime(x.at) }}</span>
            </div>
          </div>
        </div>
      </section>
    </template>

    <DtSheet :open="!!result" :title="t.kuji.result" @close="result = null">
      <div v-if="result" data-testid="kj-result">
        <div class="dt-sheet-list">
          <div v-for="(x, i) in result.draws" :key="i" class="dt-row">
            <span :class="['dt-kuji-badge', { 'is-big': isBig(x.tier) }]">{{
              x.tier === 'last' ? t.kuji.lastTier : x.tier
            }}</span>
            <span class="dt-row-main"
              ><span class="dt-row-title">{{ awardText(x.award) }}</span></span
            >
          </div>
        </div>
        <div v-if="result.last" class="dt-act-note is-warn mt-3 mb-0" data-testid="kj-last-won">
          {{ t.kuji.lastWon(awardText(result.last)) }}
        </div>
      </div>
      <template #actions>
        <button
          type="button"
          class="btn btn-primary dt-btn-block"
          data-testid="kj-result-ok"
          @click="result = null"
        >
          {{ t.kuji.ok }}
        </button>
      </template>
    </DtSheet>
  </DtTabPanel>
</template>
