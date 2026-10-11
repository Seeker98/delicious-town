<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { ArtName } from '../art/generated/names';
import DtArt from '../components/DtArt.vue';
import { useT } from '../composables/useT';
import { useSessionStore } from '../stores/session';
import { headBody } from '../utils/headBody';

/**
 * 游玩指引（问题记录 150；界面改版 P11 重排）：内容在各语言的 guide.ts 里，改了要发版。
 * 四段都是能收起的卡片（卡头：图 + 标题 + 箭头），第一次来展开“开店第一天”；
 * 每天的事项一行一个、带地点图标、点整行去那里，先列 6 项；常见问题一问一块。
 * 顶上两个入口是胶囊（没开店时兑换码胶囊换成一行灰字）
 */
type Part = 'start' | 'daily' | 'faq' | 'rules';
const SEEN = 'dt_guide_seen';
const DAILY_FIRST = 6;
const session = useSessionStore();
const t = useT();
const hasRest = computed(() => Boolean(session.me?.restaurantId));

function firstVisit(): boolean {
  try {
    const seen = localStorage.getItem(SEEN) !== null;
    localStorage.setItem(SEEN, '1');
    return !seen;
  } catch {
    return true;
  }
}
const open = ref<Set<Part>>(new Set(firstVisit() ? ['start'] : []));
function toggle(p: Part) {
  const s = new Set(open.value);
  if (s.has(p)) s.delete(p);
  else s.add(p);
  open.value = s;
}
const dailyAll = ref(false);
const daily = computed(() =>
  dailyAll.value ? t.value.guide.dailyItems : t.value.guide.dailyItems.slice(0, DAILY_FIRST),
);

/** 每天的事项按去哪配地点图标 */
const DAILY_ART: Record<string, ArtName> = {
  '/': 'nav-home',
  '/rest/tasks?tab=today': 'sec-bonus',
  '/town': 'place-plaza',
  '/society/mayor': 'place-society',
  '/yard': 'place-yard',
  '/market': 'nav-market',
  '/bar': 'place-bar',
  '/tower': 'place-tower',
  '/takeaway': 'place-takeaway',
};
const PARTS: Array<{ key: Part; art: ArtName; title: () => string }> = [
  { key: 'start', art: 'town-shop', title: () => t.value.guide.start },
  { key: 'daily', art: 'sec-tasks', title: () => t.value.guide.daily },
  { key: 'faq', art: 'me-help', title: () => t.value.guide.faq },
  { key: 'rules', art: 'me-admin', title: () => t.value.guide.rules },
];
</script>

<template>
  <div class="dt-guide-pills">
    <RouterLink to="/wiki" class="dt-auth-pill" data-testid="guide-wiki"
      ><DtArt name="wiki-books" :size="18" />{{ t.guide.wikiPill }}</RouterLink
    >
    <RouterLink v-if="hasRest" to="/redeem" class="dt-auth-pill" data-testid="guide-to-redeem"
      ><DtArt name="town-ticket" :size="18" />{{ t.guide.codes }}</RouterLink
    >
  </div>
  <p v-if="!hasRest" class="dt-field-hint">{{ t.guide.codesNoRest }}</p>

  <section v-for="p in PARTS" :key="p.key" class="dt-card dt-fold-card" :data-testid="`guide-${p.key}`">
    <button
      type="button"
      class="dt-fold-head"
      :aria-expanded="open.has(p.key)"
      :aria-controls="`guide-body-${p.key}`"
      @click="toggle(p.key)"
    >
      <span class="dt-fold-art"><DtArt :name="p.art" :size="26" /></span>
      <b>{{ p.title() }}</b>
      <i :class="['bi', open.has(p.key) ? 'bi-chevron-down' : 'bi-chevron-right']" aria-hidden="true"></i>
    </button>
    <div v-if="open.has(p.key)" :id="`guide-body-${p.key}`" class="dt-fold-body">
      <ol v-if="p.key === 'start'" class="dt-guide-list">
        <li v-for="(item, i) in t.guide.startItems" :key="i">
          <template v-for="(s, j) in item" :key="j"
            ><template v-if="typeof s === 'string'">{{ s }}</template
            ><RouterLink v-else :to="s.to" class="dt-go">{{ s.text }}</RouterLink></template
          >
        </li>
      </ol>
      <template v-else-if="p.key === 'daily'">
        <RouterLink v-for="d in daily" :key="d.to" :to="d.to" class="dt-row is-link dt-guide-daily">
          <span class="dt-row-ico"><DtArt :name="DAILY_ART[d.to] ?? 'nav-map'" :size="22" /></span>
          <span class="dt-row-main">
            <span class="dt-row-title">{{ headBody(d.text).head || d.text }}</span>
            <span v-if="headBody(d.text).head" class="dt-row-sub dt-row-sub-wrap">{{
              headBody(d.text).body
            }}</span>
          </span>
        </RouterLink>
        <button
          v-if="!dailyAll && t.guide.dailyItems.length > DAILY_FIRST"
          type="button"
          class="dt-link-btn dt-guide-more"
          :aria-expanded="dailyAll"
          @click="dailyAll = true"
        >
          {{ t.guide.dailyMore(t.guide.dailyItems.length - DAILY_FIRST) }}
        </button>
      </template>
      <template v-else-if="p.key === 'faq'">
        <div v-for="(f, i) in t.guide.faqItems" :key="i" class="dt-guide-qa">
          <b>{{ f.q }}</b>
          <p>
            <template v-for="(s, j) in f.a" :key="j"
              ><template v-if="typeof s === 'string'">{{ s }}</template
              ><RouterLink v-else :to="s.to" class="dt-go">{{ s.text }}</RouterLink></template
            >
          </p>
        </div>
      </template>
      <ul v-else class="dt-guide-list">
        <li v-for="(r, i) in t.guide.rulesItems" :key="i">{{ r }}</li>
      </ul>
    </div>
  </section>
</template>
