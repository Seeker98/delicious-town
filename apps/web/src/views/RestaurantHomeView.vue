<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type {
  AnnouncementDto,
  DeviceOptionsDto,
  DineCurrentDto,
  EffectDto,
  QuestDto,
  QuestsDto,
} from '@dt/shared';
import { endpoints } from '../api/endpoints';
import ActivityBanner from '../components/ActivityBanner.vue';
import AnnounceBanner from '../components/AnnounceBanner.vue';
import GameImg from '../components/GameImg.vue';
import HomeNews from '../components/town/HomeNews.vue';
import { useT } from '../composables/useT';
import type { Messages } from '../i18n';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { effectChips } from '../utils/effects';
import { formatNum } from '../utils/format';
import { remainText } from '../utils/remain';
import { effectName } from '../utils/serverText';
import { CUSTOMER_NAMES } from '../utils/labels';

const store = useRestaurantStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const rest = computed(() => store.rest);
const error = ref('');
const busy = ref(false);
const mainTask = ref<QuestDto | null>(null);
/** 没有可领的任务时：本章任务都领了 → 章末奖励；当前章锁定 → 解锁条件（问题记录 318） */
const mainChapter = ref<QuestsDto['chapter']>(null);
const chapterName = (c: NonNullable<QuestsDto['chapter']>) => catalog.data('chapters', c.id)?.name ?? c.name;
/** "主线：第 2 章 小店经营"：拼成一段，模板里换行不会在冒号后多出空格 */
const mainChapterText = computed(() => {
  const c = mainChapter.value;
  if (!c) return '';
  const x = t.value.rest.tasks;
  const body = c.locked ? x.chapterLocked(c.id, chapterName(c)) : x.chapterAwardRow(c.id, chapterName(c));
  return t.value.common.colon(t.value.home.mainTag) + body;
});
const dining = ref<DineCurrentDto | null>(null);
const announcements = ref<AnnouncementDto[]>([]);
const options = ref<DeviceOptionsDto | null>(null);
const pickingSlot = ref<number | null>(null);

/** 首页公告横幅（子项目 6A）：读失败就不显示 */
async function loadAnnouncements() {
  try {
    announcements.value = (await endpoints.announcements()).items;
  } catch {
    announcements.value = [];
  }
}

/** 首页签到（问题记录 144）和今日活跃点数（问题记录 280）：读失败就不显示 */
const signedIn = ref<boolean | null>(null);
const signInGift = ref<number | null>(null);
const activeTotal = ref<number | null>(null);
async function loadSignIn() {
  try {
    const a = await endpoints.activation();
    signedIn.value = a.signedIn;
    signInGift.value = a.signInGift;
    activeTotal.value = a.total;
  } catch {
    signedIn.value = null;
    activeTotal.value = null;
  }
}

/**
 * 有能领的新手码（backlog：以前 10 级就不提示，20 级的码没人提醒）：30 级以下每次进首页查一次；读失败就不提示
 */
const codesClaimable = ref(false);
let codesChecked = false;
async function loadGuideCodes() {
  if (codesChecked || !rest.value || rest.value.level >= 30) return;
  codesChecked = true;
  try {
    codesClaimable.value = (await endpoints.guideCodes()).some((c) => c.state === 'ok');
  } catch {
    codesClaimable.value = false;
  }
}

async function load() {
  void loadAnnouncements();
  void loadSignIn();
  try {
    await store.refresh();
    void loadGuideCodes();
    // 本章第一个可领的；没有可领的显示第一个没完成的（问题记录 318）
    // 本章任务都领完时显示章末奖励，章锁定时写解锁条件
    // 任务单独读：读失败（比如前端先上线、服务端还没更新）只少了主线行，不让整个首页报错（问题记录 327）
    try {
      const q = await endpoints.tasks();
      // 补领的任务（backlog 318）只在能领时占主线行，没完成的不显示；旧服务端没有 leftover 时按空的算
      const ready =
        q.main.find((x) => x.done && !x.claimed) ?? (q.leftover ?? []).find((x) => x.done && !x.claimed);
      const chapterRow = q.chapter && (q.chapter.claimable || q.chapter.locked);
      mainTask.value = ready ?? (chapterRow ? null : (q.main.find((x) => !x.done) ?? null));
      mainChapter.value = !ready && chapterRow ? q.chapter : null;
    } catch {
      mainTask.value = null;
      mainChapter.value = null;
    }
    dining.value = await endpoints.dineCurrent();
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, t.value.home.loadFailed);
  }
}

