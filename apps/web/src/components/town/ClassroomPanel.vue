<script setup lang="ts">
import { remainText } from '../../utils/remain';
import { computed, onMounted, ref } from 'vue';
import type { LessonDto, LessonsDto, McOverviewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useConfirmStore } from '../../stores/confirm';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import DtArt from '../DtArt.vue';
import DtRow from '../DtRow.vue';
import DtSheet from '../DtSheet.vue';
import PickRow from '../PickRow.vue';

/**
 * 教室（界面改版 P10）：上面一张卡写我的课（或“我没开课”和“开课”按钮），下面别人开的课一行一门
 * （学、偷学；试过了、满了写小标签），最后一行“学费和偷学怎么算”点开说明。
 * 开课从下面弹出面板：按等级筛、选特色菜（写持有残卷几张）、选教师证（教不了这一级的灰掉）
 */
const catalog = useCatalogStore();
const toast = useToastStore();
const confirm = useConfirmStore();
const t = useT();
const data = ref<LessonsDto | null>(null);
const mc = ref<McOverviewDto | null>(null);
const pickMc = ref<number | null>(null);
const pickCert = ref<number | null>(null);
const busy = ref(false);
const openSheet = ref(false);
const helpOpen = ref(false);

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
/**
 * 开课选特色菜（问题记录 475）：学得多了一长串找不到，按等级从高到低、同级按道排；
 * 上面一排按等级筛，只列学过的等级
 */
const pickLevel = ref<'all' | number>('all');
const levelOf = (id: number) => catalog.mc(id)?.level ?? 0;
const sortedMc = computed(() =>
  (mc.value?.learned ?? [])
    .map((m) => m.mcId)
    .sort(
      (a, b) => levelOf(b) - levelOf(a) || (catalog.mc(a)?.road ?? 0) - (catalog.mc(b)?.road ?? 0) || a - b,
    ),
);
const mcLevels = computed(() => [...new Set(sortedMc.value.map(levelOf))]);
const shownMc = computed(() =>
  pickLevel.value === 'all' ? sortedMc.value : sortedMc.value.filter((id) => levelOf(id) === pickLevel.value),
);
/** 每道菜持有几张残卷：开课要消耗 1 张 */
const remnantOf = (id: number) => mc.value?.remnants.find((r) => r.mcId === id)?.num ?? 0;
function setPickLevel(lv: 'all' | number) {
  pickLevel.value = lv;
  if (pickMc.value !== null && !shownMc.value.includes(pickMc.value)) {
    pickMc.value = null;
    pickCert.value = null;
  }
}
/** 有的教师证都列出来；教不了选中那道菜的等级的灰掉 */
const certs = computed(() => (data.value?.certs ?? []).filter((c) => c.num > 0));
const pickedLevel = computed(() => (pickMc.value === null ? undefined : catalog.mc(pickMc.value)?.level));
const certOk = (levels: number[]) => pickedLevel.value === undefined || levels.includes(pickedLevel.value);
function choose(id: number) {
  pickMc.value = id;
  const c = certs.value.find((x) => x.goodsId === pickCert.value);
  if (c && !certOk(c.levels)) pickCert.value = null;
}
/** 剩余时间显示到分钟（backlog 6B-2，和设施、效果一致） */
const leftText = (at: string) => remainText(at);
const full = (l: LessonDto) => l.learned + l.stolen >= l.maxNum;

async function learn(l: LessonDto, type: 1 | 2) {
  const forget = l.level * (data.value?.forgetPerLevel ?? 2) + 1;
  const grades = data.value?.forgetGrades ?? 1;
  const c = t.value.town.classroom;
  if (
    type === 2 &&
    !(await confirm.ask({
      title: c.stealTitle(catalog.mcName(l.mcId)),
      body: c.stealConfirm(forget, grades, l.level >= 4),
      ok: c.steal,
      danger: true,
    }))
  )
    return;
  return act(async () => {
    const r = await endpoints.lessonLearn(l.id, type);
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
  }, c.learnFailed);
}
function showOpen() {
  pickMc.value = null;
  pickCert.value = null;
  pickLevel.value = 'all';
  openSheet.value = true;
}
function open() {
  const m = pickMc.value;
  const c = pickCert.value;
  if (m === null || c === null) return;
  return act(async () => {
    await endpoints.lessonOpen(m, c);
    toast.push(t.value.town.classroom.opened);
    openSheet.value = false;
  }, t.value.town.classroom.openFailed);
}
async function close() {
  const mine = data.value?.mine;
  if (!mine || !data.value) return;
  const coin = mine.level * data.value.forceCloseCoinPerLevel;
  const c = t.value.town.classroom;
  if (!(await confirm.ask({ title: c.closeConfirm(formatNum(coin)), ok: c.forceClose, danger: true })))
    return;
  return act(async () => {
    await endpoints.lessonClose();
    toast.push(c.closed);
  }, c.closeFailed);
}

