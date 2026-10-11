<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { LessonsDto, OilNeedDto, StarNeedDto, TownDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import type { ArtName } from '../art/generated/names';
import societyScene from '../art/scene/society.svg?url';
import DtArt from '../components/DtArt.vue';
import DtRow from '../components/DtRow.vue';
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import PlaceScene from '../components/place/PlaceScene.vue';
import MoveSheet from '../components/society/MoveSheet.vue';
import RenameSheet from '../components/society/RenameSheet.vue';
import { useT } from '../composables/useT';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { formatNum } from '../utils/format';
import { needLabel } from '../utils/needs';

/**
 * 协会首页（界面改版 P10）：120px 头图叠星级和油壶；三位 NPC 一排头像格（今天聊没聊、有没有见面礼）；
 * “办事”一张卡片四行（升星、扩油跳页，改名、搬家从下面弹出面板）；教室一行。
 * 每一行的状态读现成的接口，读不到就只写固定说明，不挡着进去
 */
const t = useT();
const route = useRoute();
const router = useRouter();
const restaurant = useRestaurantStore();
const catalog = useCatalogStore();
const star = ref<StarNeedDto | null>(null);
const oil = ref<OilNeedDto | null>(null);
const town = ref<TownDto | null>(null);
const lessons = ref<LessonsDto | null>(null);
const moveCost = ref<number | null>(null);

const townOn = computed(() => restaurant.featureOn('town'));
const classOn = computed(() => restaurant.featureOn('mysterious'));

async function loadMine() {
  const [s, o, m] = await Promise.allSettled([
    endpoints.starNeed(),
    endpoints.oilNeed(),
    endpoints.moveCost(),
  ]);
  star.value = s.status === 'fulfilled' ? s.value : null;
  oil.value = o.status === 'fulfilled' ? o.value : null;
  moveCost.value = m.status === 'fulfilled' ? m.value.cost : null;
}
async function loadTown() {
  town.value = await endpoints.town().catch(() => null);
}
async function loadLessons() {
  lessons.value = await endpoints.lessons().catch(() => null);
}
onMounted(() => {
  // 直接打开、刷新协会页时还没有餐厅数据：读一次，关掉的功能才不显示入口
  if (!restaurant.rest) restaurant.refresh().catch(() => {});
  void catalog.load().catch(() => undefined);
  void loadMine();
});
watch(townOn, (on) => on && void loadTown(), { immediate: true });
watch(classOn, (on) => on && void loadLessons(), { immediate: true });

/** 三位 NPC：今天聊没聊（镇长、13 哥），卡门有没有见面礼（领过就不写） */
const npcs = computed(() => {
  const n = t.value.npc;
  const s = t.value.society.npcTag;
  const x = town.value;
  const talk = (done: boolean) =>
    done ? { text: s.talked, cls: 'dt-tag-ok' } : { text: s.notTalked, cls: 'dt-tag-primary' };
  return [
    {
      key: 'mayor',
      art: 'npc-mayor' as ArtName,
      name: n.mayor.name,
      desc: t.value.society.npcDesc.mayor,
      tag: x ? talk(x.talked.bigEater) : null,
    },
    {
      key: 'bro13',
      art: 'npc-bro13' as ArtName,
      name: n.bro13.name,
      desc: t.value.society.npcDesc.bro13,
      tag: x ? talk(x.talked.bro13) : null,
    },
    {
      key: 'carmen',
      art: 'npc-carmen' as ArtName,
      name: n.carmen.name,
      desc: t.value.society.npcDesc.carmen,
      tag: x && !x.bigEaterGift && !x.talked.carmen ? { text: s.gift, cls: 'dt-tag-warn' } : null,
    },
  ];
});

/** 升星一行：还差几项写第一项差多少（项数标红）；都够了写可以升；最高星写已满 */
const starRow = computed(
  (): { sub: string; ok: boolean; miss?: { next: number; n: number; rest: string } } => {
    const s = t.value.society.work;
    const n = star.value;
    if (!n) return { sub: t.value.society.links.star.desc, ok: false };
    if (!n.nextStar) return { sub: t.value.society.star.maxed, ok: false };
    const miss = n.checks.filter((c) => !c.ok);
    if (n.ok) return { sub: s.starOk(n.nextStar), ok: true };
    if (!n.available || miss.length === 0)
      return { sub: t.value.society.star.notOpen(n.nextStar), ok: false };
    const c = miss[0]!;
    const label = needLabel(c, t.value, (id) => catalog.goodsName(id));
    return {
      sub: '',
      ok: false,
      miss: {
        next: n.nextStar,
        n: miss.length,
        rest: s.starMissRest(label, formatNum(c.have), formatNum(c.need)),
      },
    };
  },
);
const oilRow = computed(() => {
  const s = t.value.society.work;
  const n = oil.value;
  if (!n) return { sub: t.value.society.links.oil.desc, ok: false };
  if (!n.nextLevel) return { sub: t.value.society.oil.maxed, ok: false };
  const miss = n.checks.filter((c) => !c.ok).length;
  return {
    sub: n.ok ? s.oilNext(n.nextLevel, formatNum(n.nextOilMax ?? 0)) : s.oilMiss(n.nextLevel, miss),
    ok: n.ok,
  };
});
const moveSub = computed(() => {
  const r = restaurant.rest;
  if (!r) return t.value.society.links.move.desc;
  const street = catalog.streetName(r.streetId, r.streetName);
  return moveCost.value === null
    ? t.value.society.work.moveHere(street)
    : t.value.society.work.moveSub(street, formatNum(moveCost.value));
});
const classSub = computed(() => {
  const l = lessons.value;
  if (!l) return t.value.npc.links.classroom.desc;
  const others = l.items.filter((x) => x.id !== l.mine?.id).length;
  return t.value.society.work.classSub(others, l.mine !== null);
});

/** 改名、搬家的面板；从别处链过来的旧地址 /society/move 带 ?sheet=move 打开 */
type Sheet = 'rename' | 'move' | null;
const sheet = ref<Sheet>(null);
watch(
  () => route.query.sheet,
  (q) => {
    if (q === 'rename' || q === 'move') {
      sheet.value = q;
      void router.replace({ query: { ...route.query, sheet: undefined } });
    }
  },
  { immediate: true },
);
function done() {
  sheet.value = null;
  void loadMine();
}
</script>

<template>
  <PlaceScene :src="societyScene" place="society">
    <span v-if="star" class="dt-place-chip" data-testid="society-star"
      ><DtArt name="town-star" :size="18" /><b>{{ t.society.chips.star(star.star) }}</b></span
    >
    <span v-if="oil" class="dt-place-chip" data-testid="society-oil"
      ><DtArt name="res-oil" :size="18" />{{ t.society.chips.oil }}
      <b>{{ t.society.chips.oilLevel(oil.oilLevel) }}</b> ·
      {{ t.society.chips.oilMax(formatNum(oil.oilMax)) }}</span
    >
  </PlaceScene>
  <HiphopCard :place="4" class="mt-2" />

  <template v-if="townOn">
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.society.people }}</h2>
      <span class="dt-block-more">{{ t.society.peopleNote }}</span>
    </div>
    <div class="dt-npc-grid" data-testid="society-npcs">
      <RouterLink
        v-for="x in npcs"
        :key="x.key"
        :to="`/society/${x.key}`"
        class="dt-npc-tile"
        :data-testid="`society-npc-${x.key}`"
      >
        <span class="dt-npc-tile-ava"><DtArt :name="x.art" :size="60" /></span>
        <b>{{ x.name }}</b>
        <span class="dt-npc-tile-desc">{{ x.desc }}</span>
        <span v-if="x.tag" :class="['dt-tag', x.tag.cls]" :data-testid="`society-npc-tag-${x.key}`">{{
          x.tag.text
        }}</span>
      </RouterLink>
    </div>
  </template>

  <div class="dt-block-head mt-3">
    <h2 class="dt-block-title">{{ t.society.work.title }}</h2>
  </div>
  <div class="dt-card dt-rows-card" data-testid="society-work">
    <DtRow to="/society/star" strong :title="t.society.links.star.label" data-testid="society-link-star">
      <template #icon><DtArt name="town-star" :size="28" /></template>
      <template #sub
        ><template v-if="starRow.miss"
          >{{ t.society.work.starMissHead(starRow.miss.next)
          }}<b class="text-danger">{{ t.society.work.starMissN(starRow.miss.n) }}</b
          >{{ starRow.miss.rest }}</template
        ><template v-else>{{ starRow.sub }}</template></template
      >
    </DtRow>
    <DtRow
      to="/society/oil"
      strong
      :title="t.society.links.oil.label"
      :sub="oilRow.sub"
      data-testid="society-link-oil"
    >
      <template #icon><DtArt name="res-oil" :size="28" /></template>
      <template v-if="oilRow.ok" #value
        ><span class="dt-tag dt-tag-ok">{{ t.society.work.oilOk }}</span></template
      >
    </DtRow>
    <button type="button" class="dt-row is-link" data-testid="society-rename" @click="sheet = 'rename'">
      <span class="dt-row-ico"><DtArt name="goods-card" :size="28" /></span>
      <span class="dt-row-main">
        <span class="dt-row-title is-strong">{{ t.society.links.rename.label }}</span>
        <span class="dt-row-sub">{{ t.society.links.rename.desc }}</span>
      </span>
    </button>
    <button type="button" class="dt-row is-link" data-testid="society-move" @click="sheet = 'move'">
      <span class="dt-row-ico"><DtArt name="town-sign" :size="28" /></span>
      <span class="dt-row-main">
        <span class="dt-row-title is-strong">{{ t.society.links.move.label }}</span>
        <span class="dt-row-sub">{{ moveSub }}</span>
      </span>
    </button>
  </div>

  <template v-if="classOn">
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.npc.links.classroom.label }}</h2>
    </div>
    <div class="dt-card dt-rows-card">
      <DtRow
        to="/society/classroom"
        strong
        :title="t.npc.links.classroom.label"
        :sub="classSub"
        data-testid="society-link-classroom"
      >
        <template #icon><DtArt name="town-easel" :size="28" /></template>
      </DtRow>
    </div>
  </template>

  <RenameSheet :open="sheet === 'rename'" @close="sheet = null" @done="done" />
  <MoveSheet :open="sheet === 'move'" :cost="moveCost" @close="sheet = null" @done="done" />
</template>
