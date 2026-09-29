<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { BuffsDto, RoundSummaryDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { describeEffects } from '../utils/effects';
import { formatNum } from '../utils/format';
import { PART_LABELS, pct, RATE_LABELS } from '../utils/labels';

const items = ref<RoundSummaryDto[]>([]);
const next = ref<string | null>(null);
const buffs = ref<BuffsDto | null>(null);
const error = ref('');

const fmt = (key: string, v: number) =>
  RATE_LABELS[key]?.percent ? pct(v) : formatNum(Math.round(v * 100) / 100);

async function more() {
  try {
    const page = await endpoints.income(next.value ?? undefined);
    items.value.push(...page.items);
    next.value = page.nextBefore;
  } catch (e) {
    error.value = errorMessage(e, '读取收益失败');
  }
}
onMounted(async () => {
  await more();
  buffs.value = await endpoints.buffs().catch(() => null);
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <h6>加成分项（最近一轮）</h6>
  <div v-if="buffs?.rates" class="small mb-3">
    <div v-for="(meta, key) in RATE_LABELS" :key="key" class="mb-1">
      <template v-if="buffs.rates[key]">
        <b>{{ meta.label }} {{ fmt(key, buffs.rates[key]!.total) }}</b>
        <span v-for="(v, p) in buffs.rates[key]!.parts" :key="p" class="dt-tag ms-1">
          {{ PART_LABELS[p] ?? p }} {{ fmt(key, v) }}
        </span>
      </template>
    </div>
    <div v-if="buffs.seated !== null" class="text-muted">上座桌数 {{ buffs.seated }}</div>
  </div>
  <div v-else class="text-muted small mb-3">还没有结算过</div>
  <h6>加成来源</h6>
  <ul class="list-unstyled small">
    <li v-for="s in buffs?.sources ?? []" :key="`${s.sourceType}-${s.sourceId}`">
      <b>{{ s.name }}</b> {{ describeEffects(s.effects) }}
    </li>
  </ul>
  <h6>收益记录</h6>
  <table class="table table-sm small">
    <thead>
      <tr>
        <th>时间</th>
        <th>银币</th>
        <th>经验</th>
        <th>耗油</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in items" :key="r.roundNo">
        <td>{{ new Date(r.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</td>
        <td>{{ formatNum(r.coin) }}</td>
        <td>{{ formatNum(r.exp) }}</td>
        <td>{{ formatNum(r.oil) }}</td>
      </tr>
    </tbody>
  </table>
  <button v-if="next" class="btn btn-sm btn-outline-secondary w-100" @click="more">更早的记录</button>
</template>