async function act(fn: () => Promise<unknown>, fallback: string) {
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

const expPercent = computed(() =>
  rest.value ? Math.min(100, Math.floor((rest.value.exp / rest.value.expToNext) * 100)) : 0,
);
/** 银币不够加满时有多少加多少（服务端同样处理） */
const refuelNeed = computed(() => (rest.value ? rest.value.oilMax - rest.value.oil : 0));
const refuelCost = computed(() => (rest.value ? Math.min(refuelNeed.value, rest.value.coin) : 0));
const customers = computed(() =>
  Object.entries(rest.value?.lastRound?.customers ?? {})
    .filter(([k]) => k !== '0')
    .map(([k, v]) => t.value.common.qty(CUSTOMER_NAMES[k] ?? k, v))
    .join(t.value.events.sep),
);

async function openSlot(slot: number) {
  pickingSlot.value = slot;
  try {
    options.value = await endpoints.devices();
  } catch (e) {
    toast.push(errorMessage(e, t.value.home.devicesFailed), 'danger');
  }
}
const choices = computed(() => {
  const slot = options.value?.slots.find((s) => s.slot === pickingSlot.value);
  if (!slot || !options.value) return [];
  return options.value.store.filter((x) => x.deviceType === slot.deviceType);
});
function place(goodsId: number) {
  const slot = pickingSlot.value!;
  pickingSlot.value = null;
  // 替换还没到期的设施：旧设施直接作废、不退还，先让玩家确认
  const current = rest.value?.devices.find((d) => d.slot === slot);
  if (
    current?.goodsId &&
    (current.expiresAt === null || new Date(current.expiresAt).getTime() > Date.now()) &&
    !window.confirm(
      t.value.home.replaceConfirm(catalog.goodsName(current.goodsId), expiresText(current.expiresAt)),
    )
  )
    return;
  return act(() => endpoints.placeDevice(slot, goodsId), t.value.home.placeFailed);
}

/** 第二块牌匾位（设施位 7）：满星级后还要花银币和钻石开通 */
const PLAQUE2_SLOT = 7;
const plaque2Offer = computed(
  () => !!rest.value && !rest.value.plaque2Open && rest.value.starLevel >= rest.value.plaque2Cost.star,
);
const plaque2Block = computed(() => {
  const r = rest.value;
  if (!r) return '';
  if (r.coin < r.plaque2Cost.coin) return t.value.home.plaque2.noCoin(formatNum(r.plaque2Cost.coin));
  if (r.diamond < r.plaque2Cost.diamond) return t.value.home.plaque2.noDiamond(r.plaque2Cost.diamond);
  return '';
});
/** 锁定文字的星级：第二块牌匾位按区服的开通星级 */
const needStarOf = (d: { slot: number; needStar: number }) =>
  d.slot === PLAQUE2_SLOT && rest.value ? Math.max(d.needStar, rest.value.plaque2Cost.star) : d.needStar;
function openPlaque2() {
  const c = rest.value!.plaque2Cost;
  if (plaque2Block.value) return;
  if (!window.confirm(t.value.home.plaque2.confirm(formatNum(c.coin), c.diamond))) return;
  // 花费由全局的得失提示显示
  return act(() => endpoints.openPlaque2(), t.value.home.plaque2.failed);
}

const expiresText = (at: string | null) => remainText(at);
const effectExpires = (e: EffectDto) => expiresText(e.expiresAt);
const strengthText = computed(() =>
  rest.value ? `${formatNum(rest.value.strength)}/${formatNum(rest.value.strengthMax)}` : '',
);

/** 餐厅卡底部的小链接（问题记录 280：任务入口并进待办卡的"今日活跃"） */
const QUICK = [
  { to: '/rest/equip', icon: 'bi-tools', key: 'equip' },
  { to: '/store', icon: 'bi-archive', key: 'store' },
  { to: '/shop', icon: 'bi-bag', key: 'shop' },
] as const;

/** 生效的加成按来源分组，默认只显示前几条（问题记录：展示凌乱） */
const EFFECTS_SHOWN = 5;
type GroupKey = keyof Messages['home']['groups'];
const EFFECT_GROUPS: GroupKey[] = ['bless', 'street', 'honor', 'device', 'equip', 'suit'];
const effectsAll = ref(false);
/** 折叠时的一行摘要：来源名字，最多 3 个（问题记录 280） */
const effectsSummary = computed(() => {
  // 全服加成活动排在前面（问题记录 294）
  const names = [
    ...(rest.value?.boosts ?? []).map((b) => b.title),
    ...(rest.value?.effects ?? []).map((e) => effectName(e, catalog)),
  ];
  const h = t.value.home;
  return names.length === 0
    ? h.none
    : names.slice(0, 3).join(t.value.events.sep) + (names.length > 3 ? h.andMore : '');
});
const effectGroups = computed(() => {
  const all = rest.value?.effects ?? [];
  const known = new Set<string>(EFFECT_GROUPS);
  const ordered: Array<{ type: GroupKey; items: EffectDto[] }> = [
    ...EFFECT_GROUPS.map((type) => ({ type, items: all.filter((e) => e.sourceType === type) })),
    { type: 'other', items: all.filter((e) => !known.has(e.sourceType)) },
  ];
  let left = effectsAll.value ? Infinity : EFFECTS_SHOWN;
  const out: Array<{ type: GroupKey; items: EffectDto[] }> = [];
  for (const g of ordered) {
    if (left <= 0 || g.items.length === 0) continue;
    const items = g.items.slice(0, left);
    left -= items.length;
    out.push({ type: g.type, items });
  }
  return out;
});

let timer: ReturnType<typeof setInterval> | undefined;
const onVisible = () => {
  if (document.visibilityState === 'visible') void load();
};
onMounted(() => {
  void load();
  timer = setInterval(() => void load(), 240_000);
  document.addEventListener('visibilitychange', onVisible);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-else-if="!rest" class="text-muted">{{ t.common.loading }}</div>
  <div v-else>
    <div class="d-flex justify-content-between align-items-center">
      <h5 class="mb-0" data-testid="rest-name">{{ rest.name }}</h5>
      <span class="small">
        <RouterLink to="/weather"
          ><i class="bi bi-cloud-sun"></i>
          {{ rest.weather ? catalog.weatherName(rest.weather.id, rest.weather.name) : '' }}</RouterLink
        >
        <RouterLink to="/shards" class="ms-2">{{ t.nav.links.shards }}</RouterLink>
      </span>
    </div>
    <AnnounceBanner :items="announcements" />
    <HiphopCard :rest-id="rest.id" class="mt-2" @changed="load" />
    <div v-if="rest.isPlanktonHost" class="alert alert-warning py-2 small" data-testid="plankton">
      <div>
        <b>{{ t.home.plankton.title }}</b
        >{{ t.home.plankton.body1 }}<b>{{ t.home.plankton.bold }}</b
        >{{ t.home.plankton.body2 }}
      </div>
      <button
        class="btn btn-sm btn-outline-dark ms-1"
        :disabled="busy"
        @click="act(() => endpoints.drivePlankton('strength'), t.home.plankton.failed)"
      >
        {{ t.home.plankton.byStrength }}
      </button>
      <button
        class="btn btn-sm btn-outline-dark ms-1"
        :disabled="busy"
        @click="act(() => endpoints.drivePlankton('book'), t.home.plankton.failed)"
      >
        {{ t.home.plankton.byBook }}
      </button>
    </div>

    <!-- 首页第一屏三张卡（问题记录 280）：餐厅、今日待办、小镇动态 -->
    <div class="dt-card my-2 small" data-testid="home-status">
      <div class="d-flex flex-wrap align-items-center gap-1">
        <span class="text-muted"
          >{{ catalog.streetName(rest.streetId, rest.streetName) }} · {{ t.home.stars(rest.starLevel) }} ·
          {{ t.home.level }} <b data-testid="rest-level">{{ rest.level }}</b></span
        >
        <span v-if="rest.state === 2" class="badge bg-danger">{{ t.home.closed }}</span>
        <span v-if="rest.icons.length > 0" data-testid="my-icons">
          <span v-for="i in rest.icons" :key="i.key" class="dt-icon-tag me-1">{{
            catalog.icon(i.key)?.title ?? i.title
          }}</span>
        </span>
      </div>
      <!-- 经验条紧跟等级那一行（问题记录 172：原来卡在资源数字和油量中间） -->
      <div
        class="progress my-2 position-relative"
        role="progressbar"
        :aria-valuenow="expPercent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="progress-bar dt-exp-bar" data-testid="exp-bar" :style="{ width: `${expPercent}%` }"></div>
        <!-- 数字盖在整条进度条上居中，不跟着橙色部分的宽度走 -->
        <span
          data-testid="exp-text"
          class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center small text-dark"
          >{{ formatNum(rest.exp) }}/{{ formatNum(rest.expToNext) }}</span
        >
      </div>
      <div class="row g-1">
        <div class="col-6">
          <i class="bi bi-coin"></i> <b data-testid="rest-coin">{{ formatNum(rest.coin) }}</b>
        </div>
        <div class="col-6"><i class="bi bi-gem"></i> {{ formatNum(rest.diamond) }}</div>
        <!-- 体力、声望也按千分位（问题记录 296：体力很多时只有它没分隔） -->
        <!-- 图标和数字之间留一个空格，和银币、油一致（问题记录 298：这行太长被格式化折成两行时，空格被模板吞掉） -->
        <div class="col-6">
          <i class="bi bi-lightning"></i> <span data-testid="rest-strength">{{ strengthText }}</span>
        </div>
        <div class="col-6" :title="t.home.renown">
          <i class="bi bi-award"></i> <span data-testid="rest-renown">{{ formatNum(rest.renown) }}</span>
        </div>
        <!-- 油和加满在同一个网格里，按钮紧凑，行高和上面一致（280 反馈） -->
        <div class="col-6">
          <i class="bi bi-droplet"></i> {{ formatNum(rest.oil) }}/{{ formatNum(rest.oilMax) }}
        </div>
        <div class="col-6">
          <button
            class="btn btn-outline-primary dt-compact-btn"
            data-testid="refuel"
            :disabled="busy || refuelCost <= 0"
            @click="act(() => endpoints.refuel(), t.home.refuelFailed)"
          >
            {{ t.home.refuel(refuelCost >= refuelNeed, formatNum(refuelCost)) }}
          </button>
        </div>
      </div>
      <div v-if="rest.lastRound" class="border-top mt-2 pt-1" data-testid="last-round">
        {{
          t.home.lastRound(
            formatNum(rest.lastRound.coin),
            formatNum(rest.lastRound.exp),
            formatNum(rest.lastRound.oil),
          )
        }}
        <div class="text-muted dt-clamp1">{{ customers || t.home.noGuests }}</div>
        <RouterLink to="/rest/income">{{ t.home.income }}</RouterLink>
        <RouterLink to="/rest/floor" class="ms-3">{{ t.home.floor }}</RouterLink>
      </div>
      <!-- 常用入口（问题记录：原来只有一个孤零零的厨具入口） -->
      <div class="border-top mt-2 pt-1 d-flex gap-3" data-testid="quick-links">
        <RouterLink v-for="q in QUICK" :key="q.to" :to="q.to" class="text-decoration-none">
          <i :class="['bi', q.icon]"></i> {{ t.nav.links[q.key] }}
        </RouterLink>
      </div>
    </div>

    <div class="dt-card my-2 small dt-todo" data-testid="home-todo">
      <div class="dt-card-title mb-1">{{ t.home.todo }}</div>
      <div v-if="signedIn !== null" class="dt-todo-row" data-testid="home-signin-row">
        <!-- 右边只放短短的「已签到」，领到什么写在标题下面（问题记录 310：一长串挤得换行） -->
        <span class="flex-fill">
          <i class="bi bi-calendar-check me-1"></i>{{ t.home.signIn }}
          <span
            v-if="signedIn && signInGift !== null"
            class="d-block dt-meta"
            data-testid="home-signin-gift"
            >{{ t.home.signInGiftLine(catalog.goodsName(signInGift)) }}</span
          >
        </span>
        <span v-if="signedIn" class="text-success text-nowrap" data-testid="home-signed"
          ><i class="bi bi-check-circle-fill me-1"></i>{{ t.home.signedShort }}</span
        >
        <button
          v-else
          class="btn btn-sm btn-success"
          :disabled="busy"
          data-testid="home-signin"
          @click="act(() => endpoints.signIn(), t.home.signInFailed)"
        >
          {{ t.home.signInBtn }}
        </button>
      </div>
      <!-- flex 让领奖按钮和文字垂直居中（问题记录 118） -->
      <div v-if="mainTask" class="dt-todo-row" data-testid="main-task">
        <div class="flex-fill">
          <!-- 和其他行一样用图标开头（问题记录 302），"主线："写成文字 -->
          <i class="bi bi-flag me-1"></i>{{ t.common.colon(t.home.mainTag)
          }}{{ catalog.data('tasks', mainTask.id)?.name ?? mainTask.name }}
          <span class="text-muted">{{
            t.common.paren(`${Math.min(mainTask.progress, mainTask.target)}/${mainTask.target}`)
          }}</span>
        </div>
        <button
          v-if="mainTask.done"
          class="btn btn-sm btn-success"
          :disabled="busy"
          @click="act(() => endpoints.claimTask(mainTask!.id), t.home.claimFailed)"
        >
          {{ t.home.claim }}
        </button>
      </div>
      <div v-else-if="mainChapter" class="dt-todo-row" data-testid="main-task">
        <div class="flex-fill">
          <i class="bi bi-flag me-1"></i>{{ mainChapterText }}
          <span v-if="mainChapter.locked" class="text-muted">{{
            mainChapter.needStar > 0
              ? t.rest.tasks.lockedStar(mainChapter.needStar)
              : t.rest.tasks.lockedLevel(mainChapter.needLevel)
          }}</span>
        </div>
        <button
          v-if="!mainChapter.locked"
          class="btn btn-sm btn-success"
          :disabled="busy"
          @click="act(() => endpoints.claimChapter(mainChapter!.id), t.home.claimFailed)"
        >
          {{ t.home.claim }}
        </button>
      </div>
      <RouterLink
        v-if="activeTotal !== null"
        to="/rest/tasks"
        class="dt-todo-row text-reset text-decoration-none"
        data-testid="home-activation"
      >
        <span class="flex-fill"
          ><i class="bi bi-check2-square me-1"></i>{{ t.home.activation(activeTotal) }}</span
        >
        <span class="text-primary">{{ t.home.tasks }}</span>
      </RouterLink>
      <ActivityBanner />
      <div v-if="dining" class="dt-todo-row" data-testid="dine-card">
        <div class="flex-fill">
          <i class="bi bi-cup-hot me-1"></i>{{ t.home.dining.before }}
          <RouterLink :to="`/friends/${dining.hostRestId}`">{{ dining.hostName }}</RouterLink>
          {{ t.home.dining.after(dining.tableNo, dining.minutes) }}
        </div>
        <button
          class="btn btn-sm btn-primary"
          data-testid="dine-end"
          :disabled="busy || !dining.canEnd"
          @click="act(() => endpoints.dineEnd(), t.home.dining.endFailed)"
        >
          {{ t.home.dining.end }}
        </button>
      </div>
      <!-- 新手提示（问题记录 150）：有能领的新手码时提示去领；没有时 10 级以前照旧提示看指引 -->
      <RouterLink
        v-if="codesClaimable || rest.level < 10"
        to="/guide"
        class="dt-todo-row"
        data-testid="guide-hint"
        ><i class="bi bi-lightbulb me-1"></i
        >{{ codesClaimable ? t.home.guideCodes : t.home.guideHint }}</RouterLink
      >
    </div>

    <HomeNews :headlines="rest.headlines" />

    <div class="dt-card my-2 small" data-testid="home-devices">
      <div class="dt-card-title mb-1">{{ t.home.devices }}</div>
      <div class="row g-1">
        <div v-for="d in rest.devices" :key="d.slot" class="col-3">
          <button
            class="btn btn-light border w-100 h-100 p-1 dt-slot"
            :data-testid="`slot-${d.slot}`"
            :disabled="!d.unlocked || busy"
            @click="openSlot(d.slot)"
          >
            <div class="text-muted dt-clamp2">{{ catalog.deviceName(d.slot) ?? d.name }}</div>
            <div v-if="!d.unlocked && d.slot === PLAQUE2_SLOT && plaque2Offer">
              <i class="bi bi-lock"></i> {{ t.home.notOpened }}
            </div>
            <div v-else-if="!d.unlocked"><i class="bi bi-lock"></i> {{ t.home.starOpen(needStarOf(d)) }}</div>
            <div v-else-if="d.goodsId">
              {{ catalog.goodsName(d.goodsId) }}<br /><span class="text-muted">{{
                expiresText(d.expiresAt)
              }}</span>
            </div>
            <div v-else>{{ t.home.empty }}</div>
          </button>
        </div>
      </div>
      <div v-if="plaque2Offer" class="dt-item">
        <div class="dt-item-main">
          <div class="dt-item-title">{{ t.home.plaque2.title }}</div>
          <div class="dt-meta">
            <span data-testid="plaque2-cost">{{
              t.home.plaque2.cost(formatNum(rest.plaque2Cost.coin), rest.plaque2Cost.diamond)
            }}</span>
            <span v-if="plaque2Block" class="text-danger ms-1" data-testid="plaque2-block">{{
              plaque2Block
            }}</span>
          </div>
        </div>
        <div class="dt-item-actions">
          <button
            class="btn btn-sm btn-outline-primary"
            data-testid="open-plaque2"
            :disabled="busy || !!plaque2Block"
            @click="openPlaque2"
          >
            {{ t.home.plaque2.open }}
          </button>
        </div>
      </div>
      <div v-if="pickingSlot !== null" class="border rounded p-2 mt-2 small">
        <div class="d-flex justify-content-between">
          <b>{{ t.home.pick }}</b>
          <a href="#" @click.prevent="pickingSlot = null">{{ t.common.cancel }}</a>
        </div>
        <div v-if="choices.length === 0" class="text-muted">{{ t.home.noChoices }}</div>
        <!-- 星级不够的高档海报奖杯变灰，写几星可用（backlog 146） -->
        <button
          v-for="c in choices"
          :key="c.goodsId"
          class="btn btn-sm btn-outline-primary me-1 mt-1"
          :disabled="(c.needStar ?? 0) > (rest?.starLevel ?? 0)"
          :data-testid="`choice-${c.goodsId}`"
          @click="place(c.goodsId)"
        >
          {{ t.common.qty(catalog.goodsName(c.goodsId), c.num)
          }}<span v-if="(c.needStar ?? 0) > (rest?.starLevel ?? 0)" class="ms-1 small">{{
            t.store.shop.why.star(c.needStar!)
          }}</span>
        </button>
      </div>
    </div>

    <!-- 经营开关（280 反馈）：每项一行，名字在左、开关或档位在右 -->
    <div class="dt-card my-2 small" data-testid="home-switches">
      <div class="dt-card-title mb-1">{{ t.home.switches }}</div>
      <label class="dt-todo-row mb-0" for="promo">
        <span class="flex-fill"
          >{{ t.home.promo }}<span class="dt-meta ms-1">{{ t.home.promoHint }}</span></span
        >
        <span class="form-check form-switch m-0">
          <input
            id="promo"
            class="form-check-input"
            type="checkbox"
            :checked="rest.promoOn"
            :disabled="busy"
            @change="act(() => endpoints.setPromo(!rest!.promoOn), t.home.setFailed)"
          />
        </span>
      </label>
      <label class="dt-todo-row mb-0" for="cte">
        <span class="flex-fill"
          >{{ t.home.cte }}<span class="dt-meta ms-1">{{ t.home.cteHint }}</span></span
        >
        <span class="form-check form-switch m-0">
          <input
            id="cte"
            class="form-check-input"
            type="checkbox"
            :checked="rest.cteOn"
            :disabled="busy"
            @change="act(() => endpoints.setCte(!rest!.cteOn), t.home.setFailed)"
          />
        </span>
      </label>
      <template v-if="rest.starLevel >= 6">
        <div class="dt-todo-row" data-testid="cookfoods-row">
          <span class="flex-fill">{{ t.home.cookfoods }}</span>
          <select
            class="form-select form-select-sm w-auto"
            :value="rest.cookfoodsFlag"
            :disabled="busy"
            @change="
              act(
                () => endpoints.setCookfoods(Number(($event.target as HTMLSelectElement).value)),
                t.home.setFailed,
              )
            "
          >
            <option v-for="f in [0, 1, 2, 3, 4, 5]" :key="f" :value="f">
              {{ f === 0 ? t.home.off : t.home.tier(f) }}
            </option>
          </select>
        </div>
        <details class="dt-meta" data-testid="cookfoods-help">
          <summary>{{ t.home.whatIs }}</summary>
          <div data-testid="cookfoods-hint">
            {{ t.home.cookfoodsHint(rest.cookfoodsPerFlag) }}
          </div>
        </details>
      </template>
    </div>

    <!-- 生效的加成默认折叠成一行摘要（问题记录 280） -->
    <details class="dt-card my-2 small" data-testid="effects">
      <summary>
        <span class="dt-card-title">{{ t.home.effects }}</span>
        <span class="text-muted ms-1">{{
          t.home.effectsCount(rest.effects.length + rest.boosts.length, effectsSummary)
        }}</span>
      </summary>
      <!-- 正在生效的全服加成活动（问题记录 294）：直接改区服数值，不是加成来源，单独一组 -->
      <template v-if="rest.boosts.length > 0">
        <div class="text-muted mt-1" data-testid="effect-group">{{ t.home.groups.activity }}</div>
        <div
          v-for="b in rest.boosts"
          :key="`boost-${b.id}`"
          class="d-flex flex-wrap align-items-center gap-1 border-bottom py-1"
          data-testid="boost-row"
        >
          <i class="bi bi-megaphone"></i>
          <b>{{ b.title }}</b>
          <span class="flex-fill d-flex flex-wrap gap-1">
            <span v-for="i in b.items" :key="i.key" class="dt-chip dt-chip-good"
              >{{ t.activity.boosts[i.key] ?? i.key }} ×{{ i.factor }}</span
            >
          </span>
          <span class="text-muted text-nowrap ms-auto">{{ expiresText(b.endsAt) }}</span>
        </div>
      </template>
      <template v-for="g in effectGroups" :key="g.type">
        <div class="text-muted mt-1" data-testid="effect-group">{{ t.home.groups[g.type] }}</div>
        <div
          v-for="e in g.items"
          :key="`${e.sourceType}-${e.sourceId}`"
          class="d-flex flex-wrap align-items-center gap-1 border-bottom py-1"
          data-testid="effect-row"
        >
          <GameImg :path="`goods/${e.name}`" :alt="effectName(e, catalog)" fallback-icon="bi-award" />
          <b>{{ effectName(e, catalog) }}</b>
          <span class="flex-fill d-flex flex-wrap gap-1">
            <span
              v-for="c in effectChips(e.effects)"
              :key="c.text"
              :class="['dt-chip', c.good ? 'dt-chip-good' : 'dt-chip-bad']"
              >{{ c.text }}</span
            >
          </span>
          <span class="text-muted text-nowrap ms-auto">{{ effectExpires(e) }}</span>
        </div>
      </template>
      <a
        v-if="rest.effects.length > EFFECTS_SHOWN"
        href="#"
        class="d-block mt-1"
        data-testid="effects-more"
        @click.prevent="effectsAll = !effectsAll"
        >{{ effectsAll ? t.home.collapse : t.home.expandAll(rest.effects.length) }}</a
      >
    </details>
  </div>
</template>
