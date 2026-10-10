<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { WishTreeDto, WishTreeResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { newsTime } from '../../utils/news';
import { awardText } from '../bar/award';

/** 小镇页的许愿树标签（许愿树设计 §3.3）：这一轮、许愿、说明、最近几轮的结果 */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<WishTreeDto | null>(null);
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.wishTree();
  } catch (e) {
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
function mineText(r: WishTreeResultDto): string {
  const w = t.value.wishtree;
  if (!r.mine || r.mine.won) return '';
  return r.mine.award ? w.lost(awardText(r.mine.award, catalog)) : w.pending;
}
</script>

<template>
  <div v-if="data">
    <div class="small text-muted mb-2">{{ t.wishtree.intro }}</div>
    <details class="small text-muted mb-2" data-testid="wt-help">
      <summary>{{ t.wishtree.helpTitle }}</summary>
      <ul class="mb-0 ps-3">
        <li v-for="(x, i) in t.wishtree.help(data.hour, data.minLevel, data.titleDays, titleName)" :key="i">
          {{ x }}
        </li>
      </ul>
    </details>
    <div v-if="!data.enabled" class="alert alert-secondary py-1 small" data-testid="wt-off">
      {{ t.wishtree.off }}
    </div>
    <div v-else-if="!round" class="dt-empty small" data-testid="wt-none">
      {{ t.wishtree.none(data.hour) }}
    </div>
    <div v-if="round" class="dt-card mb-3 small" data-testid="wt-round">
      <div class="text-muted">{{ t.wishtree.today }}</div>
      <div class="fw-bold fs-6 mb-1" data-testid="wt-prize">{{ prizeText(round.goodsId, round.num) }}</div>
      <div data-testid="wt-entries">{{ t.wishtree.entries(round.entries) }}</div>
      <div class="text-muted mb-1">{{ t.wishtree.drawAt(newsTime(round.endsAt)) }}</div>
      <div v-if="data.wished" class="text-success" data-testid="wt-wished">{{ t.wishtree.wished }}</div>
      <template v-else-if="data.enabled">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="busy || tooLow"
          data-testid="wt-wish"
          @click="wish"
        >
          <i class="bi bi-stars"></i> {{ t.wishtree.wish }}
        </button>
        <span v-if="tooLow" class="text-danger ms-2" data-testid="wt-need">{{
          t.wishtree.need(data.minLevel)
        }}</span>
      </template>
    </div>

    <h6 class="dt-section">{{ t.wishtree.recentTitle }}</h6>
    <div v-if="data.recent.length === 0" class="small text-muted">{{ t.wishtree.noRecent }}</div>
    <div v-for="r in data.recent" :key="r.id" class="small border-bottom py-1" data-testid="wt-recent-row">
      <div>
        <span class="text-muted me-1">{{ r.day.slice(5) }}</span>
        {{ prizeText(r.goodsId, r.num) }}
      </div>
      <div v-if="r.status === 'empty'" class="text-muted" data-testid="wt-empty">{{ t.wishtree.empty }}</div>
      <div v-else>{{ t.wishtree.winner(r.winner?.name ?? t.news.someone, r.entries) }}</div>
      <div v-if="r.mine?.won" class="text-success fw-bold" data-testid="wt-mine">{{ t.wishtree.mine }}</div>
      <div v-else-if="r.mine" class="text-muted">{{ mineText(r) }}</div>
    </div>
  </div>
</template>
