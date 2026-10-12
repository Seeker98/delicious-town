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
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import { useConfirmStore } from '../../stores/confirm';

/** 后台小镇日报（2026-10-08）：先人工审核再发布；可以手改简中、英文，或者重新生成 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const confirm = useConfirmStore();
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
const STATUS_TONE: Record<DailyStatus, string> = {
  pending: '',
  draft: 'is-w',
  published: 'is-ok',
  hidden: '',
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
const regenerate = async () => {
  const ok = await confirm.ask({
    title: '重新调用 AI 生成？',
    body: '现在的内容会被替换, 结果是待审。',
    ok: '重新生成',
    danger: true,
  });
  if (!ok) return;
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
/** 改了没保存（终审 I3）：发布的是存着的内容，没保存就发布会把改动丢掉，所以先保存 */
const dirty = computed(() => {
  const c = cur.value?.content;
  const zh0 = c?.['zh-CN'] ?? { title: '', body: '' };
  const en0 = c?.en ?? { title: '', body: '' };
  return (
    zh.value.title !== zh0.title ||
    zh.value.body !== zh0.body ||
    en.value.title !== en0.title ||
    en.value.body !== en0.body
  );
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
  <div class="dt-adm-page">
    <AdmHead
      title="小镇日报"
      desc="每天游戏时间 00:10 以后写前一天的; 区服数值 tuning.daily.autoPublish 打开后写好直接发布。点一行审稿。"
    />
    <AdmBox flush>
      <AdmEmpty v-if="rows.length === 0" title="还没有日报" text="区服要先打开 daily 功能" />
      <div v-else class="dt-adm-scroll">
        <table class="dt-adm-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>状态</th>
              <th>标题</th>
              <th class="num">token (入 / 出)</th>
              <th>次数</th>
              <th>错误</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.day"
              :class="['is-link', { 'is-hl': cur?.day === r.day }]"
              data-testid="adl-row"
              @click="open(r)"
            >
              <td class="nowrap">{{ r.day }}</td>
              <td>
                <span :class="['dt-adm-tag', STATUS_TONE[r.status]]">{{ STATUS[r.status] }}</span>
              </td>
              <td>{{ r.title ?? '—' }}</td>
              <td class="num nowrap">{{ formatNum(r.tokensIn) }} / {{ formatNum(r.tokensOut) }}</td>
              <td class="dt-adm-mu nowrap">{{ r.attempts }} (重新生成 {{ r.regenerations }})</td>
              <td class="dt-adm-bad">{{ r.error ?? '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdmBox>

    <div v-if="cur" class="dt-adm-g2">
      <AdmBox :title="cur.day" :sub="STATUS[cur.status]">
        <template #right>
          <button
            type="button"
            class="dt-adm-btn is-s is-sm"
            :disabled="busy"
            data-testid="adl-save"
            @click="save"
          >
            保存
          </button>
          <button
            type="button"
            class="dt-adm-btn is-p is-sm"
            :disabled="busy || dirty || !cur.content || cur.status === 'published'"
            data-testid="adl-publish"
            @click="publish"
          >
            发布
          </button>
          <button
            type="button"
            class="dt-adm-btn is-s is-sm"
            :disabled="busy || dirty || cur.status === 'hidden'"
            data-testid="adl-hide"
            @click="hide"
          >
            撤下
          </button>
          <button
            type="button"
            class="dt-adm-btn is-d is-sm"
            :disabled="busy || dirty || cur.status === 'published'"
            data-testid="adl-regenerate"
            @click="regenerate"
          >
            重新生成…
          </button>
        </template>
        <div v-if="dirty" class="dt-adm-alert is-d dt-adm-mb" data-testid="adl-dirty">
          <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
          <div>有没保存的修改: 先保存, 才能发布、撤下或重新生成</div>
        </div>
        <div class="dt-adm-stack">
          <label class="dt-adm-lab">简中</label>
          <input
            v-model="zh.title"
            class="dt-adm-in dt-adm-full"
            aria-label="简中标题"
            data-testid="adl-zh-title"
          />
          <textarea
            v-model="zh.body"
            rows="10"
            class="dt-adm-in dt-adm-full"
            aria-label="简中正文"
            data-testid="adl-zh-body"
          />
          <label class="dt-adm-lab">英文</label>
          <input
            v-model="en.title"
            class="dt-adm-in dt-adm-full"
            aria-label="英文标题"
            data-testid="adl-en-title"
          />
          <textarea
            v-model="en.body"
            rows="8"
            class="dt-adm-in dt-adm-full"
            aria-label="英文正文"
            data-testid="adl-en-body"
          />
        </div>
      </AdmBox>
      <div class="dt-adm-stack">
        <AdmBox v-if="preview" title="预览" sub="简中, 记号换成店名、道具名">
          <div class="dt-adm-daily" data-testid="adl-preview">
            <b>{{ preview.title }}</b>
            <p v-for="(p, i) in preview.paras" :key="i">{{ p }}</p>
          </div>
        </AdmBox>
        <AdmBox title="素材">
          <div class="dt-adm-help dt-adm-mb">
            店:
            {{
              Object.entries(cur.rests)
                .map(([id, n]) => `${id}=${n ?? '已关店'}`)
                .join(', ')
            }}
          </div>
          <pre class="dt-adm-facts" data-testid="adl-facts">{{ factsText }}</pre>
        </AdmBox>
      </div>
    </div>
  </div>
</template>
