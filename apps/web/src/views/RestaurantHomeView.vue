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
import { serverNowMs } from '../utils/serverNow';
import { remainText } from '../utils/remain';
import { effectName } from '../utils/serverText';
import { CUSTOMER_NAMES } from '../utils/labels';
import { restName } from '../utils/npcName';

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
/** 主线全做完（终审 C1：这时也要有一行放任务入口，每周和支线还要从这里进） */
const mainAllDone = ref(false);
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
const activeTotal = ref<number | null>(null);
/** 有够了点数还没领的活跃档位（问题记录 481）：今日活跃后面跟一个礼物图标 */
const activeClaimable = ref(false);
async function loadSignIn() {
  try {
    const a = await endpoints.activation();
    signedIn.value = a.signedIn;
    activeTotal.value = a.total;
    activeClaimable.value = a.rewards.some((r) => !r.claimed && a.total >= r.points);
  } catch {
    signedIn.value = null;
    activeTotal.value = null;
    activeClaimable.value = false;
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
  // 概况、任务、白食互不依赖，一起读（性能排查 2026-10-08：原来一个接一个，线上多两轮往返）
  const tasksReq = endpoints.tasks();
  const dineReq = endpoints.dineCurrent();
  // 先挂上处理：概况读失败提前跳出时，这两个的失败不成为没人接的 rejection
  tasksReq.catch(() => undefined);
  dineReq.catch(() => undefined);
  try {
    await store.refresh();
    void loadGuideCodes();
    // 本章第一个可领的；没有可领的显示第一个没完成的（问题记录 318）
    // 本章任务都领完时显示章末奖励，章锁定时写解锁条件
    // 任务单独读：读失败（比如前端先上线、服务端还没更新）只少了主线行，不让整个首页报错（问题记录 327）
    try {
      const q = await tasksReq;
      // 补领的任务（backlog 318）只在能领时占主线行，没完成的不显示；旧服务端没有 leftover 时按空的算
      const ready =
        q.main.find((x) => x.done && !x.claimed) ?? (q.leftover ?? []).find((x) => x.done && !x.claimed);
      const chapterRow = q.chapter && (q.chapter.claimable || q.chapter.locked);
      mainTask.value = ready ?? (chapterRow ? null : (q.main.find((x) => !x.done) ?? null));
      mainChapter.value = !ready && chapterRow ? q.chapter : null;
      mainAllDone.value = q.allMainDone;
    } catch {
      mainTask.value = null;
      mainChapter.value = null;
      mainAllDone.value = false;
    }
    dining.value = await dineReq;
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
    (current.expiresAt === null || new Date(current.expiresAt).getTime() > serverNowMs()) &&
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

/** 餐厅卡底部（问题记录 447）：原来的厨具、仓库、商店入口换成食谱数和在售特色菜；区服关了的不显示 */
const showBooks = computed(() => store.featureOn('cookbook'));
/** 任务入口看区服功能开关（原来“更多”里的入口也看） */
const showTasks = computed(() => store.featureOn('task'));
const showSpecial = computed(() => store.featureOn('mysterious'));
/** 菜名和几级分两段：放不下时只截菜名（审查 I2） */
const specialName = computed(() => {
  const sp = rest.value?.special;
  return sp ? t.value.home.special(catalog.mcName(sp.id)) : t.value.home.specialNone;
});
const refuelText = computed(() =>
  t.value.home.refuel(refuelCost.value >= refuelNeed.value, formatNum(refuelCost.value)),
);

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
        <RouterLink to="/weather" class="dt-go"
          ><i class="bi bi-cloud-sun"></i>
          {{ rest.weather ? catalog.weatherName(rest.weather.id, rest.weather.name) : '' }}</RouterLink
        >
        <RouterLink to="/shards" class="dt-go ms-2">{{ t.nav.links.shards }}</RouterLink>
      </span>
    </div>
    <AnnounceBanner :items="announcements" />
    <!-- 被收购时（问题记录 421）：归谁所有，去收购页打理、赎身 -->
    <div
      v-if="rest.acquireOwner"
      class="alert alert-info py-1 px-2 small mt-2 mb-0"
      data-testid="home-acquired"
    >
      {{ t.acquire.homeOwned(rest.acquireOwner.name) }}
      <RouterLink to="/acquire?tab=mine" class="dt-go ms-1">{{ t.acquire.homeLink }}</RouterLink>
    </div>
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
          ><i class="bi bi-mortarboard me-1" aria-hidden="true"></i>{{ formatNum(rest.exp) }}/{{
            formatNum(rest.expToNext)
          }}</span
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
          <!-- 油壶升级的入口（问题记录 435） -->
          <RouterLink
            to="/society/oil"
            class="d-inline-block px-1 text-decoration-none"
            :title="t.home.oilUpgrade"
            :aria-label="t.home.oilUpgrade"
            data-testid="oil-upgrade"
            ><i class="bi bi-arrow-up-circle"></i
          ></RouterLink>
        </div>
        <!-- 加油用图标加文字链接，不用按钮，行高和上面两行一样（问题记录 447） -->
        <div class="col-6">
          <!-- 看得见的是“加满/加油”和银币数，整句放读屏标签和悬停提示；名字放不下才截断，数字不截（审查 I1） -->
          <button
            type="button"
            class="dt-link-btn d-inline-flex align-items-center gap-1 mw-100"
            data-testid="refuel"
            :title="refuelText"
            :aria-label="refuelText"
            :disabled="busy || refuelCost <= 0"
            @click="act(() => endpoints.refuel(), t.home.refuelFailed)"
          >
            <i class="bi bi-droplet-fill" aria-hidden="true"></i
            ><span class="text-truncate">{{ t.home.refuelShort(refuelCost >= refuelNeed) }}</span
            ><span class="flex-shrink-0"
              ><i class="bi bi-coin me-1" aria-hidden="true"></i>{{ formatNum(refuelCost) }}</span
            >
          </button>
        </div>
      </div>
      <!-- 上一轮（问题记录 433）：银币、经验、耗油用图标，悬停写名字；两个入口各放在一行的右边 -->
      <!-- 还没结算过也显示这块：楼层页能灭蟑螂、赶白食，入口不能没有（问题记录 447 去掉了“更多”里的入口） -->
      <div class="border-top mt-2 pt-1" data-testid="last-round">
        <div v-if="!rest.lastRound" class="d-flex flex-wrap align-items-center gap-2">
          <span class="dt-shrink text-muted">{{ t.home.noRound }}</span>
          <RouterLink to="/rest/income" class="dt-go">{{ t.home.income }}</RouterLink>
          <RouterLink to="/rest/floor" class="dt-go">{{ t.home.floor }}</RouterLink>
        </div>
        <div v-if="rest.lastRound" class="d-flex align-items-center gap-2">
          <!-- 每一项不拆开，放不下时整项换到下一行（法文“收益记录”长，原来被挤出屏幕） -->
          <span class="dt-shrink" data-testid="last-round-line"
            >{{ t.home.lastRound }}
            <span class="text-nowrap"
              ><i class="bi bi-coin" :title="t.home.roundCoin" aria-hidden="true"></i
              ><span class="visually-hidden">{{ t.home.roundCoin }}</span>
              {{ formatNum(rest.lastRound.coin) }}</span
            >
            <span class="text-nowrap ms-1"
              ><i class="bi bi-mortarboard" :title="t.home.roundExp" aria-hidden="true"></i
              ><span class="visually-hidden">{{ t.home.roundExp }}</span>
              {{ formatNum(rest.lastRound.exp) }}</span
            >
            <span class="text-nowrap ms-1"
              ><i class="bi bi-droplet" :title="t.home.roundOil" aria-hidden="true"></i
              ><span class="visually-hidden">{{ t.home.roundOil }}</span>
              {{ formatNum(rest.lastRound.oil) }}</span
            ></span
          >
          <RouterLink to="/rest/income" class="dt-go">{{ t.home.income }}</RouterLink>
        </div>
        <div v-if="rest.lastRound" class="d-flex align-items-center gap-2">
          <span class="dt-shrink text-muted dt-clamp1" data-testid="last-round-guests">{{
            customers || t.home.noGuests
          }}</span>
          <RouterLink to="/rest/floor" class="dt-go">{{ t.home.floor }}</RouterLink>
        </div>
      </div>
      <!-- 食谱数、在售特色菜（问题记录 447）：原来的厨具、仓库、商店入口 -->
      <!-- 左边食谱数不换行，右边特色菜占剩下的宽度，放不下才截断（菜名长时几级不被挤掉） -->
      <div
        v-if="showBooks || showSpecial"
        class="border-top mt-2 pt-1 d-flex align-items-center gap-3"
        data-testid="home-books"
      >
        <RouterLink v-if="showBooks" to="/cookbooks" class="dt-go flex-shrink-0" data-testid="home-cookbooks"
          ><i class="bi bi-journal-text"></i>
          {{
            t.home.cookbooks(formatNum(rest.cookbooks.learned), formatNum(rest.cookbooks.total))
          }}</RouterLink
        >
        <RouterLink
          v-if="showSpecial"
          to="/mc"
          class="dt-go ms-auto d-flex align-items-center gap-1 dt-min0"
          data-testid="home-special"
          ><i class="bi bi-stars"></i><span class="text-truncate">{{ specialName }}</span
          ><span v-if="rest.special" class="flex-shrink-0">{{
            t.home.specialLevel(rest.special.level)
          }}</span></RouterLink
        >
      </div>
      <!-- 资产：名下的店身价合计，和投资榜一样；收购的入口从“更多”挪到这里（问题记录 447） -->
      <div
        v-if="rest.assets !== null"
        class="border-top mt-2 pt-1 d-flex align-items-center gap-2"
        data-testid="home-assets"
      >
        <span class="dt-shrink"
          ><i class="bi bi-briefcase"></i> {{ t.home.assets(formatNum(rest.assets)) }}</span
        >
        <RouterLink to="/acquire" class="dt-go">{{ t.nav.links.acquire }}</RouterLink>
      </div>
    </div>

    <div class="dt-card my-2 small dt-todo" data-testid="home-todo">
      <div class="dt-card-title mb-1">{{ t.home.todo }}</div>
      <!-- 签到和今日活跃一行（问题记录 437）：签到在左，签完字样右边一个对勾；领到什么写在下面；右边是今日活跃 -->
      <div v-if="signedIn !== null" class="dt-todo-row flex-wrap" data-testid="home-signin-row">
        <span class="flex-fill text-nowrap">
          <i class="bi bi-calendar-check me-1"></i>{{ t.home.signIn }}
          <!-- 问题记录 445：签完是一个细线对勾，没签是文字链接，不用绿色实心图标和大按钮 -->
          <span v-if="signedIn" data-testid="home-signed"
            ><i class="bi bi-check2 text-success ms-1" :title="t.home.signedShort" aria-hidden="true"></i
            ><span class="visually-hidden">{{ t.home.signedShort }}</span></span
          >
          <button
            v-else
            type="button"
            class="dt-link-btn ms-2"
            :disabled="busy"
            data-testid="home-signin"
            @click="act(() => endpoints.signIn(), t.home.signInFailed)"
          >
            {{ t.home.signInBtn }}
          </button>
        </span>
        <RouterLink
          v-if="activeTotal !== null"
          to="/rest/activation"
          class="dt-go ms-auto d-inline-block py-1"
          data-testid="home-activation"
          >{{ t.home.activation(activeTotal)
          }}<span v-if="activeClaimable" class="text-primary ms-1" data-testid="home-activation-gift"
            ><i class="bi bi-gift" aria-hidden="true"></i
            ><span class="visually-hidden">{{ t.home.activationClaimable }}</span></span
          ></RouterLink
        >
      </div>
      <!-- flex 让领奖按钮和文字垂直居中（问题记录 118） -->
      <div v-if="mainTask" class="dt-todo-row" data-testid="main-task">
        <div class="flex-fill">
          <!-- 和其他行一样用图标开头（问题记录 302），"主线："写成文字 -->
          <i class="bi bi-flag me-1"></i>{{ t.common.colon(t.home.mainTag)
          }}{{ catalog.data('tasks', mainTask.id)?.name ?? mainTask.name }}
          <span class="text-muted">{{
            t.common.paren(
              `${formatNum(Math.min(mainTask.progress, mainTask.target))}/${formatNum(mainTask.target)}`,
            )
          }}</span>
        </div>
        <!-- 领奖和签到一样是文字链接：礼物图标加文字（问题记录 469） -->
        <button
          v-if="mainTask.done"
          type="button"
          class="dt-link-btn"
          :disabled="busy"
          @click="act(() => endpoints.claimTask(mainTask!.id), t.home.claimFailed)"
        >
          <i class="bi bi-gift me-1" aria-hidden="true"></i>{{ t.home.claim }}
        </button>
        <!-- 任务入口（问题记录：“更多”里的任务入口去掉，从这里进） -->
        <RouterLink
          v-else-if="showTasks"
          to="/rest/tasks"
          class="dt-go text-nowrap"
          data-testid="home-tasks-link"
          >{{ t.home.tasksLink }}</RouterLink
        >
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
          type="button"
          class="dt-link-btn"
          :disabled="busy"
          @click="act(() => endpoints.claimChapter(mainChapter!.id), t.home.claimFailed)"
        >
          <i class="bi bi-gift me-1" aria-hidden="true"></i>{{ t.home.claim }}
        </button>
        <RouterLink
          v-else-if="showTasks"
          to="/rest/tasks"
          class="dt-go text-nowrap"
          data-testid="home-tasks-link"
          >{{ t.home.tasksLink }}</RouterLink
        >
      </div>
      <div v-else-if="showTasks" class="dt-todo-row" data-testid="main-task">
        <div class="flex-fill">
          <i class="bi bi-flag me-1"></i>{{ mainAllDone ? t.rest.tasks.mainDone : t.rest.tasks.main }}
        </div>
        <RouterLink to="/rest/tasks" class="dt-go text-nowrap" data-testid="home-tasks-link">{{
          t.home.tasksLink
        }}</RouterLink>
      </div>
      <ActivityBanner />
      <div v-if="dining" class="dt-todo-row" data-testid="dine-card">
        <div class="flex-fill">
          <i class="bi bi-cup-hot me-1"></i>{{ t.home.dining.before }}
          <RouterLink :to="`/friends/${dining.hostRestId}`" class="text-decoration-none">{{
            restName(dining.hostRestId, dining.hostName)
          }}</RouterLink>
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
        class="dt-todo-row text-reset text-decoration-none"
        data-testid="guide-hint"
        ><span class="flex-fill"
          ><i class="bi bi-lightbulb me-1"></i
          >{{ codesClaimable ? t.home.guideCodes : t.home.guideHint }}</span
        ><span class="dt-go">{{ t.nav.links.guide }}</span></RouterLink
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
        <!-- 取消的点击区域往外扩了 8px（.dt-link-btn::before），下面留 8px 别盖住第一排选项（终审） -->
        <div class="d-flex justify-content-between mb-2" data-testid="pick-head">
          <b>{{ t.home.pick }}</b>
          <button type="button" class="dt-link-btn" @click="pickingSlot = null">{{ t.common.cancel }}</button>
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
      <button
        v-if="rest.effects.length > EFFECTS_SHOWN"
        type="button"
        class="dt-link-btn d-block mt-1"
        data-testid="effects-more"
        :aria-expanded="effectsAll"
        @click="effectsAll = !effectsAll"
      >
        {{ effectsAll ? t.home.collapse : t.home.expandAll(rest.effects.length) }}
      </button>
    </details>
  </div>
</template>
