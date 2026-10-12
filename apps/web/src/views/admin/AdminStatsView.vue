<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  addDays,
  gameDay,
  type DistributionDto,
  type EconomyRowDto,
  type SettlementRoundDto,
} from '@dt/shared';
import { adminApi } from '../../api/admin';
import BarChart from '../../components/admin/BarChart.vue';
import LineChart from '../../components/admin/LineChart.vue';
import { chartColor } from '../../components/admin/chartUtil';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import AdmSeg from '../../components/admin/kit/AdmSeg.vue';
import { sourceLabel } from '../../utils/adminLabels';
import { formatNum } from '../../utils/format';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { newsTime } from '../../utils/news';

const admin = useAdminStore();
const toast = useToastStore();
const to = ref(gameDay());
const from = ref(addDays(to.value, -13));
const kind = ref<'coin' | 'exp' | 'diamond' | 'active'>('coin');
const rows = ref<EconomyRowDto[]>([]);
const dist = ref<DistributionDto | null>(null);
const rounds = ref<SettlementRoundDto[]>([]);
const KINDS = { coin: '银币', exp: '经验', diamond: '钻石', active: '活跃店' } as const;
const KIND_OPTIONS = [
  ['coin', '银币'],
  ['diamond', '钻石'],
  ['exp', '经验'],
  ['active', '活跃店'],
] as const;
const shardName = computed(() => admin.shards.find((s) => s.id === admin.shardId)?.name ?? '');

async function load() {
  if (!admin.shardId) return;
  try {
    [rows.value, dist.value, rounds.value] = await Promise.all([
      adminApi.economy(admin.shardId, from.value, to.value),
      adminApi.distribution(admin.shardId),
      adminApi.settlementRounds(admin.shardId, 90),
    ]);
  } catch (e) {
    toast.push(errorMessage(e, '读取统计失败'), 'danger');
  }
}
watch(() => admin.shardId, load, { immediate: true });

const days = computed(() => {
  const out: string[] = [];
  for (let d = from.value; d <= to.value && out.length < 90; d = addDays(d, 1)) out.push(d);
  return out;
});
/** 横轴日期写成“9/29” */
const dayLabels = computed(() => days.value.map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`));
/**
 * 选中资源按来源画线（界面改版 P12）：来源写中文、同名的合在一起；取绝对值最大的 4 个，其余并入“其他”，
 * 一共不超过五条线，对上图表的五种颜色
 */
const economySeries = computed(() => {
  const picked = rows.value
    .filter((r) => r.kind === kind.value)
    .map((r) => ({ ...r, label: sourceLabel(r.source) }));
  const weight = new Map<string, number>();
  for (const r of picked) weight.set(r.label, (weight.get(r.label) ?? 0) + Math.abs(r.amount));
  const top = [...weight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, weight.size > 5 ? 4 : 5)
    .map(([s]) => s);
  const names = weight.size > top.length ? [...top, '其他'] : top;
  return names.map((name) => ({
    name,
    values: days.value.map((d) =>
      picked
        .filter((r) => r.day === d && (name === '其他' ? !top.includes(r.label) : r.label === name))
        .reduce((s, r) => s + r.amount, 0),
    ),
  }));
});
const levelBars = computed(() =>
  (dist.value?.levels ?? []).map((b) => ({ label: `${b.from}-${b.to}`, value: b.count })),
);
const starBars = computed(() =>
  (dist.value?.stars ?? []).map((s) => ({ label: `${s.star}`, value: s.count })),
);
const cookbookBars = computed(() =>
  (dist.value?.cookbooks ?? []).map((b) => ({ label: `${b.from}-${b.to}`, value: b.count })),
);
const roundSeries = computed(() => [{ name: '结算耗时（ms）', values: rounds.value.map((r) => r.ms) }]);
const roundMax = computed(() => Math.max(0, ...rounds.value.map((r) => r.ms)));
const roundMid = computed(() => {
  const ms = rounds.value.map((r) => r.ms).sort((a, b) => a - b);
  return ms[Math.floor(ms.length / 2)] ?? 0;
});
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead title="统计" :desc="`${shardName} · 按游戏日`" />
    <form class="dt-adm-fbar" @submit.prevent="load">
      <span class="dt-adm-line dt-adm-range">
        <input v-model="from" type="date" class="dt-adm-in" aria-label="从" />
        <span class="dt-adm-mu">–</span>
        <input v-model="to" type="date" class="dt-adm-in" aria-label="到" />
      </span>
      <AdmSeg v-model="kind" :options="KIND_OPTIONS" testid="stats-kind" />
      <button class="dt-adm-btn is-sp">刷新</button>
    </form>
    <AdmBox>
      <template #head>
        <b>每日{{ KINDS[kind] }}</b
        ><span>按来源, 正数流入、负数流出</span>
      </template>
      <template #right>
        <span v-for="(s, i) in economySeries" :key="s.name" class="dt-adm-chip"
          ><i :style="{ background: chartColor(i) }"></i>{{ s.name }}</span
        >
      </template>
      <div data-testid="economy-chart">
        <LineChart :labels="dayLabels" :series="economySeries" :legend="false" />
      </div>
    </AdmBox>
    <div v-if="dist" class="dt-adm-g3">
      <AdmBox title="等级分布" :sub="`${formatNum(dist.open + dist.closed)} 家`">
        <div data-testid="levels-chart"><BarChart :bars="levelBars" /></div>
      </AdmBox>
      <AdmBox title="星级分布" :sub="`营业 ${formatNum(dist.open)} · 停业 ${formatNum(dist.closed)}`">
        <BarChart :bars="starBars" />
      </AdmBox>
      <AdmBox title="已学食谱" sub="按道数">
        <BarChart :bars="cookbookBars" />
      </AdmBox>
    </div>
    <AdmBox>
      <template #head>
        <b>最近 {{ rounds.length }} 轮结算耗时</b
        ><span data-testid="rounds-axis">每 4 分钟一轮, 左旧右新, 纵轴是这一轮结算用的毫秒数</span>
      </template>
      <template v-if="rounds.length > 0" #right>
        <span class="dt-adm-mu dt-adm-small"
          >最高 {{ formatNum(roundMax) }} ms · 中位 {{ formatNum(roundMid) }} ms</span
        >
      </template>
      <!-- 横轴原来写的是轮号，看不出意义；改成结算时间（问题记录 124） -->
      <div data-testid="rounds-chart">
        <LineChart
          :labels="rounds.map((r) => newsTime(r.at))"
          :series="roundSeries"
          :height="120"
          :legend="false"
        />
      </div>
    </AdmBox>
  </div>
</template>
