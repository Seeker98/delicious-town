<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { GuideCodeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { rewardSummary } from '../utils/reward';

/** 游玩指引（问题记录 150）：内容在各语言的 guide.ts 里，改了要发版；新手码从服务端读状态 */
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
onMounted(() => {
  void catalog.load().catch(() => undefined);
  load().catch((e) => toast.push(errorMessage(e, t.value.guide.loadFailed), 'danger'));
});
</script>

<template>
  <div class="dt-page-title">
    <h5>{{ t.guide.title }}</h5>
  </div>

  <details open class="mb-2" data-testid="guide-codes">
    <summary class="dt-section">{{ t.guide.codes }}</summary>
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
  </details>

  <details open class="mb-2" data-testid="guide-start">
    <summary class="dt-section">{{ t.guide.start }}</summary>
    <ul class="small ps-3 mb-1">
      <li v-for="(item, i) in t.guide.startItems" :key="i">
        <template v-for="(s, j) in item" :key="j"
          ><template v-if="typeof s === 'string'">{{ s }}</template
          ><RouterLink v-else :to="s.to">{{ s.text }}</RouterLink></template
        >
      </li>
    </ul>
  </details>

  <details class="mb-2" data-testid="guide-daily">
    <summary class="dt-section">{{ t.guide.daily }}</summary>
    <ul class="small ps-3 mb-1">
      <li v-for="d in t.guide.dailyItems" :key="d.to">
        <RouterLink :to="d.to">{{ d.text }}</RouterLink>
      </li>
    </ul>
  </details>

  <details class="mb-2" data-testid="guide-faq">
    <summary class="dt-section">{{ t.guide.faq }}</summary>
    <ul class="small ps-3 mb-1">
      <li v-for="(f, i) in t.guide.faqItems" :key="i">
        <b>{{ f.q }}</b
        ><template v-for="(s, j) in f.a" :key="j"
          ><template v-if="typeof s === 'string'">{{ s }}</template
          ><RouterLink v-else :to="s.to">{{ s.text }}</RouterLink></template
        >
      </li>
    </ul>
  </details>

  <details class="mb-2" data-testid="guide-rules">
    <summary class="dt-section">{{ t.guide.rules }}</summary>
    <ul class="small ps-3 mb-1">
      <li v-for="(r, i) in t.guide.rulesItems" :key="i">{{ r }}</li>
    </ul>
  </details>
</template>
