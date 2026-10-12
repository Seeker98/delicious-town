<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AuditRowDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { ACTION_LABEL, actionTone } from '../../utils/adminLabels';
import { adminShort } from '../../utils/gameInput';

/**
 * 审计日志（界面改版 P12）：动作写中文并按类型着色（改数值红、处理举报琥珀、角色紫、其他灰）；
 * 详情 JSON 等宽一行省略，点一下展开看全文。默认看最近 7 天
 */
const toast = useToastStore();
const actor = ref('');
const action = ref('');
const days = ref<number | ''>(7);
const DAYS = [
  [1, '最近 1 天'],
  [7, '最近 7 天'],
  [30, '最近 30 天'],
  ['', '全部时间'],
] as const;
const rows = ref<AuditRowDto[]>([]);
const next = ref<string | null>(null);
const loaded = ref(false);
/** 展开了详情的行 */
const open = ref(new Set<number>());

async function load(reset: boolean) {
  try {
    const p = await adminApi.audit({
      actor: actor.value.trim() || undefined,
      action: action.value.trim() || undefined,
      days: days.value || undefined,
      before: reset ? undefined : (next.value ?? undefined),
    });
    rows.value = reset ? p.items : [...rows.value, ...p.items];
    next.value = p.nextBefore;
    if (reset) open.value = new Set();
  } catch (e) {
    toast.push(errorMessage(e, '读取审计日志失败'), 'danger');
  } finally {
    loaded.value = true;
  }
}
onMounted(() => void load(true));

function toggle(id: number) {
  const s = new Set(open.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  open.value = s;
}
const detailText = (r: AuditRowDto, full: boolean) =>
  r.detail === null || r.detail === undefined ? '—' : JSON.stringify(r.detail, null, full ? 1 : undefined);
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead title="审计日志" desc="后台和命令行的每一次操作" />
    <form class="dt-adm-fbar" @submit.prevent="load(true)">
      <input
        v-model="actor"
        class="dt-adm-in dt-adm-w-md"
        placeholder="操作人用户名"
        data-testid="audit-actor"
      />
      <select v-model="action" class="dt-adm-in dt-adm-w-md" data-testid="audit-action">
        <option value="">全部动作</option>
        <option v-for="(label, a) in ACTION_LABEL" :key="a" :value="a">{{ label }}</option>
      </select>
      <select v-model="days" class="dt-adm-in" data-testid="audit-days">
        <option v-for="[v, label] in DAYS" :key="label" :value="v">{{ label }}</option>
      </select>
      <button class="dt-adm-btn is-sp">筛选</button>
    </form>
    <AdmBox flush>
      <div class="dt-adm-scroll">
        <table v-if="rows.length > 0" class="dt-adm-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>操作人</th>
              <th>动作</th>
              <th>对象</th>
              <th>详情</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td class="dt-adm-mu nowrap">{{ adminShort(r.at) }}</td>
              <td>{{ r.actor ?? '命令行' }}</td>
              <td>
                <span :class="['dt-adm-tag', `is-${actionTone(r.action)}`]">{{
                  ACTION_LABEL[r.action] ?? r.action
                }}</span>
              </td>
              <td class="dt-adm-mono nowrap">{{ r.target ?? '—' }}</td>
              <td>
                <button
                  type="button"
                  :class="['dt-adm-code', { 'is-open': open.has(r.id) }]"
                  :aria-expanded="open.has(r.id)"
                  :title="open.has(r.id) ? '点一下收起' : '点一下看全文'"
                  :data-testid="`audit-detail-${r.id}`"
                  @click="toggle(r.id)"
                >
                  {{ detailText(r, open.has(r.id)) }}
                </button>
              </td>
              <td class="dt-adm-mono dt-adm-mu nowrap">{{ r.ip ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
        <AdmEmpty v-else-if="loaded" title="没有记录" text="换个筛选条件, 或者看更长的时间" />
      </div>
      <div v-if="next" class="dt-adm-more">
        <button type="button" class="dt-adm-btn is-s" data-testid="audit-more" @click="load(false)">
          再看 50 条
        </button>
      </div>
    </AdmBox>
  </div>
</template>
