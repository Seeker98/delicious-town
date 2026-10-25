<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { RhythmDto, RhythmRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import AdmBox from './kit/AdmBox.vue';
import AdmEmpty from './kit/AdmEmpty.vue';

/**
 * 后台“可疑数据 → 操作节奏”（防脚本 2026-10-25）：最近 7 天按账号汇总，像机器的排前面，只作提醒。
 * 管理员能把账号加进、移出防脚本白名单（拦截模式下也不拦，照样记录）
 */
const props = defineProps<{ shardId: number }>();
const emit = defineEmits<{ ban: [{ kind: 'ip' | 'device'; value: string }] }>();
const admin = useAdminStore();
const toast = useToastStore();
const isAdmin = computed(() => admin.me?.role === 'admin');
const data = ref<RhythmDto | null>(null);
const loading = ref(false);
const busy = ref(false);

/** 打分规则（和服务端 rhythmScore 一致，原样写给协管看） */
const RULE =
  '分数 0~100 = 40 × min(每天有操作的小时数 ÷ 20, 1) + 20 × min(最长连续小时数 ÷ 12, 1) + 20 × (1 − 间隔变异系数, 样本不足按 0) + 10 × 没看页面的比例 + 10 × 很久没真人操作的比例。白名单的排在最后';

async function load() {
  loading.value = true;
  try {
    data.value = await adminApi.suspiciousRhythm(props.shardId);
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  } finally {
    loading.value = false;
  }
}
onMounted(() => void load());
watch(
  () => props.shardId,
  () => void load(),
);

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** 只显示没通过的签名结论 */
const badVerdicts = (r: RhythmRow) =>
  Object.entries(r.verdicts)
    .filter(([k, n]) => k !== 'ok' && n > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join('、');

function toBan(r: RhythmRow) {
  if (r.lastDevice) emit('ban', { kind: 'device', value: r.lastDevice });
  else if (r.lastIp) emit('ban', { kind: 'ip', value: r.lastIp });
}

async function white(r: RhythmRow) {
  const note = window.prompt(`把 ${r.username} 加进防脚本白名单, 备注（比如“自己的号”）`)?.trim();
  if (note === undefined) return;
  await run(() => adminApi.antibotWhitelist({ accountId: r.accountId, note }));
}
async function unwhite(accountId: number) {
  await run(() => adminApi.antibotUnwhitelist({ accountId }));
}
async function run(fn: () => Promise<unknown>) {
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '操作失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AdmBox title="操作节奏" :sub="`最近 7 天, 写操作 20 次以上的账号。${RULE}`" flush>
    <AdmEmpty v-if="loading && !data" title="加载中…" />
    <AdmEmpty v-else-if="!data || data.rows.length === 0" title="没有数据" />
    <div v-else class="dt-adm-scroll">
      <table class="dt-adm-table">
        <thead>
          <tr>
            <th>账号（店）</th>
            <th class="num">分数</th>
            <th class="num">天数</th>
            <th class="num">每天几小时</th>
            <th class="num">最长连续小时</th>
            <th class="num">凌晨 2~7 点</th>
            <th class="num">写操作（连点）</th>
            <th class="num">间隔变异系数</th>
            <th class="num">没看页面</th>
            <th class="num">很久没真人操作</th>
            <th>签名没通过</th>
            <th class="num">标识 / 设备</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in data.rows"
            :key="r.accountId"
            :class="{ 'is-bad': !r.whitelisted && r.score >= 60 }"
            data-testid="rhythm-row"
          >
            <td>
              <RouterLink :to="`/admin/players/${r.accountId}`">{{ r.username }}</RouterLink>
              <span v-if="r.restName" class="dt-adm-mu">（{{ r.restName }}）</span>
              <span v-if="r.whitelisted" class="dt-adm-mu"> 白名单</span>
            </td>
            <td class="num">{{ r.score }}</td>
            <td class="num">{{ r.days }}</td>
            <td class="num">{{ r.activeHoursPerDay }}</td>
            <td class="num">{{ r.longestStreakHours }}</td>
            <td class="num">{{ formatNum(r.nightPosts) }}</td>
            <td class="num">{{ formatNum(r.posts) }}（{{ formatNum(r.bursts) }}）</td>
            <td class="num">{{ r.gapCv ?? '–' }}</td>
            <td class="num">{{ pct(r.noViewShare) }}</td>
            <td class="num">{{ pct(r.idleShare) }}</td>
            <td class="dt-adm-small">{{ badVerdicts(r) || '–' }}</td>
            <td class="num">{{ r.uas }} / {{ r.devices }}</td>
            <td class="nowrap">
              <button
                v-if="r.lastDevice || r.lastIp"
                type="button"
                class="dt-adm-btn is-t is-sm"
                :data-testid="`rhythm-ban-${r.accountId}`"
                @click="toBan(r)"
              >
                去封禁
              </button>
              <template v-if="isAdmin">
                <button
                  v-if="r.whitelisted"
                  type="button"
                  class="dt-adm-btn is-t is-sm"
                  :disabled="busy"
                  :data-testid="`rhythm-unwhite-${r.accountId}`"
                  @click="unwhite(r.accountId)"
                >
                  移出白名单
                </button>
                <button
                  v-else
                  type="button"
                  class="dt-adm-btn is-t is-sm"
                  :disabled="busy"
                  :data-testid="`rhythm-white-${r.accountId}`"
                  @click="white(r)"
                >
                  加白名单
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </AdmBox>
</template>
