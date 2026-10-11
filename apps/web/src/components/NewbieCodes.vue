<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { GuideCodeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { rewardSummary } from '../utils/reward';
import DtArt from './DtArt.vue';
import RewardChips from './RewardChips.vue';

/**
 * 新手兑换码（问题记录 150；界面改版 P2b 搬到兑换码页，P11 重排）：一行一个，左边券的图，码名 + “N 级可领”，
 * 下面奖励胶囊；够级的右边“领取”，不够的整行变淡写“还差几级”，领过的写“已领”
 */
const session = useSessionStore();
const catalog = useCatalogStore();
const restStore = useRestaurantStore();
const toast = useToastStore();
const t = useT();
const codes = ref<GuideCodeDto[]>([]);
const busy = ref(false);
const hasRest = computed(() => Boolean(session.me?.restaurantId));

async function load() {
  if (!hasRest.value) return;
  codes.value = await endpoints.guideCodes();
}
async function take(code: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await endpoints.redeem(code);
    toast.push(t.value.guide.took(rewardSummary(r.items, catalog)), 'success');
  } catch (e) {
    toast.push(errorMessage(e, t.value.guide.takeFailed), 'danger');
  } finally {
    busy.value = false;
    await load().catch(() => undefined);
  }
}
/** 还差几级（不知道自己的等级时只写“N 级可领”） */
function lack(c: GuideCodeDto): string {
  const lv = restStore.rest?.level;
  return lv ? t.value.guide.lackLevels(c.minLevel - lv) : t.value.guide.minLevel(c.minLevel);
}
/** 上面的兑换框兑了新手码时刷新状态 */
defineExpose({ reload: () => load().catch(() => undefined) });
onMounted(() => {
  void catalog.load().catch(() => undefined);
  load().catch((e) => toast.push(errorMessage(e, t.value.guide.loadFailed), 'danger'));
});
</script>

<template>
  <section data-testid="newbie-codes">
    <div class="dt-block-head">
      <h2 class="dt-block-title">{{ t.guide.codes }}</h2>
      <span class="dt-block-note">{{ t.guide.codesNote }}</span>
    </div>
    <p v-if="!hasRest" class="dt-muted">{{ t.guide.codesNoRest }}</p>
    <div v-else-if="codes.length > 0" class="dt-card dt-rows-card">
      <div
        v-for="c in codes"
        :key="c.code"
        :class="['dt-row', 'dt-code-row', { 'is-off': c.state === 'level' || c.state === 'off' }]"
        :data-testid="`code-${c.code}`"
      >
        <span class="dt-code-art"><DtArt name="town-ticket" :size="28" /></span>
        <span class="dt-row-main">
          <span class="dt-row-title"
            ><b class="dt-mono">{{ c.code }}</b
            ><span class="dt-tag dt-tag-mute">{{ t.guide.minLevel(c.minLevel) }}</span></span
          >
          <RewardChips :items="c.items" />
        </span>
        <span class="dt-row-end">
          <button
            v-if="c.state === 'ok'"
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="busy"
            :data-testid="`guide-redeem-${c.code}`"
            @click="take(c.code)"
          >
            {{ t.guide.take }}
          </button>
          <span v-else-if="c.state === 'level'" class="dt-tag dt-tag-mute">{{ lack(c) }}</span>
          <span v-else-if="c.state === 'used'" class="dt-tag dt-tag-ok">{{ t.guide.taken }}</span>
          <span v-else-if="c.state === 'unavailable'" class="dt-tag dt-tag-mute">{{
            t.guide.unavailable
          }}</span>
          <span v-else class="dt-tag dt-tag-mute">{{ t.guide.ended }}</span>
        </span>
      </div>
    </div>
  </section>
</template>
