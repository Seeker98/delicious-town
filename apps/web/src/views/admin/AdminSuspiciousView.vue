<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type {
  SuspiciousBarRow,
  SuspiciousMultiGroup,
  SuspiciousRedeemRow,
  SuspiciousSurgeDto,
  SuspiciousSurgeRow,
} from '@dt/shared';
import { adminApi } from '../../api/admin';
import ExchangeGuardPanel from '../../components/admin/ExchangeGuardPanel.vue';
import ExchangeMakerPanel from '../../components/admin/ExchangeMakerPanel.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

/** 可疑数据（子项目 6B-2，设计 §5）：只读，只作提醒 */
type Tab = 'bar' | 'surge' | 'multi' | 'redeem' | 'exchange';
const TABS: Array<[Tab, string]> = [
  ['bar', '酒吧'],
  ['surge', '资源暴涨'],
  ['multi', '多号'],
  ['redeem', '兑换码被锁'],
  ['exchange', '交易所'],
];
const SURGE: Array<['coin' | 'diamond' | 'exp', string]> = [
  ['coin', '银币'],
  ['diamond', '钻石'],
  ['exp', '经验'],
];
const admin = useAdminStore();
const toast = useToastStore();
const tab = ref<Tab>('bar');
const day = ref('');
const bar = ref<SuspiciousBarRow[]>([]);
const surge = ref<SuspiciousSurgeDto | null>(null);
const multi = ref<SuspiciousMultiGroup[]>([]);
const redeem = ref<SuspiciousRedeemRow[]>([]);
const loading = ref(false);

async function load() {
  const shardId = admin.shardId;
  if (!shardId) return;
  loading.value = true;
  try {
    if (tab.value === 'bar') bar.value = await adminApi.suspiciousBar(shardId);
    else if (tab.value === 'surge')
      surge.value = await adminApi.suspiciousSurge(shardId, day.value || undefined);
    else if (tab.value === 'multi') multi.value = await adminApi.suspiciousMulti(shardId);
    else if (tab.value === 'redeem') redeem.value = await adminApi.suspiciousRedeem(shardId);
    // 交易所标签由 ExchangeGuardPanel 自己读取（156-2）
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  } finally {
    loading.value = false;
  }
}
onMounted(() => void load());
watch([tab, day, () => admin.shardId], () => void load());

const sources = (r: SuspiciousSurgeRow) =>
  r.topSources.map((s) => `${s.source} ${s.delta >= 0 ? '+' : ''}${formatNum(s.delta)}`).join('、');
const player = (accountId: number) => `/admin/players/${accountId}`;
</script>

<template>
  <h5>可疑数据</h5>
  <p class="small text-muted">只作提醒，不能单凭这里处罚。同一宿舍、网吧的人会共用 IP。</p>
  <ul class="nav nav-tabs mb-2">
    <li v-for="[k, label] in TABS" :key="k" class="nav-item">
      <button
        type="button"
        :class="['nav-link', { active: tab === k }]"
        :data-testid="`sus-tab-${k}`"
        @click="tab = k"
      >
        {{ label }}
      </button>
    </li>
  </ul>

  <ExchangeGuardPanel v-if="tab === 'exchange'" />
  <ExchangeMakerPanel v-if="tab === 'exchange'" />
  <template v-if="tab === 'bar'">
    <p class="small text-muted">
      最近 7 个游戏日；单日超过门槛的标红（门槛在区服数值 tuning.ops.suspicious）。
    </p>
    <div v-if="bar.length === 0" class="dt-empty">没有数据</div>
    <table v-else class="table table-sm small">
      <thead>
        <tr>
          <th>店</th>
          <th>记忆调酒全过（7 天 / 单日最高）</th>
          <th>飞镖 50 分（7 天 / 单日最高）</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in bar"
          :key="r.restId"
          :class="{ 'table-danger': r.flagged }"
          :data-testid="`sus-bar-${r.restId}`"
        >
          <td>
            <RouterLink :to="player(r.accountId)">{{ r.restName }}（{{ r.username }}）</RouterLink>
          </td>
          <td>{{ r.perfectSum }} / {{ r.perfectMax }}</td>
          <td>{{ r.bullSum }} / {{ r.bullMax }}</td>
        </tr>
      </tbody>
    </table>
  </template>

  <template v-else-if="tab === 'surge'">
    <div class="d-flex align-items-center gap-2 mb-2 small">
      <label
        >游戏日
        <input
          v-model="day"
          type="date"
          class="form-control form-control-sm d-inline-block w-auto"
          data-testid="sus-day"
      /></label>
      <span class="text-muted"
        >含结算收入（结算明细只留 3 天，更早的日期只有流水部分）；不选就是昨天{{
          surge ? `（当前：${surge.day}）` : ''
        }}</span
      >
    </div>
    <template v-if="surge">
      <div v-for="[k, label] in SURGE" :key="k" class="mb-3">
        <h6>{{ label }}净增</h6>
        <div v-if="surge[k].length === 0" class="dt-empty">没有数据</div>
        <table v-else class="table table-sm small">
          <tbody>
            <tr v-for="r in surge[k]" :key="r.restId">
              <td>
                <RouterLink :to="player(r.accountId)">{{ r.restName }}（{{ r.username }}）</RouterLink>
              </td>
              <td class="text-end">{{ formatNum(r.net) }}</td>
              <td class="text-muted">{{ sources(r) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </template>

  <template v-else-if="tab === 'multi'">
    <p class="small text-muted">最近 30 天同一 IP 或同一设备登录过多个账号（至少一个在本区服有店）。</p>
    <div v-if="multi.length === 0" class="dt-empty">没有数据</div>
    <div v-for="g in multi" :key="`${g.kind}-${g.key}`" class="dt-card small mb-2">
      <div class="fw-bold mb-1">{{ g.kind === 'ip' ? '同一 IP' : '同一设备' }}：{{ g.key }}</div>
      <div v-for="a in g.accounts" :key="a.accountId" data-testid="sus-multi-account">
        <RouterLink :to="player(a.accountId)">{{ a.username }}</RouterLink>
        <span class="text-muted">
          · {{ a.restName ?? '本区没有店' }} · 最近 {{ new Date(a.lastSeen).toLocaleString('zh-CN') }}</span
        >
      </div>
    </div>
  </template>

  <template v-else>
    <p class="small text-muted">兑换码输错次数按账号计，不分区服。</p>
    <div v-if="redeem.length === 0" class="dt-empty">没有被锁的账号</div>
    <table v-else class="table table-sm small">
      <thead>
        <tr>
          <th>账号</th>
          <th>输错次数</th>
          <th>还要锁</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in redeem" :key="r.accountId">
          <td>
            <RouterLink :to="player(r.accountId)">{{ r.username }}</RouterLink>
          </td>
          <td>{{ r.fails }}</td>
          <td>{{ Math.ceil(r.ttlSec / 60) }} 分钟</td>
        </tr>
      </tbody>
    </table>
  </template>
</template>
