<script setup lang="ts">
import { adminShort } from '../../utils/gameInput';
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type {
  SuspiciousAcquireRow,
  SuspiciousApiDto,
  SuspiciousBarRow,
  SuspiciousMultiGroup,
  SuspiciousRedeemRow,
  SuspiciousSurgeDto,
  SuspiciousSurgeRow,
} from '@dt/shared';
import { adminApi } from '../../api/admin';
import ExchangeGuardPanel from '../../components/admin/ExchangeGuardPanel.vue';
import ExchangeMakerPanel from '../../components/admin/ExchangeMakerPanel.vue';
import AccessBanPanel from '../../components/admin/AccessBanPanel.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import AdmTabs from '../../components/admin/kit/AdmTabs.vue';

/** 可疑数据（子项目 6B-2，设计 §5）：只读，只作提醒 */
type Tab = 'bar' | 'surge' | 'multi' | 'api' | 'bans' | 'redeem' | 'exchange' | 'acquire';
const TABS: Array<[Tab, string]> = [
  ['bar', '酒吧'],
  ['surge', '资源暴涨'],
  ['multi', '多号'],
  ['api', '接口调用'],
  ['bans', '封禁名单'],
  ['redeem', '兑换码被锁'],
  ['exchange', '交易所'],
  ['acquire', '收购拦截'],
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
const acquire = ref<SuspiciousAcquireRow[]>([]);
const apiCalls = ref<SuspiciousApiDto | null>(null);
const loading = ref(false);
/** 多号里点“封禁”：切到封禁名单、把 IP 或设备号填好（2026-10-16） */
const banPrefill = ref<{ kind: 'ip' | 'device'; value: string } | null>(null);
function banGroup(g: SuspiciousMultiGroup) {
  banPrefill.value = { kind: g.kind, value: g.key };
  tab.value = 'bans';
}
/** 请求序号：快速切换区服或标签时，丢弃先发出、后回来的旧响应（backlog 6B-2） */
let seq = 0;

async function load() {
  const shardId = admin.shardId;
  if (!shardId) return;
  const my = ++seq;
  const fresh = () => my === seq;
  loading.value = true;
  try {
    if (tab.value === 'bar') {
      const r = await adminApi.suspiciousBar(shardId);
      if (fresh()) bar.value = r;
    } else if (tab.value === 'surge') {
      const r = await adminApi.suspiciousSurge(shardId, day.value || undefined);
      if (fresh()) surge.value = r;
    } else if (tab.value === 'multi') {
      const r = await adminApi.suspiciousMulti(shardId);
      if (fresh()) multi.value = r;
    } else if (tab.value === 'api') {
      const r = await adminApi.suspiciousApi(shardId);
      if (fresh()) apiCalls.value = r;
    } else if (tab.value === 'redeem') {
      const r = await adminApi.suspiciousRedeem(shardId);
      if (fresh()) redeem.value = r;
    } else if (tab.value === 'acquire') {
      const r = await adminApi.suspiciousAcquire(shardId);
      if (fresh()) acquire.value = r;
    }
    // 交易所、封禁名单标签由 ExchangeGuardPanel、AccessBanPanel 自己读取（156-2；2026-10-16）
  } catch (e) {
    if (fresh()) toast.push(errorMessage(e, '读取失败'), 'danger');
  } finally {
    if (fresh()) loading.value = false;
  }
}
onMounted(() => void load());
watch([tab, day, () => admin.shardId], () => void load());

const sources = (r: SuspiciousSurgeRow) =>
  r.topSources.map((s) => `${s.source} ${s.delta >= 0 ? '+' : ''}${formatNum(s.delta)}`).join('、');
const player = (accountId: number) => `/admin/players/${accountId}`;
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead title="可疑数据" desc="只作提醒, 不能单凭这里处罚。同一宿舍、网吧的人会共用 IP。" />
    <div class="dt-adm-box">
      <AdmTabs v-model="tab" :options="TABS" testid="sus-tab" />
    </div>

    <template v-if="tab === 'exchange'">
      <ExchangeGuardPanel />
      <ExchangeMakerPanel />
    </template>
    <!-- 封禁名单不分区服（2026-10-16） -->
    <AccessBanPanel v-else-if="tab === 'bans'" :prefill="banPrefill" />

    <AdmBox
      v-else-if="tab === 'bar'"
      title="酒吧"
      sub="最近 7 个游戏日; 单日超过门槛的标红（门槛在区服数值 tuning.ops.suspicious）"
      flush
    >
      <AdmEmpty v-if="loading" title="加载中…" />
      <AdmEmpty v-else-if="bar.length === 0" title="没有数据" />
      <div v-else class="dt-adm-scroll">
        <table class="dt-adm-table">
          <thead>
            <tr>
              <th>店</th>
              <th class="num">记忆调酒全过（7 天 / 单日最高）</th>
              <th class="num">飞镖 50 分（7 天 / 单日最高）</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in bar"
              :key="r.restId"
              :class="{ 'is-bad': r.flagged }"
              :data-testid="`sus-bar-${r.restId}`"
            >
              <td>
                <RouterLink :to="player(r.accountId)">{{ r.restName }}</RouterLink>
                <span class="dt-adm-mu"> ({{ r.username }})</span>
                <span v-if="r.flagged" class="dt-adm-tag is-d ms-1">超过门槛</span>
              </td>
              <td class="num">{{ r.perfectSum }} / {{ r.perfectMax }}</td>
              <td class="num">{{ r.bullSum }} / {{ r.bullMax }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdmBox>

    <template v-else-if="tab === 'surge'">
      <div class="dt-adm-fbar">
        <input v-model="day" type="date" class="dt-adm-in" aria-label="游戏日" data-testid="sus-day" />
        <span class="dt-adm-mu dt-adm-small"
          >含结算收入（结算明细只留 3 天, 更早的日期只有流水部分）; 不选就是昨天{{
            surge ? ` · 当前 ${surge.day}` : ''
          }}</span
        >
      </div>
      <AdmBox v-if="loading" flush><AdmEmpty title="加载中…" /></AdmBox>
      <div v-else-if="surge" class="dt-adm-g3">
        <AdmBox v-for="[k, label] in SURGE" :key="k" :title="`${label}净增`" flush>
          <AdmEmpty v-if="surge[k].length === 0" title="没有数据" />
          <table v-else class="dt-adm-table">
            <tbody>
              <tr v-for="r in surge[k]" :key="r.restId">
                <td>
                  <RouterLink :to="player(r.accountId)">{{ r.restName }}</RouterLink>
                  <span class="dt-adm-mu"> ({{ r.username }})</span>
                  <div class="dt-adm-mu dt-adm-small">{{ sources(r) }}</div>
                </td>
                <td class="num">{{ formatNum(r.net) }}</td>
              </tr>
            </tbody>
          </table>
        </AdmBox>
      </div>
    </template>

    <AdmBox
      v-else-if="tab === 'multi'"
      title="多账号"
      sub="最近 30 天同一 IP 或同一设备登录过多个账号（至少一个在本区服有店）"
      flush
    >
      <AdmEmpty v-if="loading" title="加载中…" />
      <AdmEmpty v-else-if="multi.length === 0" title="没有数据" />
      <div v-for="g in loading ? [] : multi" :key="`${g.kind}-${g.key}`" class="dt-adm-group">
        <div class="dt-adm-group-h">
          <b
            >{{ g.kind === 'ip' ? '同一 IP' : '同一设备' }}：<span class="dt-adm-mono">{{ g.key }}</span></b
          >
          <button
            v-if="admin.isAdmin"
            type="button"
            class="dt-adm-btn is-d is-sm ms-2"
            :data-testid="`sus-multi-ban-${g.kind}-${g.key}`"
            @click="banGroup(g)"
          >
            封禁…
          </button>
          <!-- 账号太多时服务端只列最近的一部分（backlog 6B-2） -->
          <span v-if="g.total > g.accounts.length" class="dt-adm-mu dt-adm-small"
            >共 {{ g.total }} 个账号，只列最近 {{ g.accounts.length }} 个</span
          >
        </div>
        <div v-for="a in g.accounts" :key="a.accountId" data-testid="sus-multi-account">
          <RouterLink :to="player(a.accountId)">{{ a.username }}</RouterLink>
          <span class="dt-adm-mu">
            · {{ a.restName ?? '本区没有店' }} · 最近 {{ adminShort(a.lastSeen) }}</span
          >
        </div>
      </div>
    </AdmBox>

    <template v-else-if="tab === 'api'">
      <AdmBox
        title="开放接口"
        sub="最近 7 个游戏日, 按 IP、浏览器标识、来源网页合计。本站资料库的请求一定带 lang, 没带的多半是脚本; 来源为空是脚本或直接打开"
        flush
      >
        <AdmEmpty v-if="loading" title="加载中…" />
        <AdmEmpty v-else-if="!apiCalls || apiCalls.open.length === 0" title="没有数据" />
        <div v-else class="dt-adm-scroll">
          <table class="dt-adm-table">
            <thead>
              <tr>
                <th>IP</th>
                <th>浏览器标识</th>
                <th>来源网页</th>
                <th class="num">次数（没带 lang）</th>
                <th>最近</th>
                <th>这个 IP 上的账号</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(r, i) in apiCalls.open"
                :key="i"
                :class="{ 'is-bad': r.noLang > 0 }"
                :data-testid="`sus-api-open-${i}`"
              >
                <td class="dt-adm-mono">{{ r.ip }}</td>
                <td class="dt-adm-small">{{ r.userAgent || '（没有）' }}</td>
                <td class="dt-adm-small">{{ r.origin || '（没有）' }}</td>
                <td class="num">{{ formatNum(r.n) }} ({{ formatNum(r.noLang) }})</td>
                <td class="dt-adm-mu nowrap">{{ adminShort(r.lastSeen) }}</td>
                <td>
                  <template v-for="(a, j) in r.accounts" :key="a.accountId"
                    ><span v-if="j > 0">、</span
                    ><RouterLink :to="player(a.accountId)">{{ a.username }}</RouterLink></template
                  >
                  <span v-if="r.accounts.length === 0" class="dt-adm-mu">–</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </AdmBox>
      <AdmBox
        title="没带设备号的游戏请求"
        sub="最近 30 天; 网页客户端每个请求都带设备号, 没带的是脚本或别的程序。同一账号、IP 每小时记一次"
        flush
      >
        <AdmEmpty v-if="loading" title="加载中…" />
        <AdmEmpty v-else-if="!apiCalls || apiCalls.bare.length === 0" title="没有数据" />
        <div v-else class="dt-adm-scroll">
          <table class="dt-adm-table">
            <thead>
              <tr>
                <th>账号</th>
                <th>IP</th>
                <th>浏览器标识</th>
                <th>第一次</th>
                <th>最近</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in apiCalls.bare" :key="i" :data-testid="`sus-api-bare-${i}`">
                <td>
                  <RouterLink :to="player(r.accountId)">{{ r.username }}</RouterLink>
                  <span class="dt-adm-mu"> · {{ r.restName ?? '本区没有店' }}</span>
                </td>
                <td class="dt-adm-mono">{{ r.ip }}</td>
                <td class="dt-adm-small">{{ r.userAgent ?? '（之前没记）' }}</td>
                <td class="dt-adm-mu nowrap">{{ adminShort(r.firstSeen) }}</td>
                <td class="dt-adm-mu nowrap">{{ adminShort(r.lastSeen) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </AdmBox>
    </template>

    <AdmBox
      v-else-if="tab === 'acquire'"
      title="收购拦截"
      sub="收购时和目标店（或它的老板）近 30 天共用过设备或 IP, 被拦下的记录; 留 30 天, 最多列 200 条"
      flush
    >
      <AdmEmpty v-if="loading" title="加载中…" />
      <AdmEmpty v-else-if="acquire.length === 0" title="没有拦截记录" />
      <div v-else class="dt-adm-scroll">
        <table class="dt-adm-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>买家</th>
              <th>目标店</th>
              <th>原因</th>
              <th>关联账号</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in acquire" :key="i" :data-testid="`sus-acquire-${i}`">
              <td class="dt-adm-mu nowrap">{{ adminShort(r.at) }}</td>
              <td>
                <RouterLink :to="player(r.buyer.accountId)">{{ r.buyer.name }}</RouterLink>
              </td>
              <td>
                <RouterLink :to="player(r.target.accountId)">{{ r.target.name }}</RouterLink>
              </td>
              <td>
                <span class="dt-adm-tag is-w">{{ r.reason === 'device' ? '共用设备' : '共用 IP' }}</span>
              </td>
              <td>
                <RouterLink v-if="r.linked" :to="player(r.linked.accountId)">{{
                  r.linked.username
                }}</RouterLink>
                <span v-else class="dt-adm-mu">–</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdmBox>

    <AdmBox v-else-if="tab === 'redeem'" title="兑换码输错" sub="输错次数按账号计, 不分区服" flush>
      <AdmEmpty v-if="loading" title="加载中…" />
      <AdmEmpty v-else-if="redeem.length === 0" title="没有被锁的账号" />
      <table v-else class="dt-adm-table">
        <thead>
          <tr>
            <th>账号</th>
            <th class="num">输错次数</th>
            <th class="num">还要锁</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in redeem" :key="r.accountId">
            <td>
              <RouterLink :to="player(r.accountId)">{{ r.username }}</RouterLink>
            </td>
            <td class="num">{{ r.fails }}</td>
            <td class="num">{{ Math.ceil(r.ttlSec / 60) }} 分钟</td>
          </tr>
        </tbody>
      </table>
    </AdmBox>
  </div>
</template>