onMounted(() =>
  load().catch((e) => toast.push(errorMessage(e, t.value.town.classroom.loadFailed), 'danger')),
);
</script>

<template>
  <!-- 教室在协会里（问题记录 441，原来是广场的一个标签）（问题记录 122），原来的独立页面 /classroom 跳到这里 -->
  <div v-if="data" data-testid="classroom-panel">
    <div class="dt-card dt-class-mine" :data-testid="data.mine ? 'my-lesson' : 'open-panel'">
      <span class="dt-class-mine-art"><DtArt name="town-easel" :size="40" /></span>
      <span class="dt-class-mine-main">
        <template v-if="data.mine">
          <b>{{ t.town.classroom.mine }}{{ catalog.mcName(data.mine.mcId) }}</b>
          <span>{{
            t.town.classroom.mineLine(
              data.mine.level,
              data.mine.learned + data.mine.stolen,
              data.mine.maxNum,
              leftText(data.mine.endsAt),
            )
          }}</span>
        </template>
        <template v-else>
          <b>{{ t.town.classroom.noMine }}</b>
          <span>{{ t.town.classroom.noMineSub }}</span>
        </template>
      </span>
      <button
        v-if="data.mine && data.canForceClose"
        type="button"
        class="btn btn-sm btn-outline-danger"
        data-testid="force-close"
        :disabled="busy"
        @click="close"
      >
        {{ t.town.classroom.forceClose }}
      </button>
      <button
        v-else-if="!data.mine"
        type="button"
        class="btn btn-sm btn-primary"
        data-testid="open-lesson-sheet"
        @click="showOpen"
      >
        {{ t.town.classroom.open }}
      </button>
    </div>

    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.town.classroom.running }}</h2>
      <span class="dt-block-more">{{ t.town.classroom.onceNote }}</span>
    </div>
    <div v-if="others.length === 0" class="dt-card dt-up-max">{{ t.town.classroom.none }}</div>
    <div v-else class="dt-card dt-rows-card">
      <DtRow v-for="l in others" :key="l.id" strong class="dt-row-wrap" :data-testid="`lesson-${l.id}`">
        <template #icon><DtArt name="town-dish" :size="28" /></template>
        <template #title
          >{{ catalog.mcName(l.mcId) }}
          <span :class="['dt-tag', l.level >= 3 ? 'dt-tag-primary' : 'dt-tag-ok']">{{
            t.town.classroom.level(l.level)
          }}</span></template
        >
        <template #sub
          ><span class="d-block">{{ t.town.classroom.teacher(l.teacherName) }}</span
          ><span class="d-block">{{
            t.town.classroom.lessonMeta(l.learned + l.stolen, l.maxNum, l.stolen, leftText(l.endsAt))
          }}</span></template
        >
        <template #end>
          <span v-if="l.tried" class="dt-tag dt-tag-mute" :data-testid="`tried-${l.id}`">{{
            t.town.classroom.tried
          }}</span>
          <span v-else-if="full(l)" class="dt-tag dt-tag-mute" :data-testid="`full-${l.id}`">{{
            t.town.classroom.full
          }}</span>
          <span v-else class="dt-class-acts">
            <button
              v-if="l.stolen <= 1"
              type="button"
              class="btn btn-sm btn-light text-danger"
              :data-testid="`steal-${l.id}`"
              :disabled="busy"
              @click="learn(l, 2)"
            >
              {{ t.town.classroom.steal }}
            </button>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :data-testid="`learn-${l.id}`"
              :disabled="busy"
              @click="learn(l, 1)"
            >
              {{ t.town.classroom.learn }}
            </button>
          </span>
        </template>
      </DtRow>
    </div>
    <div class="dt-card dt-rows-card mt-3">
      <button type="button" class="dt-row is-link" data-testid="classroom-help" @click="helpOpen = true">
        <span class="dt-row-main">
          <span class="dt-row-title is-strong">{{ t.town.classroom.helpTitle }}</span>
          <span class="dt-row-sub">{{ t.town.classroom.helpSub }}</span>
        </span>
      </button>
    </div>

    <!-- 开课面板 -->
    <DtSheet :open="openSheet" :title="t.town.classroom.open" @close="openSheet = false">
      <p class="dt-detail-note mt-0">{{ t.town.classroom.openCost }}</p>
      <div class="dt-field-label-top">{{ t.town.classroom.pickMcLabel }}</div>
      <div v-if="mcLevels.length > 1" class="dt-pills" role="group" :aria-label="t.mc.filter.levelLabel">
        <button
          v-for="x in ['all' as const, ...mcLevels]"
          :key="String(x)"
          type="button"
          :class="{ active: pickLevel === x }"
          :aria-pressed="pickLevel === x"
          :data-testid="`open-lv-${x}`"
          @click="setPickLevel(x)"
        >
          {{ x === 'all' ? t.mc.filter.all : t.mc.filter.level(x) }}
        </button>
      </div>
      <div v-if="shownMc.length === 0" class="dt-card dt-up-max mt-2">{{ t.town.classroom.noMc }}</div>
      <div
        v-else
        class="dt-card dt-rows-card mt-2"
        role="radiogroup"
        :aria-label="t.town.classroom.pickMcLabel"
        data-testid="open-mc"
      >
        <PickRow
          v-for="id in shownMc"
          :key="id"
          :on="pickMc === id"
          :disabled="remnantOf(id) === 0"
          art="town-dish"
          :sub="t.town.classroom.remnants(remnantOf(id))"
          :testid="`open-mc-${id}`"
          @pick="choose(id)"
        >
          <template #title
            >{{ catalog.mcName(id) }}
            <span :class="['dt-tag', levelOf(id) >= 3 ? 'dt-tag-primary' : 'dt-tag-ok']">{{
              t.town.classroom.level(levelOf(id))
            }}</span></template
          >
        </PickRow>
      </div>
      <div class="dt-field-label-top mt-3">{{ t.town.classroom.pickCertLabel }}</div>
      <div v-if="certs.length === 0" class="dt-card dt-up-max">{{ t.town.classroom.noCert }}</div>
      <div
        v-else
        class="dt-card dt-rows-card"
        role="radiogroup"
        :aria-label="t.town.classroom.pickCertLabel"
        data-testid="open-cert"
      >
        <PickRow
          v-for="c in certs"
          :key="c.goodsId"
          :on="pickCert === c.goodsId"
          :disabled="!certOk(c.levels)"
          :art="catalog.goodsArt(c.goodsId)"
          :title="catalog.goodsName(c.goodsId)"
          :sub="t.town.classroom.certLine(c.needStrength, c.lessonHour, c.maxNum)"
          :testid="`open-cert-${c.goodsId}`"
          @pick="pickCert = c.goodsId"
        >
          <template #end>
            <span v-if="!certOk(c.levels)" class="dt-tag dt-tag-mute">{{
              t.town.classroom.certCant(pickedLevel ?? 0)
            }}</span>
            <span v-else class="dt-pick-have">{{ t.town.classroom.certHave(c.num) }}</span>
          </template>
        </PickRow>
      </div>
      <template #actions>
        <div class="dt-sheet-pair">
          <button type="button" class="btn btn-light" @click="openSheet = false">
            {{ t.common.cancel }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            data-testid="open-lesson"
            :disabled="busy || pickMc === null || pickCert === null"
            @click="open"
          >
            {{ t.town.classroom.open }}
          </button>
        </div>
      </template>
    </DtSheet>

    <!-- 学费和偷学怎么算 -->
    <DtSheet :open="helpOpen" :title="t.town.classroom.helpTitle" @close="helpOpen = false">
      <div class="dt-help">
        <ul>
          <li v-for="(x, i) in t.town.classroom.helpItems" :key="i">{{ x }}</li>
        </ul>
      </div>
      <template #actions>
        <button type="button" class="btn btn-light dt-btn-block" @click="helpOpen = false">
          {{ t.common.close }}
        </button>
      </template>
    </DtSheet>
  </div>
</template>
