<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { LessonDto, LessonsDto, McOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<LessonsDto | null>(null);
const mc = ref<McOverviewDto | null>(null);
const pickMc = ref<number | null>(null);
const pickCert = ref<number | null>(null);
const busy = ref(false);

async function load() {
  const [l, m] = await Promise.all([endpoints.lessons(), endpoints.mc()]);
  data.value = l;
  mc.value = m;
}
async function act(fn: () => Promise<void>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const others = computed(() => (data.value?.items ?? []).filter((l) => l.id !== data.value?.mine?.id));
const certsFor = computed(() => {
  const lv = pickMc.value === null ? undefined : catalog.mc(pickMc.value)?.level;
  return (data.value?.certs ?? []).filter((c) => c.num > 0 && lv !== undefined && c.levels.includes(lv));
});
const leftText = (at: string) =>
  `${Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 3_600_000))} 小时`;

function learn(l: LessonDto, type: 1 | 2) {
  const forget = l.level * (data.value?.forgetPerLevel ?? 3) + 1;
  if (
    type === 2 &&
    !window.confirm(
      `偷学不花学费，但失败会遗忘 ${forget} 道食谱${l.level >= 4 ? '，还可能遗忘一道特色菜' : ''}。确定偷学吗？`,
    )
  )
    return;
  return act(async () => {
    const r = await endpoints.lessonLearn(l.id, type);
    if (r.success) toast.push(`学会了${catalog.mcName(l.mcId)}`);
    else if (type === 2)
      toast.push(
        `偷学失败，遗忘了 ${r.forgot.cookbooks.length} 道食谱${r.forgot.mcId ? `和${catalog.mcName(r.forgot.mcId)}` : ''}`,
        'danger',
      );
    else toast.push('没学会，下次再来', 'danger');
  }, '学习失败');
}
function open() {
  const m = pickMc.value;
  const c = pickCert.value;
  if (m === null || c === null) return;
  return act(async () => {
    await endpoints.lessonOpen(m, c);
    toast.push('开课了');
    pickMc.value = null;
    pickCert.value = null;
  }, '开课失败');
}
function close() {
  const mine = data.value?.mine;
  if (!mine || !data.value) return;
  const coin = mine.level * data.value.forceCloseCoinPerLevel;
  if (!window.confirm(`花 ${formatNum(coin)} 银币强制结束这门课？`)) return;
  return act(async () => {
    await endpoints.lessonClose();
    toast.push('课程已结束');
  }, '结束失败');
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取教室失败'), 'danger')));
</script>

<template>
  <div v-if="data">
    <h5>教室</h5>
    <div v-if="data.mine" class="border rounded p-2 mb-2 small" data-testid="my-lesson">
      我的课：<b>{{ catalog.mcName(data.mine.mcId) }}</b> {{ data.mine.level }} 级 ·
      {{ data.mine.learned + data.mine.stolen }}/{{ data.mine.maxNum }} 人 · 还剩
      {{ leftText(data.mine.endsAt) }}
      <button
        v-if="data.canForceClose"
        class="btn btn-sm btn-outline-danger ms-2"
        data-testid="force-close"
        :disabled="busy"
        @click="close"
      >
        强制结束
      </button>
    </div>
    <div v-else class="border rounded p-2 mb-2 small" data-testid="open-panel">
      开课（消耗 1 张残卷和 1 张教师证）：
      <select v-model.number="pickMc" class="form-select form-select-sm my-1" data-testid="open-mc">
        <option :value="null" disabled>选择已学的特色菜</option>
        <option v-for="m in mc?.learned ?? []" :key="m.mcId" :value="m.mcId">
          {{ catalog.mcName(m.mcId) }}（{{ catalog.mc(m.mcId)?.level }} 级）
        </option>
      </select>
      <select v-model.number="pickCert" class="form-select form-select-sm mb-1" data-testid="open-cert">
        <option :value="null" disabled>选择教师证</option>
        <option v-for="c in certsFor" :key="c.goodsId" :value="c.goodsId">
          {{ catalog.goodsName(c.goodsId) }}（体力 {{ c.needStrength }}，{{ c.lessonHour }} 小时，{{
            c.maxNum
          }}
          人，持有 {{ c.num }}）
        </option>
      </select>
      <button
        class="btn btn-sm btn-primary"
        data-testid="open-lesson"
        :disabled="busy || pickMc === null || pickCert === null"
        @click="open"
      >
        开课
      </button>
    </div>

    <h6>正在上的课</h6>
    <div v-if="others.length === 0" class="small text-muted">现在没有别人开的课</div>
    <div
      v-for="l in others"
      :key="l.id"
      class="d-flex align-items-center gap-1 border-bottom py-1 small"
      :data-testid="`lesson-${l.id}`"
    >
      <div class="flex-fill">
        <b>{{ catalog.mcName(l.mcId) }}</b> {{ l.level }} 级 · 老师 {{ l.teacherName }}
        <div class="text-muted">
          {{ l.learned + l.stolen }}/{{ l.maxNum }} 人（偷学 {{ l.stolen }}）· 还剩 {{ leftText(l.endsAt) }}
        </div>
      </div>
      <button
        class="btn btn-sm btn-primary"
        :data-testid="`learn-${l.id}`"
        :disabled="busy || l.tried"
        @click="learn(l, 1)"
      >
        学
      </button>
      <button
        class="btn btn-sm btn-outline-danger"
        :data-testid="`steal-${l.id}`"
        :disabled="busy || l.tried || l.stolen > 1"
        @click="learn(l, 2)"
      >
        偷学
      </button>
    </div>
    <p class="small text-muted mt-2">
      学：花 售价×3 银币和 2 个同级残卷碎片，老师分到 售价×2 和 1 个碎片。每门课只能试一次。
    </p>
  </div>
</template>
