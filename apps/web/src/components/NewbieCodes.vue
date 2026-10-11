<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { GuideCodeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { rewardSummary } from '../utils/reward';

/** 新手兑换码（问题记录 150）：从服务端读状态，能领的一键领；原来在游玩指引，界面改版 P2b 搬到兑换码页 */
const session = useSessionStore();
const catalog = useCatalogStore();
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
/** 上面的兑换框兑了新手码时刷新状态 */
defineExpose({ reload: () => load().catch(() => undefined) });
onMounted(() => {
  void catalog.load().catch(() => undefined);
  load().catch((e) => toast.push(errorMessage(e, t.value.guide.loadFailed), 'danger'));
});
</script>

<template>
  <section data-testid="newbie-codes">
    <h2 class="dt-section">{{ t.guide.codes }}</h2>
    <p v-if="!hasRest" class="small text-muted mb-1">{{ t.guide.codesNoRest }}</p>
    <template v-else>
      <p class="small text-muted mb-1">{{ t.guide.codesNote }}</p>
      <div v-for="c in codes" :key="c.code" class="dt-item">
        <div class="dt-item-main">
          <div>
            <b>{{ c.code }}</b> <span class="small text-muted">{{ t.guide.minLevel(c.minLevel) }}</span>
          </div>
          <div class="dt-meta">{{ rewardSummary(c.items, catalog) }}</div>
        </div>
        <div class="dt-item-actions">
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
          <span v-else-if="c.state === 'level'" class="small text-muted">{{
            t.guide.minLevel(c.minLevel)
          }}</span>
          <span v-else-if="c.state === 'used'" class="small text-success">{{ t.guide.taken }}</span>
          <span v-else-if="c.state === 'unavailable'" class="small text-muted">{{
            t.guide.unavailable
          }}</span>
          <span v-else class="small text-muted">{{ t.guide.ended }}</span>
        </div>
      </div>
    </template>
  </section>
</template>
