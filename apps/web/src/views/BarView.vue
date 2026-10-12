<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { BarDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import type { ArtName } from '../art/generated/names';
import barScene from '../art/scene/bar.svg?url';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import MascotCard from '../components/MascotCard.vue';
import PlaceScene from '../components/place/PlaceScene.vue';
import NpcTalk from '../components/town/NpcTalk.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { BAR_GAMES, type BarGame } from '../utils/barGames';
import { formatNum } from '../utils/format';
import { wenjieLines } from '../utils/wenjie';

/**
 * 酒吧首页（界面改版 P9）：吧台头图叠礼券、蟹币、银币；雯姐一句话和每天聊一次；
 * 十个游戏两列格子，写今天几局、每局花多少，进行中、连胜、用完了标在右上角；点一格进那个游戏的页面
 */
const toast = useToastStore();
const restStore = useRestaurantStore();
const t = useT();
const data = ref<BarDto | null>(null);
const failed = ref(false);
const lines = computed(() => wenjieLines(data.value));

async function load() {
  try {
    data.value = await endpoints.bar();
    failed.value = false;
  } catch (e) {
    failed.value = true;
    toast.push(errorMessage(e, t.value.bar.loadFailed), 'danger');
  }
}
onMounted(load);

/** 有没有没打完的局（刷新、换页后还能接着玩） */
function playing(d: BarDto, g: BarGame): boolean {
  switch (g) {
    case 'cup':
      return d.cup.round !== null && !d.cup.round.result;
    case 'devil':
      return d.devil.round !== null && d.devil.round.result === null;
    case 'memory':
      return d.memory.round !== null;
    case 'darts':
      return d.darts.round !== null;
    case 'nim':
      return d.nim.round !== null && d.nim.round.result === null;
    case 'spice':
      return d.spice.round !== null && d.spice.round.result === null;
    case 'deal':
      return d.deal.round !== null && d.deal.round.result === null;
    default:
      return false;
  }
}
/** 有每日局数的游戏：今天玩了几局、上限 */
function today(d: BarDto, g: BarGame): [number, number] | null {
  if (g === 'devil' || g === 'memory' || g === 'darts' || g === 'nim' || g === 'spice' || g === 'deal')
    return [d[g].played, d[g].max];
  return null;
}
function meta(d: BarDto, g: BarGame): string[] {
  const h = t.value.bar.home;
  const day = today(d, g);
  const dayText = day ? h.today(day[0], day[1]) : '';
  if (day && day[0] >= day[1] && !playing(d, g)) return [h.doneToday(dayText)];
  switch (g) {
    case 'fg':
      return [h.fg];
    case 'cup':
      return [h.cup(d.cup.cost, d.cup.cups.length)];
    case 'num':
      return [h.num(d.num.cost)];
    case 'slot':
      return [h.slot, h.slotFloor(d.slot.floorLeft)];
    case 'devil':
      return [h.join(h.devil(Math.min(...d.devil.stakes), Math.max(...d.devil.stakes)), dayText)];
    case 'nim': {
      const costs = Object.values(d.nim.tables).map((x) => x.cost);
      return [h.join(h.nim(Math.min(...costs), Math.max(...costs)), dayText)];
    }
    case 'deal':
      return [h.join(h.deal(formatNum(d.deal.cost)), dayText)];
    case 'memory':
    case 'darts':
    case 'spice':
      return [h.join(h.perGame(d[g].cost), dayText)];
  }
}
type TileTag = { text: string; cls: string } | null;
function tag(d: BarDto, g: BarGame): TileTag {
  const h = t.value.bar.home;
  if (playing(d, g)) return { text: h.playing, cls: 'dt-tag-primary' };
  const day = today(d, g);
  if (day && day[0] >= day[1]) return { text: h.done, cls: 'dt-tag-mute' };
  if (g === 'fg' && d.fg.result === 'win' && d.fg.times > 0)
    return { text: h.streak(d.fg.times), cls: 'dt-tag dt-tag-warn' };
  return null;
}
const tiles = computed(() => {
  const d = data.value;
  if (!d) return [];
  return BAR_GAMES.map((g) => {
    const day = today(d, g);
    return {
      game: g,
      art: `game-${g}` as ArtName,
      meta: meta(d, g),
      tag: tag(d, g),
      on: playing(d, g),
      done: !!day && day[0] >= day[1] && !playing(d, g),
    };
  });
});
</script>

<template>
  <PlaceScene :src="barScene" place="bar" tall>
    <template v-if="data">
      <span class="dt-place-chip" data-testid="bar-wallet-tickets"
        ><DtArt name="res-voucher" :size="18" />{{ t.bar.chips.tickets }}
        <b>{{ formatNum(data.tickets) }}</b></span
      >
      <span class="dt-place-chip" data-testid="bar-wallet-krab"
        ><DtArt name="res-krab" :size="18" />{{ t.bar.chips.krab }}
        <b>{{ formatNum(data.krabCoins) }}</b></span
      >
      <span
        class="dt-place-chip"
        :aria-label="t.bar.chips.coinLabel(formatNum(data.coin))"
        data-testid="bar-wallet-coin"
        ><DtArt name="res-coin-silver" :size="18" /><b>{{ formatNum(data.coin) }}</b></span
      >
    </template>
  </PlaceScene>
  <!-- 雯姐：点卡片换一句；右边每天聊一次送礼券（问题记录 453：从广场搬到酒吧；区服关了小镇就不显示按钮） -->
  <MascotCard
    :name="t.bar.wenjie.name"
    icon="bi-cup-hot"
    art="npc-wenjie"
    :lines="lines"
    :ready="data !== null"
    testid="bar-wenjie"
  >
    <NpcTalk
      v-if="data && restStore.featureOn('town')"
      :talked="data.wenjieTalked"
      npc="wenjie"
      compact
      :label="t.bar.talkGift"
      @reload="load"
    />
  </MascotCard>
  <div class="dt-block-head">
    <h2 class="dt-block-title">{{ t.bar.home.title }}</h2>
    <span class="dt-block-more">{{ t.bar.home.reset }}</span>
  </div>
  <DtEmpty v-if="!data && failed" :title="t.bar.loadFailed" data-testid="bar-failed" />
  <DtSkeleton v-else-if="!data" :rows="5" />
  <div v-else class="dt-game-grid" data-testid="bar-games">
    <RouterLink
      v-for="x in tiles"
      :key="x.game"
      :to="`/bar/${x.game}`"
      :class="['dt-game-tile', { 'is-on': x.on, 'is-done': x.done }]"
      :data-testid="`game-${x.game}`"
    >
      <span class="dt-game-tile-art"><DtArt :name="x.art" :size="36" /></span>
      <span v-if="x.tag" :class="['dt-game-tile-tag', x.tag.cls]" :data-testid="`game-tag-${x.game}`">{{
        x.tag.text
      }}</span>
      <span class="dt-game-tile-name">{{ t.bar.tabs[x.game] }}</span>
      <span v-for="(m, i) in x.meta" :key="i" class="dt-game-tile-meta">{{ m }}</span>
    </RouterLink>
  </div>
</template>
