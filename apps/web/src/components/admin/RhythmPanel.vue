<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { RhythmDto, RhythmRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { adminShort } from '../../utils/gameInput';
import AdmBox from './kit/AdmBox.vue';
import AdmEmpty from './kit/AdmEmpty.vue';

/**
 * 后台“可疑数据 → 操作节奏”（防脚本 2026-10-25）：最近 7 天按账号汇总，像机器的排前面，只作提醒。
 * 管理员能把账号加进、移出防脚本白名单（拦截模式下也不拦，照样记录）
 */
const props = defineProps<{ shardId: number }>();
/** multi：跳到“多号”标签、只看这个号所在的组 */
const emit = defineEmits<{ ban: [{ kind: 'ip' | 'device'; value: string }]; multi: [accountId: number] }>();
const admin = useAdminStore();
const toast = useToastStore();
const isAdmin = computed(() => admin.me?.role === 'admin');
const data = ref<RhythmDto | null>(null);
const loading = ref(false);
const busy = ref(false);
/** 按账号编号加白名单（自己的号、AI 工具的号活动少，不一定进得了节奏列表） */
const addId = ref('');
const addNote = ref('');

/** 打分规则（和服务端 rhythmScore 一致，原样写给协管看） */
const RULE =
  '分数 0~100 = 40 × min(每天有操作的小时数 ÷ 20, 1) + 20 × min(最长连续小时数 ÷ 12, 1) + 20 × (1 − 间隔变异系数, 样本不足按 0) + 10 × 没看页面的比例 + 10 × 很久没真人操作的比例。' +
  '客户端一列 (分数不看签名, 单独分): 裸接口: 写请求八成以上没签名、没带版本号, 写得少也列; 自动化浏览器: 浏览器自报被工具控制; 多半没有真人点击: 网页签了名, 但写操作时一半以上很久没有真人点击。分出来的排在最前, 白名单的排在最后';

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
/** 客户端分类（安全审计 D1）；看不出问题的不写 */
function clientLabel(r: RhythmRow): string {
  if (r.client === 'bare') return `裸接口 (没签名 ${pct(r.unsignedShare)})`;
  if (r.client === 'automation') return '自动化浏览器';
  if (r.client === 'idle') return '多半没有真人点击';
  return '–';
}
/** 只显示没通过的签名结论；读请求没带版本号的另写一项（人机验证结果单独一列） */
const badVerdicts = (r: RhythmRow) =>
  Object.entries(r.verdicts)
    .filter(([k, n]) => k !== 'ok' && !k.startsWith('captcha_') && n > 0)
    .map(([k, n]) => (k === 'get_no_build' ? `读请求没版本号 ${n}` : `${k} ${n}`))
    .join('、');
/** 被点名的号人机验证的结果：通过、没带令牌、没通过 */
function captchaOutcomes(r: RhythmRow): string {
  const v = r.verdicts;
  const [ok, missing, failed] = [v.captcha_ok ?? 0, v.captcha_missing ?? 0, v.captcha_failed ?? 0];
  return ok + missing + failed === 0 ? '' : `过 ${ok} · 没带 ${missing} · 没过 ${failed}`;
}
/** 白名单里的号：人机验证不生效 */
const whiteIds = computed(() => new Set(data.value?.whitelist.map((w) => w.accountId) ?? []));

function toBan(r: RhythmRow) {
  if (r.lastDevice) emit('ban', { kind: 'device', value: r.lastDevice });
  else if (r.lastIp) emit('ban', { kind: 'ip', value: r.lastIp });
}

async function white(r: RhythmRow) {
  const note = window.prompt(`把 ${r.username} 加进防脚本白名单, 备注（比如“自己的号”）`)?.trim();
  if (note === undefined) return;
  await run(() => adminApi.antibotWhitelist({ accountId: r.accountId, note }));
}
/** 要求人机验证（PR②）：只认 1、3、7 天，别的输入不提交；接着填备注，点取消不提交 */
async function challenge(r: RhythmRow) {
  const moot = r.whitelisted ? '（这个号在白名单里, 要先移出白名单验证才生效）' : '';
  const raw = window.prompt(`要求 ${r.username} 做人机验证, 持续几天（1、3、7）${moot}`)?.trim();
  const days = Number(raw);
  if (days !== 1 && days !== 3 && days !== 7) return;
  const note = window.prompt(`备注（比如“节奏像脚本”）`)?.trim();
  if (note === undefined) return;
  await run(() => adminApi.antibotChallenge({ accountId: r.accountId, days, note }));
}
async function unchallenge(accountId: number) {
  await run(() => adminApi.antibotUnchallenge({ accountId }));
}
async function unwhite(accountId: number) {
  await run(() => adminApi.antibotUnwhitelist({ accountId }));
}
async function addById() {
  const id = Number(addId.value);
  if (!Number.isInteger(id) || id <= 0) return toast.push('要填账号编号', 'danger');
  await run(() => adminApi.antibotWhitelist({ accountId: id, note: addNote.value.trim() }));
  addId.value = '';
  addNote.value = '';
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
            <th>客户端</th>
            <th class="num">天数</th>
            <th class="num">每天几小时</th>
            <th class="num">最长连续小时</th>
            <th class="num">凌晨 2~7 点</th>
            <th class="num">写操作（连点）</th>
            <th class="num">间隔变异系数</th>
            <th class="num">没看页面</th>
            <th class="num">很久没真人操作</th>
            <th>签名没通过</th>
            <th>人机验证</th>
            <th class="num">标识 / 设备 / IP</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in data.rows"
            :key="r.accountId"
            :class="{ 'is-bad': !r.whitelisted && (r.score >= 60 || r.client !== 'normal') }"
            data-testid="rhythm-row"
          >
            <td>
              <RouterLink :to="`/admin/players/${r.accountId}`">{{ r.username }}</RouterLink>
              <span v-if="r.restName" class="dt-adm-mu">（{{ r.restName }}）</span>
              <span v-if="r.whitelisted" class="dt-adm-mu"> 白名单</span>
            </td>
            <td class="num">{{ r.score }}</td>
            <td class="dt-adm-small nowrap" :data-testid="`rhythm-client-${r.accountId}`">
              {{ clientLabel(r) }}
            </td>
            <td class="num">{{ r.days }}</td>
            <td class="num">{{ r.activeHoursPerDay }}</td>
            <td class="num">{{ r.longestStreakHours }}</td>
            <td class="num">{{ formatNum(r.nightPosts) }}</td>
            <td class="num">{{ formatNum(r.posts) }}（{{ formatNum(r.bursts) }}）</td>
            <td class="num">{{ r.gapCv ?? '–' }}</td>
            <td class="num">{{ pct(r.noViewShare) }}</td>
            <td class="num">{{ pct(r.idleShare) }}</td>
            <td class="dt-adm-small">{{ badVerdicts(r) || '–' }}</td>
            <td class="dt-adm-small nowrap" :data-testid="`rhythm-captcha-${r.accountId}`">
              {{ captchaOutcomes(r) || '–' }}
            </td>
            <td class="num">{{ r.uas }} / {{ r.devices }} / {{ r.ips }}</td>
            <td class="nowrap">
              <button
                type="button"
                class="dt-adm-btn is-t is-sm"
                :data-testid="`rhythm-multi-${r.accountId}`"
                @click="emit('multi', r.accountId)"
              >
                看多号
              </button>
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
                <button
                  v-if="r.challengeUntil"
                  type="button"
                  class="dt-adm-btn is-t is-sm"
                  :disabled="busy"
                  :title="`验证到 ${adminShort(r.challengeUntil)}`"
                  :data-testid="`rhythm-unchallenge-${r.accountId}`"
                  @click="unchallenge(r.accountId)"
                >
                  取消验证
                </button>
                <button
                  v-else
                  type="button"
                  class="dt-adm-btn is-t is-sm"
                  :disabled="busy"
                  :data-testid="`rhythm-challenge-${r.accountId}`"
                  @click="challenge(r)"
                >
                  要求人机验证
                </button>
              </template>
              <span v-if="r.challengeUntil" class="dt-adm-mu dt-adm-small"
                >验证到 {{ adminShort(r.challengeUntil) }}</span
              >
              <span
                v-if="r.challengeUntil && r.whitelisted"
                class="dt-adm-mu dt-adm-small"
                data-testid="rhythm-wl-moot"
              >
                （白名单内, 不生效）</span
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </AdmBox>
  <AdmBox
    title="人机验证名单"
    sub="后台点名的号: 到期前写操作每隔一段时间要过一次人机验证（间隔见区服设置 ops.antibot.captchaEveryMin）"
    flush
  >
    <AdmEmpty v-if="!data || data.challenges.length === 0" title="名单是空的" />
    <div v-else class="dt-adm-scroll">
      <table class="dt-adm-table">
        <thead>
          <tr>
            <th>账号</th>
            <th>备注</th>
            <th>验证到</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in data.challenges" :key="c.accountId" data-testid="rhythm-ch-row">
            <td>
              <RouterLink :to="`/admin/players/${c.accountId}`">{{ c.username }}</RouterLink>
              <span class="dt-adm-mu">（#{{ c.accountId }}）</span>
              <span
                v-if="whiteIds.has(c.accountId)"
                class="dt-adm-mu dt-adm-small"
                data-testid="rhythm-wl-moot"
              >
                白名单内, 不生效</span
              >
            </td>
            <td>{{ c.note || '–' }}</td>
            <td class="dt-adm-mu nowrap">{{ adminShort(c.until) }}</td>
            <td>
              <button
                v-if="isAdmin"
                type="button"
                class="dt-adm-btn is-t is-sm"
                :disabled="busy"
                :data-testid="`rhythm-ch-remove-${c.accountId}`"
                @click="unchallenge(c.accountId)"
              >
                取消验证
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </AdmBox>
  <AdmBox title="防脚本白名单" sub="拦截模式下也不拦, 照样记录。用于自己的号、帮你干活的 AI 工具的号" flush>
    <AdmEmpty v-if="!data || data.whitelist.length === 0" title="白名单是空的" />
    <div v-else class="dt-adm-scroll">
      <table class="dt-adm-table">
        <thead>
          <tr>
            <th>账号</th>
            <th>备注</th>
            <th>加入时间</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="w in data.whitelist" :key="w.accountId" data-testid="rhythm-wl-row">
            <td>
              <RouterLink :to="`/admin/players/${w.accountId}`">{{ w.username }}</RouterLink>
              <span class="dt-adm-mu">（#{{ w.accountId }}）</span>
            </td>
            <td>{{ w.note || '–' }}</td>
            <td class="dt-adm-mu nowrap">{{ adminShort(w.at) }}</td>
            <td>
              <button
                v-if="isAdmin"
                type="button"
                class="dt-adm-btn is-t is-sm"
                :disabled="busy"
                :data-testid="`rhythm-wl-remove-${w.accountId}`"
                @click="unwhite(w.accountId)"
              >
                移出白名单
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="isAdmin" class="d-flex flex-wrap gap-2 p-3">
      <input
        v-model="addId"
        class="dt-adm-in dt-adm-mono"
        inputmode="numeric"
        placeholder="账号编号"
        aria-label="账号编号"
        data-testid="rhythm-wl-id"
      />
      <input
        v-model="addNote"
        class="dt-adm-in"
        placeholder="备注（比如“自己的号”）"
        aria-label="备注"
        data-testid="rhythm-wl-note"
      />
      <button
        type="button"
        class="dt-adm-btn is-s is-sm"
        :disabled="busy"
        data-testid="rhythm-wl-add"
        @click="addById"
      >
        加入白名单
      </button>
    </div>
  </AdmBox>
</template>
