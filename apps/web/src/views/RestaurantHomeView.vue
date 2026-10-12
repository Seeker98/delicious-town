<script setup lang="ts">
import { firstClaimableTab, type TaskTab } from '../utils/tasks';
import IconTag from '../components/IconTag.vue';
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
import DtArt from '../components/DtArt.vue';
import DtSheet from '../components/DtSheet.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtLevelRing from '../components/DtLevelRing.vue';
import DtResPill from '../components/DtResPill.vue';
import DtRow from '../components/DtRow.vue';
import HomeStatus from '../components/home/HomeStatus.vue';
import HomeScene from '../components/home/HomeScene.vue';
import HomeFeed from '../components/town/HomeFeed.vue';
import HomeNews from '../components/town/HomeNews.vue';
import { useT } from '../composables/useT';
import type { Messages } from '../i18n';
import { errorMessage } from '../i18n/zh-CN';
import type { UiArtName } from '../art/generated/names';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import { usePageTitle } from '../stores/pageTitle';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { effectChips } from '../utils/effects';
import { formatNum, timeHM } from '../utils/format';
import { questTitle } from '../utils/questName';
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
/** 顶栏标题是店名（界面改版 P2a） */
usePageTitle(() => rest.value?.name);
const error = ref('');
const busy = ref(false);
const mainTask = ref<QuestDto | null>(null);
/** 没有可领的任务时：本章任务都领了 → 章末奖励；当前章锁定 → 解锁条件（问题记录 318） */
const mainChapter = ref<QuestsDto['chapter']>(null);
/** 主线全做完（终审 C1：这时也要有一行放任务入口，每周和支线还要从这里进） */
const mainAllDone = ref(false);
/** 任务页第一个有奖励可领的卡（问题记录 555）；读不到任务时为 null */
const claimTab = ref<TaskTab | null>(null);
/** 没有能领的进主线：任务页不带 ?tab 时是“今日”（界面改版 P2b） */
const tasksTo = computed(() => `/rest/tasks?tab=${claimTab.value ?? 'main'}`);
/** 首页交易所一行的文字（问题记录 591） */
const exchangeRowText = computed(() => {
  const b = rest.value?.exchangeHint?.bulk;
  const h = t.value.home;
  if (b) return h.row.bulkSub(catalog.foodName(b.foodsId), b.level, b.qty, b.demand);
  // 区服关了期货时不写“期货点名订货”
  return store.featureOn('futures') ? h.row.exchangeSub : h.row.exchangeSubSpot;
});
const chapterName = (c: NonNullable<QuestsDto['chapter']>) => catalog.data('chapters', c.id)?.name ?? c.name;
/** "主线：第 2 章 小店经营"：拼成一段，模板里换行不会在冒号后多出空格 */
/** 主线块的副行：章末奖励或解锁条件的正文（标题已经写了“主线”） */
const mainChapterBody = computed(() => {
  const c = mainChapter.value;
  if (!c) return '';
  const x = t.value.rest.tasks;
  return c.locked ? x.chapterLocked(c.id, chapterName(c)) : x.chapterAwardRow(c.id, chapterName(c));
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
      claimTab.value = firstClaimableTab(q);
    } catch {
      mainTask.value = null;
      mainChapter.value = null;
      mainAllDone.value = false;
      claimTab.value = null;
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

/** 天气后面一句预报（天气改版）：“17 点后多半还是雨”；旧服务端没有预报就不写 */
const weatherForecast = computed(() => {
  const w = rest.value?.weather;
  const f = w?.forecast;
  if (!w || !f) return null;
  const type = t.value.misc.weather.types[f.type] ?? '';
  const cur = catalog.weather(w.id)?.type;
  return t.value.home.forecast(Number(timeHM(f.at).slice(0, 2)), type, cur === f.type, f.p >= 0.5);
});
const expPercent = computed(() =>
  rest.value ? Math.min(100, Math.floor((rest.value.exp / rest.value.expToNext) * 100)) : 0,
);
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
/** 设施位：开了的、没开的分开排（P5 返工） */
const openDevices = computed(() => (rest.value?.devices ?? []).filter((d) => d.unlocked));
const lockedDevices = computed(() => (rest.value?.devices ?? []).filter((d) => !d.unlocked));
/** 设施标题右边写空着几格（问题记录 619） */
const emptySlots = computed(() => openDevices.value.filter((d) => !d.goodsId).length);
/** 锁着的设施位并成一行字（问题记录 619）：按几星开放归在一起，“2★ ×2 · 3★ · 12★”；没开通的第二块牌匾写“未开通” */
const lockedText = computed(() => {
  const h = t.value.home;
  const stars = new Map<number, number>();
  let notOpened = 0;
  for (const d of lockedDevices.value) {
    if (d.slot === PLAQUE2_SLOT && plaque2Offer.value) notOpened += 1;
    else stars.set(needStarOf(d), (stars.get(needStarOf(d)) ?? 0) + 1);
  }
  const list = [...stars].sort(([a], [b]) => a - b).map(([star, n]) => h.lockedStar(star, n));
  if (notOpened > 0) list.push(h.notOpened);
  return h.lockedLine(lockedDevices.value.length, list.join(' · '));
});
/** 没开的设施位的全称：名字 + 几星开放（小格子里只写“12★”，全称给悬停和读屏） */
const lockedLabel = (d: { slot: number; name: string; needStar: number }) =>
  `${catalog.deviceName(d.slot) ?? d.name} · ${d.slot === PLAQUE2_SLOT && plaque2Offer.value ? t.value.home.notOpened : t.value.home.starOpen(needStarOf(d))}`;
/** 正在换的那个设施位（面板上写现在摆的是什么、还剩多久） */
const pickingDevice = computed(() => rest.value?.devices.find((d) => d.slot === pickingSlot.value) ?? null);
const choices = computed(() => {
  const slot = options.value?.slots.find((s) => s.slot === pickingSlot.value);
  if (!slot || !options.value) return [];
  return options.value.store.filter((x) => x.deviceType === slot.deviceType);
});
async function place(goodsId: number) {
  const slot = pickingSlot.value!;
  pickingSlot.value = null;
  // 替换还没到期的设施：旧设施直接作废、不退还，先让玩家确认（界面改版 P3：底部确认面板）
  const current = rest.value?.devices.find((d) => d.slot === slot);
  if (
    current?.goodsId &&
    (current.expiresAt === null || new Date(current.expiresAt).getTime() > serverNowMs()) &&
    !(await confirm.ask({
      title: t.value.home.replaceConfirm(catalog.goodsName(current.goodsId), expiresText(current.expiresAt)),
    }))
  )
    return;
  return act(() => endpoints.placeDevice(slot, goodsId), t.value.home.placeFailed);
}

const confirm = useConfirmStore();
/** 设施格子的图标：按设施类型（1 宣传海报、2 奖杯、3 节油器、4 捕鼠夹、5 蟑螂药、6 牌匾），界面改版 P3 */
const DEVICE_ART: Record<number, UiArtName> = {
  1: 'fac-poster',
  2: 'fac-trophy',
  3: 'fac-oilsaver',
  4: 'fac-mousetrap',
  5: 'fac-roach',
  6: 'fac-plaque',
};

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
async function openPlaque2() {
  const c = rest.value!.plaque2Cost;
  if (plaque2Block.value) return;
  const yes = await confirm.ask({
    title: t.value.home.plaque2.confirm(formatNum(c.coin), c.diamond),
    ok: t.value.home.plaque2.open,
  });
  if (!yes) return;
  // 花费由全局的得失提示显示
  return act(() => endpoints.openPlaque2(), t.value.home.plaque2.failed);
}

const expiresText = (at: string | null) => remainText(at);
const effectExpires = (e: EffectDto) => expiresText(e.expiresAt);
const strengthText = computed(() =>
  rest.value ? `${formatNum(rest.value.strength)}/${formatNum(rest.value.strengthMax)}` : '',
);

/**
 * 头图下的胶囊、等级环点开的小面板（问题记录 619）：是什么、怎么来、去哪用。
 * 不写死区服能改的数（每级加多少、每轮恢复多少），只写规则
 */
type InfoKind = 'level' | 'coin' | 'strength' | 'diamond' | 'renown';
const info = ref<InfoKind | null>(null);
const infoView = computed(() => {
  const r = rest.value;
  const k = info.value;
  if (!r || !k) return null;
  const x = t.value.home.info;
  const last = r.lastRound;
  if (k === 'level')
    return {
      title: x.level(r.level),
      sub: x.levelSub(formatNum(r.exp), formatNum(r.expToNext), formatNum(Math.max(0, r.expToNext - r.exp))),
      rows: [[x.perLevel, x.perLevelText], ...(last ? [[x.lastExp, `+${formatNum(last.exp)}`]] : [])],
      to: '/rest/income',
      link: x.toIncome,
    };
  if (k === 'coin')
    return {
      title: x.coin(formatNum(r.coin)),
      sub: x.coinSub,
      rows: last ? [[x.lastCoin, `+${formatNum(last.coin)}`]] : [],
      to: '/rest/income',
      link: x.toIncome,
    };
  if (k === 'strength')
    return {
      title: x.strength(strengthText.value),
      sub: (r.strength >= r.strengthMax ? x.strengthFull : '') + x.strengthSub,
      rows: [[x.use, x.strengthUse]],
      to: '/shop',
      link: x.toShop,
    };
  if (k === 'diamond')
    return {
      title: x.diamond(formatNum(r.diamond)),
      sub: x.diamondSub,
      rows: [[x.from, x.diamondFrom]],
      to: '/shop?tab=black',
      link: x.toBlack,
    };
  return {
    title: x.renown(formatNum(r.renown)),
    sub: x.renownSub,
    rows: [[x.use, x.renownUse]],
    to: '/tower?tab=shop',
    link: x.toRenownShop,
  };
});
/** 胶囊按钮的读屏名字：名字 + 数值 + 点开看说明 */
const pillLabel = (name: string, value: string) => t.value.home.info.open(`${name} ${value}`);

/** 餐厅卡底部（问题记录 447）：原来的厨具、仓库、商店入口换成食谱数和在售特色菜；区服关了的不显示 */
const showBooks = computed(() => store.featureOn('cookbook'));
/** 任务入口看区服功能开关（原来“更多”里的入口也看） */
const showTasks = computed(() => store.featureOn('task'));
/** 店里有蟑螂时“楼层餐桌”前加虫子图标（问题记录 561） */
const hasRoach = computed(() => !!store.rest?.tables.some((x) => x.customer === 3));
const showSpecial = computed(() => store.featureOn('mysterious'));
/** 菜名和几级分两段：放不下时只截菜名（审查 I2） */
const specialName = computed(() => {
  const sp = rest.value?.special;
  return sp ? t.value.home.special(catalog.mcName(sp.id)) : t.value.home.specialNone;
});

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
  <DtSkeleton v-else-if="!rest" :rows="6" data-testid="home-skeleton" />
  <div v-else>
    <!-- 首页最上面（界面改版 P5，样稿 B）：场景头图、等级环和称号、资源、营业状态 -->
    <section class="dt-home-top" data-testid="home-status">
      <HomeScene :door="rest.door" :closed="rest.state === 2" data-testid="home-hero">
        <template #meta>
          <span class="dt-scene-street"
            >{{ catalog.streetName(rest.streetId, rest.streetName) }} ·
            {{ t.home.stars(rest.starLevel) }}</span
          >
          <template v-if="rest.weather">
            <span class="dt-scene-sep" aria-hidden="true">·</span>
            <RouterLink to="/weather" class="dt-go">{{
              catalog.weatherName(rest.weather.id, rest.weather.name)
            }}</RouterLink>
            <span v-if="weatherForecast" class="dt-scene-fc" data-testid="home-forecast"
              >· {{ weatherForecast }}</span
            >
          </template>
        </template>
        <template #aside>
          <RouterLink to="/shards">{{ t.nav.links.shards }}</RouterLink>
        </template>
      </HomeScene>
      <!-- 等级环往上压进头图；右边称号和经验数字（经验条换成等级环） -->
      <div class="dt-home-level" data-testid="home-level">
        <!-- 等级环可以点：弹出经验和升级的说明（问题记录 619） -->
        <button
          type="button"
          class="dt-home-ring-btn"
          data-testid="info-level"
          :aria-label="t.home.info.open(t.home.info.level(rest.level))"
          @click="info = 'level'"
        >
          <DtLevelRing :level="rest.level" :percent="expPercent"
            ><span data-testid="rest-level">{{ rest.level }}</span></DtLevelRing
          >
        </button>
        <div class="dt-home-level-main">
          <!-- 称号多时不换行，放不下的藏起来（终审 I4）；弹性盒按行高居中（问题记录 563） -->
          <div v-if="rest.icons.length > 0" class="dt-home-tags">
            <span class="d-inline-flex align-items-center" data-testid="my-icons">
              <IconTag v-for="i in rest.icons" :key="i.key" :title="catalog.icon(i.key)?.title ?? i.title" />
            </span>
          </div>
          <span class="dt-home-exp" data-testid="exp-text"
            ><DtArt name="res-exp" :size="14" class="me-1" />{{ formatNum(rest.exp) }}/{{
              formatNum(rest.expToNext)
            }}</span
          >
        </div>
      </div>
      <!-- 资源一排彩色胶囊，名字给读屏；油在营业状态卡里（界面改版 P5） -->
      <div class="dt-home-res" data-testid="home-resources">
        <!-- 每个胶囊都能点开看说明（问题记录 619） -->
        <DtResPill
          art="res-coin-silver"
          :label="t.events.kind.coin"
          clickable
          :open-label="pillLabel(t.events.kind.coin, formatNum(rest.coin))"
          data-testid="info-coin"
          @click="info = 'coin'"
          ><span data-testid="rest-coin">{{ formatNum(rest.coin) }}</span></DtResPill
        >
        <!-- 体力、声望也按千分位（问题记录 296） -->
        <DtResPill
          art="res-strength"
          :label="t.events.kind.strength"
          clickable
          :open-label="pillLabel(t.events.kind.strength, strengthText)"
          data-testid="info-strength"
          @click="info = 'strength'"
          ><span data-testid="rest-strength">{{ strengthText }}</span></DtResPill
        >
        <DtResPill
          art="res-diamond"
          :label="t.events.kind.diamond"
          clickable
          :open-label="pillLabel(t.events.kind.diamond, formatNum(rest.diamond))"
          data-testid="info-diamond"
          @click="info = 'diamond'"
          ><span>{{ formatNum(rest.diamond) }}</span></DtResPill
        >
        <DtResPill
          art="res-prestige"
          :label="t.events.kind.renown"
          :title="t.home.renown"
          clickable
          :open-label="pillLabel(t.events.kind.renown, formatNum(rest.renown))"
          data-testid="info-renown"
          @click="info = 'renown'"
          ><span data-testid="rest-renown">{{ formatNum(rest.renown) }}</span></DtResPill
        >
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

      <!-- 营业状态卡：这一页的主角（界面改版 P5，设计 §1.1 第 2 条） -->
      <HomeStatus :rest="rest" :busy="busy" @refuel="act(() => endpoints.refuel(), t.home.refuelFailed)" />
    </section>

    <!-- 上一轮（界面改版 P5）：标题整行去收益记录；三个统计块；楼层餐桌一行（写这轮来了哪些客人） -->
    <!-- 还没结算过也显示这块：楼层页能灭蟑螂、赶白食，入口不能没有（问题记录 447） -->
    <section class="dt-block" data-testid="last-round">
      <RouterLink to="/rest/income" class="dt-block-head is-link" data-testid="home-income-link">
        <h2 class="dt-block-title">{{ t.home.roundTitle }}</h2>
        <span class="dt-block-more">{{ t.home.income }}</span>
      </RouterLink>
      <!-- 三个数和楼层餐桌并成一张卡（问题记录 619）：数字一行，左右边距和下面的行对齐 -->
      <div class="dt-card dt-rows-card">
        <div v-if="rest.lastRound" class="dt-round-stats" data-testid="last-round-line">
          <div class="is-good">
            <b>+{{ formatNum(rest.lastRound.coin) }}</b
            ><span>{{ t.home.roundCoin }}</span>
          </div>
          <div class="is-good">
            <b>+{{ formatNum(rest.lastRound.exp) }}</b
            ><span>{{ t.home.roundExp }}</span>
          </div>
          <div>
            <b>{{ formatNum(rest.lastRound.oil) }}</b
            ><span>{{ t.home.roundOil }}</span>
          </div>
        </div>
        <DtRow to="/rest/floor" :title="t.home.floor" art="nav-home" data-testid="home-floor-row">
          <template #title
            >{{ t.home.floor
            }}<template v-if="hasRoach"
              ><i class="bi bi-bug text-danger ms-1" aria-hidden="true" data-testid="home-floor-roach"></i
              ><span class="visually-hidden">{{ t.home.hasRoach }}</span></template
            ></template
          >
          <template #sub
            ><span data-testid="last-round-guests">{{
              rest.lastRound ? customers || t.home.noGuests : t.home.noRound
            }}</span></template
          >
        </DtRow>
      </div>
    </section>

    <!-- 今日待办（P5 返工，按最初定的设计）：一张卡片一行一件事；签到是右边的胶囊按钮，其余整行去对应页面 -->
    <!-- 首页不直接领奖（问题记录 555）：主线、章末、每周、支线任意能领时主线行写“可领奖”，点进第一个能领的卡 -->
    <section class="dt-block" data-testid="home-todo">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.home.todo }}</h2>
      </div>
      <div class="dt-card dt-rows-card">
        <DtRow v-if="signedIn !== null" :title="t.home.signIn" art="sec-tasks" data-testid="home-signin-row">
          <template #end>
            <button
              v-if="!signedIn"
              type="button"
              class="btn btn-sm btn-primary"
              data-testid="home-signin"
              :disabled="busy"
              @click="act(() => endpoints.signIn(), t.home.signInFailed)"
            >
              {{ t.home.signInBtn }}
            </button>
            <span v-else class="dt-row-done" data-testid="home-signed"
              ><i class="bi bi-check2 me-1" aria-hidden="true"></i>{{ t.home.signedShort }}</span
            >
          </template>
        </DtRow>
        <DtRow
          v-if="mainTask || mainChapter || showTasks"
          :to="showTasks ? tasksTo : undefined"
          :title="t.home.mainTag"
          art="sec-rank"
          data-testid="main-task"
        >
          <template #sub>
            <template v-if="mainTask"
              >{{ questTitle(catalog.data('tasks', mainTask.id)?.name ?? mainTask.name, mainTask)
              }}{{
                t.common.paren(
                  `${formatNum(Math.min(mainTask.progress, mainTask.target))}/${formatNum(mainTask.target)}`,
                )
              }}</template
            >
            <template v-else-if="mainChapter"
              >{{ mainChapterBody
              }}<template v-if="mainChapter.locked">{{
                t.common.paren(
                  mainChapter.needStar > 0
                    ? t.rest.tasks.lockedStar(mainChapter.needStar)
                    : t.rest.tasks.lockedLevel(mainChapter.needLevel),
                )
              }}</template></template
            >
            <template v-else>{{ mainAllDone ? t.rest.tasks.mainDone : t.rest.tasks.main }}</template>
          </template>
          <template v-if="claimTab" #value
            ><span class="dt-tag dt-tag-warn" data-testid="home-tasks-gift">{{
              t.home.row.claimable
            }}</span></template
          >
        </DtRow>
        <ActivityBanner />
        <DtRow
          v-if="activeTotal !== null"
          to="/rest/tasks?tab=today"
          :title="t.home.activation(activeTotal)"
          art="sec-bonus"
          data-testid="home-activation"
        >
          <template v-if="activeClaimable" #value
            ><span class="dt-tag dt-tag-warn" data-testid="home-activation-gift">{{
              t.home.row.claimable
            }}</span></template
          >
        </DtRow>
        <!-- 新手提示（问题记录 150）：有能领的新手码时去兑换码页（界面改版 P2b）；没有时 10 级以前看指引 -->
        <DtRow
          v-if="codesClaimable || rest.level < 10"
          :to="codesClaimable ? '/redeem' : '/guide'"
          :title="codesClaimable ? t.home.row.codes : t.home.row.guide"
          :sub="codesClaimable ? t.home.row.codesSub : t.home.row.guideSub"
          :art="codesClaimable ? 'me-redeem' : 'me-help'"
          data-testid="guide-hint"
        >
        </DtRow>
        <!-- 交易所（问题记录 591）：够门槛才有；有大宗认购时写批次和认购份数，点了去大宗认购标签。旧服务端没有这个字段 -->
        <DtRow
          v-if="rest.exchangeHint"
          :to="rest.exchangeHint.bulk ? '/exchange?tab=bulk' : '/exchange'"
          :title="rest.exchangeHint.bulk ? t.home.row.bulk : t.nav.links.exchange"
          :sub="exchangeRowText"
          art="place-exchange"
          data-testid="home-exchange-row"
        >
        </DtRow>
        <DtRow
          v-if="dining"
          :title="t.home.row.dining"
          :sub="
            t.home.row.diningSub(restName(dining.hostRestId, dining.hostName), dining.tableNo, dining.minutes)
          "
          art="nav-friends"
          data-testid="dine-card"
        >
          <template #end>
            <button
              class="btn btn-sm btn-primary"
              data-testid="dine-end"
              :disabled="busy || !dining.canEnd"
              @click="act(() => endpoints.dineEnd(), t.home.dining.endFailed)"
            >
              {{ t.home.dining.end }}
            </button>
          </template>
        </DtRow>
        <!-- 到期没领的理财（理财设计 §3.4）；旧服务端没有 wealthDue -->
        <DtRow
          v-if="(rest.wealthDue ?? 0) > 0"
          to="/bank?tab=wealth"
          :title="t.home.row.wealth"
          :sub="t.home.row.wealthSub(rest.wealthDue ?? 0)"
          art="place-bank"
          data-testid="home-wealth-row"
        >
        </DtRow>
      </div>
    </section>

    <!-- 我的店（界面改版 P5）：食谱数、在售特色菜、资产，每行左边名字、右边当前值，整行可点 -->
    <section v-if="showBooks || showSpecial || rest.assets !== null" class="dt-block" data-testid="home-shop">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.nav.me.groups.shop }}</h2>
      </div>
      <!-- 一排三个小格（问题记录 619）：名字、当前值、一行说明，每格整格可点 -->
      <div class="dt-shop-tiles" :data-testid="showBooks || showSpecial ? 'home-books' : undefined">
        <RouterLink v-if="showBooks" to="/cookbooks" class="dt-shop-tile" data-testid="home-cookbooks">
          <span class="dt-shop-tile-k"
            ><DtArt name="nav-cookbooks" :size="14" />{{ t.home.row.cookbooks }}</span
          >
          <b class="dt-shop-tile-v">{{ formatNum(rest.cookbooks.learned) }}</b>
          <span class="dt-shop-tile-s">{{ t.home.row.cookbooksTotal(formatNum(rest.cookbooks.total)) }}</span>
        </RouterLink>
        <!-- 菜名放不下截断（审查 I2） -->
        <RouterLink v-if="showSpecial" to="/cookbooks?tab=mc" class="dt-shop-tile" data-testid="home-special">
          <span class="dt-shop-tile-k"><DtArt name="sec-star" :size="14" />{{ t.home.row.special }}</span>
          <b class="dt-shop-tile-v is-name">{{
            rest.special ? catalog.mcName(rest.special.id) : t.home.row.specialNone
          }}</b>
          <span class="dt-shop-tile-s">{{ rest.special ? t.home.specialLv(rest.special.level) : '' }}</span>
        </RouterLink>
        <!-- 资产：名下的店身价合计，和投资榜一样；整格去收购（问题记录 447） -->
        <RouterLink v-if="rest.assets !== null" to="/acquire" class="dt-shop-tile" data-testid="home-assets">
          <span class="dt-shop-tile-k"><DtArt name="place-acquire" :size="14" />{{ t.home.row.assets }}</span>
          <b class="dt-shop-tile-v">{{ formatNum(rest.assets) }}</b>
          <span class="dt-shop-tile-s">{{ t.home.row.assetsSub }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- 餐厅动态在小镇新闻上面（问题记录 553） -->
    <!-- 旧服务端的概览没有 feed（前端可能先上线，问题记录 327 同理） -->
    <HomeFeed :items="rest.feed ?? []" :rest-id="rest.id" />
    <HomeNews :headlines="rest.headlines" />

    <!-- 设施：3 列格子，图形放在托盘里，名字和状态各一行 -->
    <section class="dt-block dt-home-devices" data-testid="home-devices">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.home.devices }}</h2>
        <span v-if="emptySlots > 0" class="dt-block-more" data-testid="fac-empty">{{
          t.home.emptySlots(emptySlots)
        }}</span>
      </div>
      <!-- 开了的设施位一格一个；没开的收成一排小格子（图形 + 几星开放），省掉两排（P5 返工：首页太长） -->
      <div v-if="openDevices.length > 0" class="dt-fac-grid">
        <button
          v-for="d in openDevices"
          :key="d.slot"
          type="button"
          class="dt-fac"
          :data-testid="`slot-${d.slot}`"
          :disabled="busy"
          @click="openSlot(d.slot)"
        >
          <span class="dt-fac-ico"
            ><DtArt v-if="DEVICE_ART[d.deviceType]" :name="DEVICE_ART[d.deviceType]!" :size="28"
          /></span>
          <span class="dt-fac-name dt-clamp1">{{ catalog.deviceName(d.slot) ?? d.name }}</span>
          <!-- 摆了设施：道具名一行（太长截断，全称给悬停），剩余时间单独一行，不被截掉 -->
          <template v-if="d.goodsId">
            <span class="dt-fac-goods dt-clamp1" :title="catalog.goodsName(d.goodsId)">{{
              catalog.goodsName(d.goodsId)
            }}</span>
            <span class="dt-fac-state is-on" data-testid="fac-remain">{{ expiresText(d.expiresAt) }}</span>
          </template>
          <span v-else class="dt-fac-state">{{ t.home.empty }}</span>
        </button>
      </div>
      <!-- 锁着的格子并成一行字（问题记录 619：原来是一排小格子） -->
      <p v-if="lockedDevices.length > 0" class="dt-fac-locked-line" data-testid="fac-locked">
        <i class="bi bi-lock" aria-hidden="true"></i>{{ lockedText }}
      </p>
      <div v-if="plaque2Offer" class="dt-card dt-rows-card mt-2">
        <DtRow art="fac-plaque" :title="t.home.plaque2.title">
          <template #sub
            ><span data-testid="plaque2-cost">{{
              t.home.plaque2.cost(formatNum(rest.plaque2Cost.coin), rest.plaque2Cost.diamond)
            }}</span
            ><span v-if="plaque2Block" class="text-danger ms-1" data-testid="plaque2-block">{{
              plaque2Block
            }}</span></template
          >
          <template #end>
            <button
              class="btn btn-sm btn-outline-primary"
              data-testid="open-plaque2"
              :disabled="busy || !!plaque2Block"
              @click="openPlaque2"
            >
              {{ t.home.plaque2.open }}
            </button>
          </template>
        </DtRow>
      </div>
      <div v-if="pickingSlot !== null" class="dt-card mt-2 small">
        <!-- 取消的点击区域往外扩了 8px（.dt-link-btn::before），下面留 8px 别盖住第一排选项（终审） -->
        <div class="d-flex justify-content-between mb-2" data-testid="pick-head">
          <b>{{ t.home.pick }}</b>
          <button type="button" class="dt-link-btn" @click="pickingSlot = null">{{ t.common.cancel }}</button>
        </div>
        <div v-if="pickingDevice?.goodsId" class="dt-pick-current" data-testid="pick-current">
          {{
            t.home.pickCurrent(catalog.goodsName(pickingDevice.goodsId), expiresText(pickingDevice.expiresAt))
          }}
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
    </section>

    <!-- 经营开关（280 反馈）：每项一行，名字和说明在左、开关或档位在右 -->
    <section class="dt-block" data-testid="home-switches">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.home.switches }}</h2>
      </div>
      <div class="dt-card dt-rows-card">
        <DtRow :title="t.home.promo" :sub="t.home.promoHint">
          <template #end>
            <span class="form-check form-switch m-0">
              <input
                id="promo"
                class="form-check-input"
                type="checkbox"
                :aria-label="t.home.promo"
                :checked="rest.promoOn"
                :disabled="busy"
                @change="act(() => endpoints.setPromo(!rest!.promoOn), t.home.setFailed)"
              />
            </span>
          </template>
        </DtRow>
        <DtRow :title="t.home.cte" :sub="t.home.cteHint">
          <template #end>
            <span class="form-check form-switch m-0">
              <input
                id="cte"
                class="form-check-input"
                type="checkbox"
                :aria-label="t.home.cte"
                :checked="rest.cteOn"
                :disabled="busy"
                @change="act(() => endpoints.setCte(!rest!.cteOn), t.home.setFailed)"
              />
            </span>
          </template>
        </DtRow>
        <DtRow v-if="rest.starLevel >= 6" :title="t.home.cookfoods" data-testid="cookfoods-row">
          <template #end>
            <select
              class="form-select form-select-sm w-auto"
              :aria-label="t.home.cookfoods"
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
          </template>
        </DtRow>
      </div>
      <details v-if="rest.starLevel >= 6" class="dt-meta mt-1 px-1" data-testid="cookfoods-help">
        <summary>{{ t.home.whatIs }}</summary>
        <div data-testid="cookfoods-hint">
          {{ t.home.cookfoodsHint(rest.cookfoodsPerFlag) }}
        </div>
      </details>
    </section>

    <!-- 生效的加成默认折叠成一行摘要（问题记录 280） -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.home.effects }}</h2>
      </div>
      <!-- 收起时一行摘要，右边一个会转的箭头；展开后按来源分组，每条一行：名字和剩余时间一行，加成标签换到下一行 -->
      <details class="dt-card dt-effects" data-testid="effects">
        <summary class="dt-effects-sum">
          <span class="dt-effects-sum-text">{{
            t.home.effectsCount(rest.effects.length + rest.boosts.length, effectsSummary)
          }}</span>
          <i class="bi bi-chevron-down dt-effects-chev" aria-hidden="true"></i>
        </summary>
        <div class="dt-effects-body">
          <!-- 正在生效的全服加成活动（问题记录 294）：直接改区服数值，不是加成来源，单独一组 -->
          <template v-if="rest.boosts.length > 0">
            <div class="dt-effects-group" data-testid="effect-group">{{ t.home.groups.activity }}</div>
            <div v-for="b in rest.boosts" :key="`boost-${b.id}`" class="dt-effect" data-testid="boost-row">
              <div class="dt-effect-head">
                <span class="dt-effect-name">{{ b.title }}</span>
                <span class="dt-effect-time">{{ expiresText(b.endsAt) }}</span>
              </div>
              <div class="dt-effect-chips">
                <span v-for="i in b.items" :key="i.key" class="dt-chip dt-chip-good"
                  >{{ t.activity.boosts[i.key] ?? i.key }} ×{{ i.factor }}</span
                >
              </div>
            </div>
          </template>
          <template v-for="g in effectGroups" :key="g.type">
            <div class="dt-effects-group" data-testid="effect-group">{{ t.home.groups[g.type] }}</div>
            <div
              v-for="e in g.items"
              :key="`${e.sourceType}-${e.sourceId}`"
              class="dt-effect"
              data-testid="effect-row"
            >
              <div class="dt-effect-head">
                <span class="dt-effect-name">{{ effectName(e, catalog) }}</span>
                <span class="dt-effect-time">{{ effectExpires(e) }}</span>
              </div>
              <div class="dt-effect-chips">
                <span
                  v-for="c in effectChips(e.effects)"
                  :key="c.text"
                  :class="['dt-chip', c.good ? 'dt-chip-good' : 'dt-chip-bad']"
                  >{{ c.text }}</span
                >
              </div>
            </div>
          </template>
          <button
            v-if="rest.effects.length > EFFECTS_SHOWN"
            type="button"
            class="dt-effects-more"
            data-testid="effects-more"
            :aria-expanded="effectsAll"
            @click="effectsAll = !effectsAll"
          >
            {{ effectsAll ? t.home.collapse : t.home.expandAll(rest.effects.length) }}
          </button>
        </div>
      </details>
    </section>
    <!-- 胶囊、等级环点开的说明（问题记录 619） -->
    <DtSheet :open="!!infoView" :title="infoView?.title ?? ''" @close="info = null">
      <div v-if="infoView" data-testid="info-sheet">
        <p class="dt-detail-note mt-0">{{ infoView.sub }}</p>
        <dl v-if="infoView.rows.length > 0" class="dt-sum dt-info-sum">
          <div v-for="[k, v] in infoView.rows" :key="k">
            <dt>{{ k }}</dt>
            <dd>{{ v }}</dd>
          </div>
        </dl>
        <RouterLink :to="infoView.to" class="dt-go d-inline-block mt-3" data-testid="info-link">{{
          infoView.link
        }}</RouterLink>
      </div>
    </DtSheet>
  </div>
</template>
