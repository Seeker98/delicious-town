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
/** 选中资源按来源画线：取绝对值最大的 6 个来源，其余并入"其他" */
const economySeries = computed(() => {
  const picked = rows.value.filter((r) => r.kind === kind.value);
  const weight = new Map<string, number>();
  for (const r of picked) weight.set(r.source, (weight.get(r.source) ?? 0) + Math.abs(r.amount));
  const top = [...weight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([s]) => s);
  const names = weight.size > top.length ? [...top, '其他'] : top;
  return names.map((name) => ({
    name,
    values: days.value.map((d) =>
      picked
        .filter((r) => r.day === d && (name === '其他' ? !top.includes(r.source) : r.source === name))
        .reduce((s, r) => s + r.amount, 0),
    ),
  }));
});
const levelBars = computed(() =>
  (dist.value?.levels ?? []).map((b) => ({ label: `${b.from}-${b.to}`, value: b.count })),
);
const starBars = computed(() =>
  (dist.value?.stars ?? []).map((s) => ({ label: `${s.star} 星`, value: s.count })),
);
const cookbookBars = computed(() =>
  (dist.value?.cookbooks ?? []).map((b) => ({ label: `${b.from}-${b.to}`, value: b.count })),
);
const roundSeries = computed(() => [{ name: '结算耗时（ms）', values: rounds.value.map((r) => r.ms) }]);
</script>

<template>
  <h5>统计</h5>
  <div class="d-flex flex-wrap gap-2 small mb-2">
    <input v-model="from" type="date" class="form-control form-control-sm w-auto" />
    <input v-model="to" type="date" class="form-control form-control-sm w-auto" />
    <select v-model="kind" class="form-select form-select-sm w-auto">
      <option v-for="(label, k) in KINDS" :key="k" :value="k">{{ label }}</option>
    </select>
    <button class="btn btn-sm btn-outline-primary" @click="load">刷新</button>
  </div>
  <h6>每日{{ KINDS[kind] }}（按来源，正数流入、负数流出）</h6>
  <div data-testid="economy-chart"><LineChart :labels="days" :series="economySeries" /></div>
  <div v-if="dist" class="row mt-3">
    <div class="col-md-4" data-testid="levels-chart">
      <h6>等级分布</h6>
      <BarChart :bars="levelBars" />
    </div>
    <div class="col-md-4">
      <h6>星级分布</h6>
      <BarChart :bars="starBars" />
    </div>
    <div class="col-md-4">
      <h6>已学食谱</h6>
      <BarChart :bars="cookbookBars" />
    </div>
    <p class="small text-muted">营业 {{ dist.open }} 家，停业 {{ dist.closed }} 家</p>
  </div>
  <h6 class="mt-3">最近 {{ rounds.length }} 轮结算耗时</h6>
  <!-- 横轴原来写的是轮号，看不出意义；改成结算时间并说明横纵轴（问题记录 124） -->
  <p class="small text-muted mb-1" data-testid="rounds-axis">
    横轴：结算时间（每 4 分钟一轮，左旧右新）；纵轴：本区服这一轮结算用的毫秒数。
  </p>
  <div data-testid="rounds-chart">
    <LineChart :labels="rounds.map((r) => newsTime(r.at))" :series="roundSeries" />
  </div>
</template>
