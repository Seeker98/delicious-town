<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  gameDay,
  PAYING_CUSTOMERS,
  type BuffsDto,
  type IncomePageDto,
  type RoundSummaryDto,
} from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtArt from '../components/DtArt.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { describeEffects } from '../utils/effects';
import { effectName } from '../utils/serverText';
import { useCatalogStore } from '../stores/catalog';
import { formatNum, gameDateTime, timeHM } from '../utils/format';
import { serverNowMs } from '../utils/serverNow';
import { PART_LABELS, pct, RATE_LABELS } from '../utils/labels';

const t = useT();
const catalog = useCatalogStore();
const items = ref<RoundSummaryDto[]>([]);
const next = ref<string | null>(null);
/** 今天（北京时间）的小计，第一页带来（问题记录 530） */
const today = ref<IncomePageDto['today'] | null>(null);
/** 付钱的客人数（类型和结算共用 shared 的 PAYING_CUSTOMERS） */
const guests = (c: Record<string, number>) => PAYING_CUSTOMERS.reduce((n, k) => n + (c[String(k)] ?? 0), 0);
/** 今天（北京时间）的只写时:分，不是今天的带日期（终审 M3：0 点后第一页会混进昨天的） */
const roundTime = (at: string) =>
  gameDay(new Date(at)) !== gameDay(new Date(serverNowMs()))
    ? gameDateTime(at, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : timeHM(at);
/** 合计不是 0，或者有分项不是 0（正负抵消时也让玩家看到天气在扣，终审 M5） */
const shown = (r: { total: number; parts: Record<string, number> }) =>
  r.total !== 0 || Object.values(r.parts).some((v) => v !== 0);
const buffs = ref<BuffsDto | null>(null);
const error = ref('');

const fmt = (key: string, v: number) =>
  RATE_LABELS[key]?.percent ? pct(v) : formatNum(Math.round(v * 100) / 100);

/** 最近 30 轮银币的小柱状图（界面改版 P7）：旧的在左、最新在右，按最高的一轮算高度 */
const CHART_ROUNDS = 30;
const chart = computed(() => {
  const list = items.value.slice(0, CHART_ROUNDS).reverse();
  const max = Math.max(1, ...list.map((r) => r.coin));
  return {
    bars: list.map((r) => ({ key: r.roundNo, h: Math.max(2, Math.round((r.coin / max) * 44)) })),
    from: list[0] ? roundTime(list[0].at) : '',
    to: list.at(-1) ? roundTime(list.at(-1)!.at) : '',
    latest: list.at(-1)?.coin ?? 0,
  };
});

async function more() {
  try {
    const page = await endpoints.income(next.value ?? undefined);
    items.value.push(...page.items);
    next.value = page.nextBefore;
    if (page.today) today.value = page.today;
  } catch (e) {
    error.value = errorMessage(e, t.value.rest.income.loadFailed);
  }
}
onMounted(async () => {
  // 记录和加成一起读（性能排查 2026-10-08：原来一个接一个，线上多一轮往返）
  const b = endpoints.buffs().catch(() => null);
  await more();
  buffs.value = await b;
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <!-- 今天（界面改版 P7）：轮数一行，银币、经验、耗油三个数字，下面最近 30 轮银币的小柱状图 -->
  <section v-if="today || items.length > 0" class="dt-card dt-income-today" data-testid="income-today">
    <div class="dt-income-head">
      <h2 class="dt-income-title">{{ t.rest.income.todayTitle }}</h2>
      <span v-if="today" class="dt-income-meta">{{ t.rest.income.rounds(today.rounds) }}</span>
    </div>
    <div v-if="today" class="dt-income-stats">
      <div>
        <span class="dt-stat-label">{{ t.rest.income.cols.coin }}</span>
        <b class="dt-income-num">{{ formatNum(today.coin) }}</b>
      </div>
      <div>
        <span class="dt-stat-label">{{ t.rest.income.cols.exp }}</span>
        <b class="dt-income-num">{{ formatNum(today.exp) }}</b>
      </div>
      <div>
        <span class="dt-stat-label">{{ t.rest.income.cols.oil }}</span>
        <b class="dt-income-num">{{ formatNum(today.oil) }}</b>
      </div>
    </div>
    <div v-if="chart.bars.length > 1" class="dt-income-chart" data-testid="income-chart">
      <div
        class="dt-income-bars"
        role="img"
        :aria-label="t.rest.income.chartLabel(chart.bars.length, formatNum(chart.latest))"
      >
        <i v-for="b in chart.bars" :key="b.key" :style="{ height: `${b.h}px` }"></i>
      </div>
      <div class="dt-income-axis" aria-hidden="true">
        <span>{{ chart.from }}</span>
        <span>{{ t.rest.income.chartTitle(chart.bars.length) }}</span>
        <span>{{ chart.to }}</span>
      </div>
    </div>
  </section>

  <!-- 加成（问题记录 530、551）：默认收起，和首页“生效的加成”一样的折叠卡；只列不是 0 的项 -->
  <details class="dt-card dt-effects dt-fold" data-testid="income-buffs">
    <summary class="dt-effects-sum">
      <span class="dt-fold-ico"><DtArt name="sec-bonus" :size="22" /></span>
      <span class="dt-effects-sum-text">
        <span class="dt-fold-title">{{ t.rest.income.bonus }}</span>
        <span class="dt-fold-sub">{{ t.rest.income.bonusHint }}</span>
      </span>
      <i class="bi bi-chevron-down dt-effects-chev" aria-hidden="true"></i>
    </summary>
    <div class="dt-effects-body">
      <div class="dt-effects-group">{{ t.rest.income.buffs }}</div>
      <template v-if="buffs?.rates">
        <template v-for="(meta, key) in RATE_LABELS" :key="key">
          <div v-if="buffs.rates[key] && shown(buffs.rates[key]!)" class="dt-effect">
            <div class="dt-effect-head">
              <span class="dt-effect-name">{{ meta.label }}</span>
              <b class="dt-effect-time">{{ fmt(key, buffs.rates[key]!.total) }}</b>
            </div>
            <div class="dt-effect-chips">
              <span v-for="(v, p) in buffs.rates[key]!.parts" :key="p" class="dt-chip"
                >{{ PART_LABELS[p] ?? p }} {{ fmt(key, v) }}</span
              >
            </div>
          </div>
        </template>
        <div v-if="buffs.seated !== null" class="dt-effect dt-meta">
          {{ t.rest.income.seated(buffs.seated) }}
        </div>
      </template>
      <div v-else class="dt-effect dt-meta">{{ t.rest.income.noRound }}</div>
      <template v-if="(buffs?.sources ?? []).length > 0">
        <div class="dt-effects-group">{{ t.rest.income.sources }}</div>
        <div v-for="s in buffs?.sources ?? []" :key="`${s.sourceType}-${s.sourceId}`" class="dt-effect">
          <div class="dt-effect-head">
            <span class="dt-effect-name">{{ effectName(s, catalog) }}</span>
          </div>
          <div class="dt-meta">{{ describeEffects(s.effects) }}</div>
        </div>
      </template>
    </div>
  </details>

  <section class="dt-block" data-testid="income-records">
    <div class="dt-block-head">
      <h2 class="dt-block-title">{{ t.rest.income.records }}</h2>
      <span class="dt-block-more">{{ t.rest.income.newestFirst }}</span>
    </div>
    <!-- 每一轮一行（数字列右对齐、等宽） -->
    <div class="dt-card dt-income-card">
      <table class="dt-income-table">
        <thead>
          <tr>
            <th>{{ t.rest.income.cols.time }}</th>
            <th class="text-end">{{ t.rest.income.cols.guests }}</th>
            <th class="text-end">{{ t.rest.income.cols.coin }}</th>
            <th class="text-end">{{ t.rest.income.cols.exp }}</th>
            <th class="text-end">{{ t.rest.income.cols.oil }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in items" :key="r.roundNo">
            <td class="text-nowrap">{{ roundTime(r.at) }}</td>
            <td class="text-end">{{ formatNum(guests(r.customers)) }}</td>
            <td class="text-end">{{ formatNum(r.coin) }}</td>
            <td class="text-end">{{ formatNum(r.exp) }}</td>
            <td class="text-end">{{ formatNum(r.oil) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="next" class="dt-more-row">
      <button type="button" class="btn btn-outline-primary" data-testid="income-more" @click="more">
        {{ t.rest.income.more }}
      </button>
    </div>
  </section>
</template>
