<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  gameDay,
  PAYING_CUSTOMERS,
  type BuffsDto,
  type IncomePageDto,
  type RoundSummaryDto,
} from '@dt/shared';
import { endpoints } from '../api/endpoints';
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
  <!-- 问题记录 530：加成收进默认收起的区块，只列不是 0 的项；551：收起后占地方小，放回最上面，下面是收益记录、先写今天的小计 -->
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <details class="mb-3" data-testid="income-buffs">
    <summary class="fw-bold">{{ t.rest.income.bonus }}</summary>
    <h6 class="mt-2">{{ t.rest.income.buffs }}</h6>
    <div v-if="buffs?.rates" class="small mb-3">
      <template v-for="(meta, key) in RATE_LABELS" :key="key">
        <div v-if="buffs.rates[key] && shown(buffs.rates[key]!)" class="mb-1">
          <b>{{ meta.label }} {{ fmt(key, buffs.rates[key]!.total) }}</b>
          <span v-for="(v, p) in buffs.rates[key]!.parts" :key="p" class="dt-tag ms-1">
            {{ PART_LABELS[p] ?? p }} {{ fmt(key, v) }}
          </span>
        </div>
      </template>
      <div v-if="buffs.seated !== null" class="text-muted">{{ t.rest.income.seated(buffs.seated) }}</div>
    </div>
    <div v-else class="text-muted small mb-3">{{ t.rest.income.noRound }}</div>
    <h6>{{ t.rest.income.sources }}</h6>
    <ul class="list-unstyled small mb-0">
      <li v-for="s in buffs?.sources ?? []" :key="`${s.sourceType}-${s.sourceId}`">
        <b>{{ effectName(s, catalog) }}</b> {{ describeEffects(s.effects) }}
      </li>
    </ul>
  </details>
  <section data-testid="income-records">
    <h6>{{ t.rest.income.records }}</h6>
    <div v-if="today" class="small mb-2" data-testid="income-today">
      {{
        t.rest.income.today(today.rounds, formatNum(today.coin), formatNum(today.exp), formatNum(today.oil))
      }}
    </div>
    <table class="table table-sm small">
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
    <button v-if="next" class="btn btn-sm btn-outline-secondary w-100 mb-3" @click="more">
      {{ t.rest.income.more }}
    </button>
  </section>
</template>
