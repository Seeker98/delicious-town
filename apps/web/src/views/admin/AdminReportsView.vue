<script setup lang="ts">
import { adminTime } from '../../utils/gameInput';
import { computed, onMounted, ref, watch } from 'vue';
import {
  REPORT_REASON_NAMES,
  REPORT_TARGET_NAMES,
  type ReportCaseDto,
  type ReportDetailDto,
  type ReportStatus,
} from '@dt/shared';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import AdmSeg from '../../components/admin/kit/AdmSeg.vue';
import { useConfirmStore } from '../../stores/confirm';

/** 后台举报（子项目 6B-1）：按案子处理或驳回，处理可同时封号 */
const admin = useAdminStore();
const toast = useToastStore();
const confirm = useConfirmStore();
const status = ref<ReportStatus>('open');
const list = ref<ReportCaseDto[]>([]);
const open = ref<ReportDetailDto | null>(null);
const note = ref('');
const banDays = ref<'' | 0 | 1 | 7>('');
const newName = ref('');
const busy = ref(false);

const STATUS: Record<ReportStatus, string> = { open: '待处理', resolved: '已处理', rejected: '已驳回' };
const STATUSES = Object.entries(STATUS) as Array<[ReportStatus, string]>;
const ACTION: Record<string, string> = { delete: '删除', clear: '清空', rename: '改名', none: '无操作' };
const DO: Record<string, string> = {
  post: '删除这篇帖子',
  reply: '删除这条回复',
  broadcast: '撤下这条喇叭',
  notice: '清空这家店的公告',
  rest_name: '强制改这家店的店名',
};
const when = (s: string | null) => (s ? adminTime(s) : '');
const short = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}…` : s);

async function load() {
  try {
    list.value = await adminApi.reports({ shardId: admin.shardId ?? undefined, status: status.value });
  } catch (e) {
    toast.push(errorMessage(e, '读取举报失败'), 'danger');
  }
}
onMounted(() => void load());
watch([status, () => admin.shardId], () => {
  open.value = null;
  void load();
});

async function show(c: ReportCaseDto) {
  if (open.value?.id === c.id) {
    open.value = null;
    return;
  }
  try {
    open.value = await adminApi.report(c.id);
    note.value = '';
    banDays.value = '';
    newName.value = '';
  } catch (e) {
    toast.push(errorMessage(e, '读取详情失败'), 'danger');
  }
}

/** 当前内容和快照对比：没了写"已删除"，变了写"已改" */
const currentText = computed(() => {
  const d = open.value;
  if (!d) return '';
  if (d.current === null) return '已删除';
  return d.current === d.snapshot ? d.current : `（已改）${d.current}`;
});

async function done(
  fn: () => Promise<unknown>,
  ok: string,
  fail: string,
  explain?: (e: unknown) => string | null,
) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    open.value = null;
    await load();
  } catch (e) {
    toast.push(explain?.(e) ?? errorMessage(e, fail), 'danger');
  } finally {
    busy.value = false;
  }
}
/** 改名撞名（backlog 6B-1）：没填新名时用的是默认名"餐厅{id}"，要告诉管理员是哪个名字、该怎么办 */
function nameTaken(e: unknown, typed: boolean): string | null {
  if (!(e instanceof ApiError) || e.code !== 'RESTAURANT_NAME_TAKEN' || typeof e.params.name !== 'string')
    return null;
  return typed
    ? `店名「${e.params.name}」已被别的餐厅占用，换一个`
    : `店名「${e.params.name}」已被别的餐厅占用，请在"新店名"里填一个`;
}

async function resolve() {
  const d = open.value;
  if (!d || !note.value.trim()) return;
  const ban =
    banDays.value === '' ? '' : banDays.value === 0 ? '，并永久封号' : `，并封号 ${banDays.value} 天`;
  // 内容已经不在：不会清空或删除，只记录违规（backlog 6B-1）
  const doText = d.current === null ? '内容已不在，只记录违规' : DO[d.targetType];
  const ok = await confirm.ask({
    title: '处理这件举报？',
    body: `${doText}${ban}。`,
    ok: '处理',
    danger: true,
  });
  if (!ok) return;
  const name = newName.value.trim();
  void done(
    () =>
      adminApi.resolveReport(d.id, {
        note: note.value.trim(),
        ...(banDays.value === '' ? {} : { banDays: banDays.value }),
        ...(d.targetType === 'rest_name' && name ? { newName: name } : {}),
      }),
    '已处理',
    '处理失败',
    (e) => nameTaken(e, name !== ''),
  );
}

function reject() {
  const d = open.value;
  if (!d || !note.value.trim()) return;
  void done(() => adminApi.rejectReport(d.id, { note: note.value.trim() }), '已驳回', '驳回失败');
}
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead title="举报" desc="玩家举报的店名、公告、帖子; 同一样东西的举报合成一件, 点一行展开处理" />
    <div class="dt-adm-fbar">
      <AdmSeg v-model="status" :options="STATUSES" testid="report-status" />
      <span class="dt-adm-fbar-r">{{ list.length }} 件</span>
    </div>
    <AdmBox flush>
      <AdmEmpty v-if="list.length === 0" :title="`没有${STATUS[status]}的举报`" />
      <div v-else class="dt-adm-scroll">
        <table class="dt-adm-table">
          <thead>
            <tr>
              <th>类型</th>
              <th>内容</th>
              <th>被举报</th>
              <th class="num">人数</th>
              <th>{{ status === 'open' ? '举报时间（最早 – 最近）' : '处理' }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="c in list" :key="c.id">
              <tr
                :class="['is-link', { 'is-hl': open?.id === c.id }]"
                :data-testid="`report-row-${c.id}`"
                @click="show(c)"
              >
                <td class="nowrap">
                  <span class="dt-adm-tag is-w">{{ REPORT_TARGET_NAMES[c.targetType] }}</span>
                </td>
                <td class="dt-adm-break">{{ short(c.snapshot) }}</td>
                <td>
                  {{ c.targetRestName }} <span class="dt-adm-mu">({{ c.targetUsername }})</span>
                </td>
                <td class="num">{{ c.reporterCount }}</td>
                <td class="dt-adm-mu">
                  <template v-if="status === 'open'">{{
                    c.createdAt === c.updatedAt
                      ? when(c.updatedAt)
                      : `${when(c.createdAt)} – ${when(c.updatedAt)}`
                  }}</template>
                  <template v-else>
                    {{ c.handledBy }} · {{ ACTION[c.action ?? 'none']
                    }}{{
                      c.banDays === null ? '' : c.banDays === 0 ? ' · 永久封号' : ` · 封 ${c.banDays} 天`
                    }}
                  </template>
                </td>
              </tr>
              <tr v-if="open && open.id === c.id" class="dt-adm-report">
                <td colspan="5">
                  <dl class="dt-adm-report-dl">
                    <dt>举报时的内容</dt>
                    <dd class="dt-adm-pre">{{ open.snapshot }}</dd>
                    <dt>现在的内容</dt>
                    <dd class="dt-adm-pre">{{ currentText }}</dd>
                    <dt>以前</dt>
                    <dd class="dt-adm-mu">这个账号以前被处理过 {{ open.priorCases }} 次</dd>
                    <dt>谁举报的</dt>
                    <dd>
                      <div v-for="(e, i) in open.entries" :key="i">
                        {{ e.restName }} · {{ REPORT_REASON_NAMES[e.reason]
                        }}{{ e.detail ? `: ${e.detail}` : '' }}
                        <span class="dt-adm-mu">· {{ when(e.createdAt) }}</span>
                      </div>
                    </dd>
                    <template v-if="open.note">
                      <dt>处理说明</dt>
                      <dd>{{ open.note }}</dd>
                    </template>
                  </dl>
                  <div v-if="open.status === 'open'" class="dt-adm-line dt-adm-mt">
                    <input
                      v-model="note"
                      class="dt-adm-in dt-adm-grow"
                      maxlength="200"
                      placeholder="处理说明 (必填, 会写进给被处理人的邮件)"
                      data-testid="report-note"
                    />
                    <input
                      v-if="open.targetType === 'rest_name'"
                      v-model="newName"
                      class="dt-adm-in dt-adm-w-md"
                      maxlength="32"
                      :placeholder="`新店名 (默认 餐厅${open.targetRestId})`"
                      data-testid="report-new-name"
                    />
                    <select v-model="banDays" class="dt-adm-in" data-testid="report-ban">
                      <option value="">不封号</option>
                      <option :value="1">封 1 天</option>
                      <option :value="7">封 7 天</option>
                      <option v-if="admin.isAdmin" :value="0">永久封号</option>
                    </select>
                    <button
                      type="button"
                      class="dt-adm-btn is-d"
                      :disabled="busy || !note.trim()"
                      data-testid="report-resolve"
                      @click="resolve"
                    >
                      处理…
                    </button>
                    <button
                      type="button"
                      class="dt-adm-btn is-s"
                      :disabled="busy || !note.trim()"
                      data-testid="report-reject"
                      @click="reject"
                    >
                      驳回
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </AdmBox>
  </div>
</template>
