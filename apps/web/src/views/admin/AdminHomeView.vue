<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { gameDay, type EconomyRowDto, type SettlementRoundDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
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
</script>

<template>
  <h5>今日概览</h5>
  <div class="row g-2 small">
    <div class="col-6 col-md-3">
      <div class="border rounded p-2" data-testid="home-active">
        活跃店<br /><b>{{ formatNum(active) }}</b>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="border rounded p-2" data-testid="home-coin">
        结算银币<br /><b>{{ formatNum(coin) }}</b>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="border rounded p-2" data-testid="home-exp">
        结算经验<br /><b>{{ formatNum(exp) }}</b>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="border rounded p-2" data-testid="home-round">
        最近一轮结算<br />
        <b v-if="last">{{ last.ms }} ms · {{ last.settled }} 店 · 失败 {{ last.failed }}</b
        ><b v-else>暂无</b>
      </div>
    </div>
  </div>
</template>
