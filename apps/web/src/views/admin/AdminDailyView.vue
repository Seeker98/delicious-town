<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { AdminDailyDetailDto, AdminDailyRowDto, DailyStatus } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { catalogNames, dailyParagraphs, dailyPlain } from '../../utils/daily';
import { formatNum } from '../../utils/format';

/** 后台小镇日报（2026-10-08）：先人工审核再发布；可以手改简中、英文，或者重新生成 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const rows = ref<AdminDailyRowDto[]>([]);
const cur = ref<AdminDailyDetailDto | null>(null);
const busy = ref(false);
const zh = ref({ title: '', body: '' });
const en = ref({ title: '', body: '' });
const STATUS: Record<DailyStatus, string> = {
  pending: '没生成',
  draft: '待审',
  published: '已发布',
  hidden: '已撤下',
};

async function load() {
  if (admin.shardId === null) return;
  try {
    rows.value = await adminApi.dailyList(admin.shardId);
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
function show(d: AdminDailyDetailDto) {
  cur.value = d;
  zh.value = { ...(d.content?.['zh-CN'] ?? { title: '', body: '' }) };
  en.value = { ...(d.content?.en ?? { title: '', body: '' }) };
}
async function open(r: AdminDailyRowDto) {
  try {
    show(await adminApi.dailyGet(r.shardId, r.day));
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
async function run(fn: (shardId: number, day: string) => Promise<AdminDailyDetailDto>, ok: string) {
  const d = cur.value;
  if (!d || busy.value) return;
  busy.value = true;
  try {
    show(await fn(d.shardId, d.day));
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '操作失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
const save = () =>
  run((s, day) => adminApi.dailyEdit(s, day, { zh: { ...zh.value }, en: { ...en.value } }), '已保存');
const publish = () => run(adminApi.dailyPublish, '已发布');
const hide = () => run(adminApi.dailyHide, '已撤下');
const regenerate = () => {
  if (!window.confirm('重新调用 AI 生成？现在的内容会被替换, 结果是待审')) return;
  void run(adminApi.dailyRegenerate, '已重新生成');
};

/** 预览：记号换成店名、道具名（简中） */
const names = catalogNames(catalog);
const preview = computed(() => {
  const d = cur.value;
  if (!d) return null;
  return {
    title: dailyPlain(zh.value.title, d.rests, names, '已关店'),
    paras: dailyParagraphs(zh.value.body, d.rests, names, '已关店').map((p) => p.map((s) => s.text).join('')),
  };
});
const factsText = computed(() => (cur.value ? JSON.stringify(cur.value.facts, null, 2) : ''));

watch(
  () => admin.shardId,
  () => {
    cur.value = null;
    void load();
  },
);
onMounted(() => void load());
</script>

<template>
  <h6 class="dt-section">小镇日报</h6>
  <div class="dt-meta mb-2">
    每天游戏时间 00:10 以后写前一天的; 区服数值 tuning.daily.autoPublish 打开后写好直接发布。
  </div>
  <table class="table table-sm small">
    <thead>
      <tr>
        <th>日期</th>
        <th>状态</th>
        <th>标题</th>
        <th>token (入/出)</th>
        <th>次数</th>
        <th>错误</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="r in rows"
        :key="r.day"
        :class="{ 'table-active': cur?.day === r.day }"
        style="cursor: pointer"
        data-testid="adl-row"
        @click="open(r)"
      >
        <td>{{ r.day }}</td>
        <td>{{ STATUS[r.status] }}</td>
        <td>{{ r.title ?? '-' }}</td>
        <td>{{ formatNum(r.tokensIn) }} / {{ formatNum(r.tokensOut) }}</td>
        <td>{{ r.attempts }} (重新生成 {{ r.regenerations }})</td>
        <td class="text-danger">{{ r.error ?? '' }}</td>
      </tr>
      <tr v-if="rows.length === 0">
        <td colspan="6" class="text-muted">还没有日报 (区服要先打开 daily 功能)</td>
      </tr>
    </tbody>
  </table>

  <template v-if="cur">
    <h6 class="dt-section">{{ cur.day }} · {{ STATUS[cur.status] }}</h6>
    <div class="row g-2">
      <div class="col-md-6">
        <label class="small fw-bold">简中</label>
        <input v-model="zh.title" class="form-control form-control-sm mb-1" data-testid="adl-zh-title" />
        <textarea
          v-model="zh.body"
          rows="10"
          class="form-control form-control-sm mb-2"
          data-testid="adl-zh-body"
        />
        <label class="small fw-bold">英文</label>
        <input v-model="en.title" class="form-control form-control-sm mb-1" data-testid="adl-en-title" />
        <textarea
          v-model="en.body"
          rows="8"
          class="form-control form-control-sm mb-2"
          data-testid="adl-en-body"
        />
        <div class="d-flex gap-2">
          <button
            class="btn btn-sm btn-outline-primary"
            :disabled="busy"
            data-testid="adl-save"
            @click="save"
          >
            保存
          </button>
          <button
            class="btn btn-sm btn-primary"
            :disabled="busy || !cur.content || cur.status === 'published'"
            data-testid="adl-publish"
            @click="publish"
          >
            发布
          </button>
          <button
            class="btn btn-sm btn-outline-secondary"
            :disabled="busy || cur.status === 'hidden'"
            data-testid="adl-hide"
            @click="hide"
          >
            撤下
          </button>
          <button
            class="btn btn-sm btn-outline-danger"
            :disabled="busy || cur.status === 'published'"
            data-testid="adl-regenerate"
            @click="regenerate"
          >
            重新生成
          </button>
        </div>
      </div>
      <div class="col-md-6">
        <label class="small fw-bold">预览 (简中)</label>
        <div v-if="preview" class="dt-card small mb-2" data-testid="adl-preview">
          <b>{{ preview.title }}</b>
          <p v-for="(p, i) in preview.paras" :key="i" class="mb-1">{{ p }}</p>
        </div>
        <label class="small fw-bold"
          >素材 (店:
          {{
            Object.entries(cur.rests)
              .map(([id, n]) => `${id}=${n ?? '已关店'}`)
              .join(', ')
          }})</label
        >
        <pre class="small border p-2" style="max-height: 24rem; overflow: auto" data-testid="adl-facts">{{
          factsText
        }}</pre>
      </div>
    </div>
  </template>
</template>
