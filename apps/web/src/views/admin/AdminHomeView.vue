<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { gameDay, type EconomyRowDto, type SettlementRoundDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import LaunchCheck from '../../components/admin/LaunchCheck.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import AdmKpi from '../../components/admin/kit/AdmKpi.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const admin = useAdminStore();
const toast = useToastStore();
const rows = ref<EconomyRowDto[]>([]);
const last = ref<SettlementRoundDto | null>(null);

async function load() {
  if (!admin.shardId) return;
  const today = gameDay();
  try {
    const [eco, rounds] = await Promise.all([
      adminApi.economy(admin.shardId, today, today),
      adminApi.settlementRounds(admin.shardId, 1),
    ]);
    rows.value = eco;
    last.value = rounds.at(-1) ?? null;
  } catch (e) {
    toast.push(errorMessage(e, '读取概览失败'), 'danger');
  }
}
watch(() => admin.shardId, load, { immediate: true });

const sum = (kind: string, source?: string) =>
  rows.value
    .filter((r) => r.kind === kind && (!source || r.source === source))
    .reduce((s, r) => s + r.amount, 0);
const active = computed(() => sum('active'));
const coin = computed(() => sum('coin', 'settlement'));
const exp = computed(() => sum('exp', 'settlement'));
const shardName = computed(() => admin.shards.find((s) => s.id === admin.shardId)?.name ?? '');
/** 今天（游戏日）写成“10/12” */
const todayText = computed(() => {
  const [, m, d] = gameDay().split('-');
  return `${Number(m)}/${Number(d)}`;
});
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead title="概览" :desc="`${shardName} · 今天 ${todayText} · 每 4 分钟结算一轮`" />
    <!-- 上线检查（子项目 6B-2）：放在最上面，上线前一眼看到 -->
    <LaunchCheck />
    <h2 class="dt-adm-h2">今日概览</h2>
    <div class="dt-adm-g4">
      <AdmKpi label="活跃店" :value="formatNum(active)" testid="home-active" />
      <AdmKpi label="结算银币" :value="formatNum(coin)" testid="home-coin" />
      <AdmKpi label="结算经验" :value="formatNum(exp)" testid="home-exp" />
      <AdmKpi
        label="最近一轮结算"
        :value="last ? `${formatNum(last.ms)} ms` : '暂无'"
        :sub="last ? `${formatNum(last.settled)} 店 · 失败 ${last.failed}` : undefined"
        testid="home-round"
      />
    </div>
  </div>
</template>
