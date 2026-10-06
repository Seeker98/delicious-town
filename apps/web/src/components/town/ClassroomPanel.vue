<script setup lang="ts">
import { remainText } from '../../utils/remain';
import { computed, onMounted, ref } from 'vue';
import type { LessonDto, LessonsDto, McOverviewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
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
/** 剩余时间显示到分钟（backlog 6B-2，和设施、效果一致） */
const leftText = (at: string) => remainText(at);

function learn(l: LessonDto, type: 1 | 2) {
  const forget = l.level * (data.value?.forgetPerLevel ?? 2) + 1;
  const grades = data.value?.forgetGrades ?? 1;
  if (type === 2 && !window.confirm(t.value.town.classroom.stealConfirm(forget, grades, l.level >= 4)))
    return;
  return act(async () => {
    const r = await endpoints.lessonLearn(l.id, type);
    const c = t.value.town.classroom;
    if (r.success) toast.push(c.learned(catalog.mcName(l.mcId)));
    else if (type === 2)
      toast.push(
        c.stealFailed(
          r.forgot.cookbooks.length,
          r.forgot.grades,
          r.forgot.lost,
          r.forgot.mcId ? catalog.mcName(r.forgot.mcId) : null,
        ),
        'danger',
      );
    else toast.push(c.notLearned, 'danger');
  }, t.value.town.classroom.learnFailed);
}
function open() {
  const m = pickMc.value;
  const c = pickCert.value;
  if (m === null || c === null) return;
  return act(async () => {
    await endpoints.lessonOpen(m, c);
    toast.push(t.value.town.classroom.opened);
    pickMc.value = null;
    pickCert.value = null;
  }, t.value.town.classroom.openFailed);
}
function close() {
  const mine = data.value?.mine;
  if (!mine || !data.value) return;
  const coin = mine.level * data.value.forceCloseCoinPerLevel;
  if (!window.confirm(t.value.town.classroom.closeConfirm(formatNum(coin)))) return;
  return act(async () => {
    await endpoints.lessonClose();
    toast.push(t.value.town.classroom.closed);
  }, t.value.town.classroom.closeFailed);
}

onMounted(() =>
  load().catch((e) => toast.push(errorMessage(e, t.value.town.classroom.loadFailed), 'danger')),
);
</script>

<template>
  <!-- 教室是广场的一个标签（问题记录 122），原来的独立页面 /classroom 跳到这里 -->
  <div v-if="data" data-testid="classroom-panel">
    <div v-if="data.mine" class="border rounded p-2 mb-2 small" data-testid="my-lesson">
      {{ t.town.classroom.mine }}<b>{{ catalog.mcName(data.mine.mcId) }}</b
      >{{
        t.town.classroom.mineLine(
          data.mine.level,
          data.mine.learned + data.mine.stolen,
          data.mine.maxNum,
          leftText(data.mine.endsAt),
        )
      }}
      <button
        v-if="data.canForceClose"
        class="btn btn-sm btn-outline-danger ms-2"
        data-testid="force-close"
        :disabled="busy"
        @click="close"
      >
        {{ t.town.classroom.forceClose }}
      </button>
    </div>
    <div v-else class="border rounded p-2 mb-2 small" data-testid="open-panel">
      {{ t.town.classroom.openTitle }}
      <select v-model.number="pickMc" class="form-select form-select-sm my-1" data-testid="open-mc">
        <option :value="null" disabled>{{ t.town.classroom.pickMc }}</option>
        <option v-for="m in mc?.learned ?? []" :key="m.mcId" :value="m.mcId">
          {{ t.town.classroom.mcOption(catalog.mcName(m.mcId), catalog.mc(m.mcId)?.level) }}
        </option>
      </select>
      <select v-model.number="pickCert" class="form-select form-select-sm mb-1" data-testid="open-cert">
        <option :value="null" disabled>{{ t.town.classroom.pickCert }}</option>
        <option v-for="c in certsFor" :key="c.goodsId" :value="c.goodsId">
          {{
            t.town.classroom.certOption(
              catalog.goodsName(c.goodsId),
              c.needStrength,
              c.lessonHour,
              c.maxNum,
              c.num,
            )
          }}
        </option>
      </select>
      <button
        class="btn btn-sm btn-primary"
        data-testid="open-lesson"
        :disabled="busy || pickMc === null || pickCert === null"
        @click="open"
      >
        {{ t.town.classroom.open }}
      </button>
    </div>

    <h6>{{ t.town.classroom.running }}</h6>
    <div v-if="others.length === 0" class="small text-muted">{{ t.town.classroom.none }}</div>
    <div
      v-for="l in others"
      :key="l.id"
      class="d-flex align-items-center gap-1 border-bottom py-1 small"
      :data-testid="`lesson-${l.id}`"
    >
      <div class="flex-fill">
        <b>{{ catalog.mcName(l.mcId) }}</b
        >{{ t.town.classroom.lessonLine(l.level, l.teacherName) }}
        <div class="text-muted">
          {{ t.town.classroom.lessonMeta(l.learned + l.stolen, l.maxNum, l.stolen, leftText(l.endsAt)) }}
        </div>
      </div>
      <button
        class="btn btn-sm btn-primary"
        :data-testid="`learn-${l.id}`"
        :disabled="busy || l.tried"
        @click="learn(l, 1)"
      >
        {{ t.town.classroom.learn }}
      </button>
      <button
        class="btn btn-sm btn-outline-danger"
        :data-testid="`steal-${l.id}`"
        :disabled="busy || l.tried || l.stolen > 1"
        @click="learn(l, 2)"
      >
        {{ t.town.classroom.steal }}
      </button>
    </div>
    <p class="small text-muted mt-2">
      {{ t.town.classroom.rule }}
    </p>
  </div>
</template>
