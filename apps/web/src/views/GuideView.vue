<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useT } from '../composables/useT';
import { useSessionStore } from '../stores/session';

/** 游玩指引（问题记录 150）：内容在各语言的 guide.ts 里，改了要发版；新手码搬到兑换码页（界面改版 P2b） */
const session = useSessionStore();
const t = useT();
const hasRest = computed(() => Boolean(session.me?.restaurantId));
</script>

<template>
  <!-- 游戏资料入口（问题记录 142） -->
  <p class="small mb-2">
    <RouterLink to="/wiki" class="dt-go text-wrap" data-testid="guide-wiki"
      ><i class="bi bi-book me-1"></i>{{ t.guide.wikiHint }}</RouterLink
    >
  </p>

  <!-- 新手兑换码在兑换码页（界面改版 P2b）；没开店时照旧说开店后可以领 -->
  <p class="small mb-2">
    <RouterLink v-if="hasRest" to="/redeem" class="dt-go text-wrap" data-testid="guide-to-redeem"
      ><i class="bi bi-ticket-perforated me-1"></i>{{ t.guide.codes }}</RouterLink
    >
    <span v-else class="text-muted">{{ t.guide.codesNoRest }}</span>
  </p>

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
