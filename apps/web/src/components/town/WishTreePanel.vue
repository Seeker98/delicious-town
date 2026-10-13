<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { WishTreeDto, WishTreeResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { newsTime } from '../../utils/news';
import { remainText } from '../../utils/remain';
import { awardText } from '../bar/award';
import DtArt from '../DtArt.vue';
import DtRow from '../DtRow.vue';
import DtSheet from '../DtSheet.vue';
import DtEmpty from '../DtEmpty.vue';
import DtSkeleton from '../DtSkeleton.vue';

/**
 * 广场的许愿树标签（许愿树设计 §3.3；界面改版 P10）：一张奖品大卡（树、今天结了什么、几人许愿、几点开奖、
 * 整宽“许愿”），一行“怎么玩 ›”点开说明，下面最近几轮一轮一行（我的结果写小标签）
 */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<WishTreeDto | null>(null);
const busy = ref(false);
const helpOpen = ref(false);
/** 第一次读失败：不再一直显示骨架（backlog P3） */
const failed = ref(false);

async function load() {
  try {
    data.value = await endpoints.wishTree();
  } catch (e) {
    if (!data.value) failed.value = true;
    toast.push(errorMessage(e, t.value.wishtree.loadFailed), 'danger');
  }
}
onMounted(load);

const round = computed(() => data.value?.round ?? null);
const tooLow = computed(() => !!data.value && data.value.level < data.value.minLevel);
/** 称号名按语言取（catalog 里的 looks，小镇页进来时已经在读） */
const titleName = computed(() => catalog.icon('wish_tree')?.title ?? '');

async function wish() {
  if (busy.value) return;
  busy.value = true;
  try {
    data.value = await endpoints.wishTreeWish();
    toast.push(t.value.wishtree.done, 'success');
  } catch (e) {
    toast.push(errorMessage(e, t.value.wishtree.wishFailed), 'danger');
    // 被拒多半是状态变了（到开奖时间了、别的页面已经许过）：重新读取
    await load();
  } finally {
    busy.value = false;
  }
}

function prizeText(goodsId: number, num: number): string {
  return t.value.common.qty(catalog.goodsName(goodsId), num);
}
/** 我这一轮的结果：中了绿标签、没中灰标签写安慰奖 */
function mineTag(r: WishTreeResultDto): { text: string; cls: string } | null {
  const w = t.value.wishtree;
  if (!r.mine) return null;
  if (r.mine.won) return { text: w.mineTag, cls: 'dt-tag-ok' };
  return {
    text: r.mine.award
      ? w.lostTag(awardText(r.mine.award, catalog))
      : r.mine.skipped
        ? w.skippedTag
        : w.pendingTag,
    cls: 'dt-tag-mute',
  };
}
</script>

<template>
  <div v-if="data">
    <div v-if="!data.enabled" class="dt-card dt-up-max" data-testid="wt-off">{{ t.wishtree.off }}</div>
    <div v-else-if="!round" class="dt-card dt-up-max" data-testid="wt-none">
      {{ t.wishtree.none(data.hour) }}
    </div>
    <div v-if="round" class="dt-card dt-wish" data-testid="wt-round">
      <span class="dt-wish-tree"><DtArt name="town-tree" :size="64" /></span>
      <div class="dt-wish-label">{{ t.wishtree.today }}</div>
      <div class="dt-wish-prize" data-testid="wt-prize">
        <span class="dt-wish-prize-art"><DtArt :name="catalog.goodsArt(round.goodsId)" :size="30" /></span>
        <b>{{ prizeText(round.goodsId, round.num) }}</b>
      </div>
      <div class="dt-wish-meta">
        <span data-testid="wt-entries">{{ t.wishtree.entries(round.entries) }}</span> ·
        {{ t.wishtree.drawAtLeft(newsTime(round.endsAt), remainText(round.endsAt)) }}
      </div>
      <div v-if="data.wished" class="dt-wish-done" data-testid="wt-wished">{{ t.wishtree.wished }}</div>
      <template v-else-if="data.enabled">
        <button
          type="button"
          class="btn btn-primary dt-btn-block mt-3"
          :disabled="busy || tooLow"
          data-testid="wt-wish"
          @click="wish"
        >
          {{ t.wishtree.wish }}
        </button>
        <p v-if="tooLow" class="dt-up-reason" data-testid="wt-need">{{ t.wishtree.need(data.minLevel) }}</p>
        <p v-else class="dt-wish-free">{{ t.wishtree.free(data.minLevel) }}</p>
      </template>
    </div>
    <div class="dt-card dt-rows-card mt-2">
      <button type="button" class="dt-row is-link" data-testid="wt-help" @click="helpOpen = true">
        <span class="dt-row-main">
          <span class="dt-row-title is-strong">{{ t.wishtree.helpTitle }}</span>
          <span class="dt-row-sub">{{ t.wishtree.helpSub(data.hour) }}</span>
        </span>
      </button>
    </div>

    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.wishtree.recentTitle }}</h2>
    </div>
    <div v-if="data.recent.length === 0" class="dt-card dt-up-max">{{ t.wishtree.noRecent }}</div>
    <div v-else class="dt-card dt-rows-card">
      <DtRow v-for="r in data.recent" :key="r.id" strong class="dt-row-wrap" data-testid="wt-recent-row">
        <template #icon><DtArt :name="catalog.goodsArt(r.goodsId)" :size="28" /></template>
        <template #title>{{
          t.wishtree.recentTitleLine((r.drawDay ?? r.day).slice(5), prizeText(r.goodsId, r.num))
        }}</template>
        <template #sub>
          <span v-if="r.status === 'empty'" data-testid="wt-empty">{{ t.wishtree.empty }}</span>
          <template v-else
            ><RouterLink v-if="r.winner" :to="`/friends/${r.winner.restId}`">{{
              r.winner.name ?? t.news.someone
            }}</RouterLink
            ><template v-else>{{ t.news.someone }}</template
            >{{ t.wishtree.winnerTail(r.entries) }}</template
          >
        </template>
        <template v-if="mineTag(r)" #end
          ><span :class="['dt-tag', mineTag(r)!.cls]" :data-testid="r.mine?.won ? 'wt-mine' : 'wt-lost'">{{
            mineTag(r)!.text
          }}</span></template
        >
      </DtRow>
    </div>

    <DtSheet :open="helpOpen" :title="t.wishtree.helpTitle" @close="helpOpen = false">
      <div class="dt-help">
        <p>{{ t.wishtree.intro }}</p>
        <ul>
          <li v-for="(x, i) in t.wishtree.help(data.hour, data.minLevel, data.titleDays, titleName)" :key="i">
            {{ x }}
          </li>
        </ul>
      </div>
      <template #actions>
        <button type="button" class="btn btn-light dt-btn-block" @click="helpOpen = false">
          {{ t.common.close }}
        </button>
      </template>
    </DtSheet>
  </div>
  <DtEmpty v-else-if="failed" :title="t.wishtree.loadFailed" data-testid="wish-failed" />
  <DtSkeleton v-else :rows="5" />
</template>
