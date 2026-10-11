<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { StarNeedDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import AwardChip from '../components/bar/AwardChip.vue';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import NeedChecks from '../components/NeedChecks.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { usePageTitle } from '../stores/pageTitle';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { needReason } from '../utils/needs';

/**
 * 升星（界面改版 P10）：上面“现在 → 升星后”对比卡，下面条件清单（不够的排前、红字）、奖励小胶囊，
 * 整宽按钮；不能升时按钮灰掉、下面一行红字写还差什么
 */
const toast = useToastStore();
const catalog = useCatalogStore();
const t = useT();
const need = ref<StarNeedDto | null>(null);
const failed = ref(false);
usePageTitle(() => t.value.society.links.star.label);
const busy = ref(false);

async function load() {
  try {
    need.value = await endpoints.starNeed();
    failed.value = false;
  } catch (e) {
    failed.value = true;
    toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}
async function starUp() {
  busy.value = true;
  try {
    const r = await endpoints.starUp();
    // 食谱页记住的下一星要求作废，餐厅的星级也重读（backlog 384 审查）
    const restaurant = useRestaurantStore();
    restaurant.starNeed = null;
    void restaurant.refresh().catch(() => null);
    toast.push(t.value.society.star.done(r.star));
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.society.star.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(load);

const missing = computed(() => need.value?.checks.filter((c) => !c.ok).length ?? 0);
/** 按钮下面的原因：没开放、还差几项 */
const reason = computed(() => {
  const n = need.value;
  if (!n?.nextStar || n.ok) return '';
  if (!n.available) return t.value.society.star.notOpen(n.nextStar);
  return needReason(n.checks, t.value, (id) => catalog.goodsName(id));
});
const awards = computed(() =>
  (need.value?.award?.goods ?? []).map((g) => ({
    kind: 'goods' as const,
    id: g.id,
    num: g.num,
    lucky: false,
  })),
);
</script>

<template>
  <template v-if="need">
    <div class="dt-card dt-up-hero" data-testid="star-hero">
      <div class="dt-up-side">
        <DtArt name="town-star" :size="48" />
        <b>{{ t.society.star.stars(need.star) }}</b>
        <span>{{ t.society.up.now }}</span>
      </div>
      <template v-if="need.nextStar">
        <span class="dt-up-arrow" aria-hidden="true">→</span>
        <div class="dt-up-side">
          <DtArt name="town-star" :size="56" />
          <b>{{ t.society.star.stars(need.nextStar) }}</b>
          <span>{{ t.society.up.after }}</span>
        </div>
      </template>
    </div>
    <template v-if="need.nextStar">
      <div class="dt-block-head mt-3">
        <h2 class="dt-block-title">{{ t.society.star.checksTitle }}</h2>
        <span class="dt-block-more">{{
          missing > 0 ? t.society.up.missing(missing) : t.society.up.allOk
        }}</span>
      </div>
      <NeedChecks :checks="need.checks" />
      <template v-if="awards.length > 0">
        <div class="dt-block-head mt-3">
          <h2 class="dt-block-title">{{ t.society.star.awardTitle }}</h2>
        </div>
        <div class="dt-card dt-up-awards" data-testid="star-award">
          <AwardChip v-for="a in awards" :key="a.id" :award="a" />
        </div>
      </template>
    </template>
    <div v-else class="dt-card dt-up-max mt-3" data-testid="star-max">{{ t.society.star.maxed }}</div>
    <button
      v-if="need.nextStar"
      type="button"
      class="btn btn-primary dt-btn-block mt-4"
      data-testid="star-up"
      :disabled="busy || !need.ok"
      @click="starUp"
    >
      {{ t.society.star.btn(need.nextStar) }}
    </button>
    <p v-if="reason" class="dt-up-reason" data-testid="star-reason">{{ reason }}</p>
  </template>
  <DtEmpty v-else-if="failed" :title="t.common.loadFailed"
    ><button type="button" class="btn btn-sm btn-outline-primary" @click="load">
      {{ t.town.retry }}
    </button></DtEmpty
  >
  <DtSkeleton v-else :rows="5" />
</template>
