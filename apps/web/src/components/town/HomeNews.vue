<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { HeadlinesDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { useLocaleStore } from '../../stores/locale';
import { catalogNames, dailyLang, dailyPlain } from '../../utils/daily';
import { gameDateTime } from '../../utils/format';
import { newsText } from '../../utils/news';

/** 首页小镇新闻（界面改版 P5：区块标题在卡片外，右边“全部”；卡片里一条一行，长的截断） */
const props = defineProps<{ headlines: HeadlinesDto }>();
const catalog = useCatalogStore();
const locale = useLocaleStore();
const t = useT();
/** 时间和餐厅动态一样写月日时分 */
const when = (iso: string) =>
  gameDateTime(iso, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
/** 小镇日报入口（2026-10-08）：昨天的日报发布了才有；西语、法语看英文标题 */
const daily = computed(() => {
  const d = props.headlines.daily;
  if (!d) return null;
  const title = d.title[dailyLang(locale.locale).lang];
  return dailyPlain(title, d.rests, catalogNames(catalog), t.value.town.daily.closed);
});
</script>

<template>
  <section class="dt-block">
    <!-- 标题整行去小镇新闻（P5 返工：不再用“全部 ›”文字链接） -->
    <RouterLink to="/town?tab=news" class="dt-block-head is-link" data-testid="home-news-more">
      <h2 class="dt-block-title">{{ t.nav.news.title }}</h2>
      <span class="dt-block-more">{{ t.nav.news.more }}</span>
    </RouterLink>
    <div class="dt-card dt-list-card small">
      <div v-if="daily" class="dt-list-line dt-clamp1" data-testid="home-daily">
        <RouterLink to="/town?tab=news" class="fw-bold">{{ t.nav.news.daily }}{{ daily }}</RouterLink>
      </div>
      <!-- 和餐厅动态同一种只读行：时间 + 文字（P5 返工：原来新闻没有时间、动态有，两块不一致） -->
      <div v-if="headlines.broadcast" class="dt-feed dt-feed-1line" data-testid="home-broadcast">
        <span class="dt-feed-time">{{ when(headlines.broadcast.createdAt) }}</span
        ><span class="dt-feed-text text-primary fw-bold"
          >{{ t.nav.news.broadcast }}{{ newsText(headlines.broadcast, catalog) }}</span
        >
      </div>
      <div v-for="n in headlines.news" :key="n.id" class="dt-feed dt-feed-1line" data-testid="home-news">
        <span class="dt-feed-time">{{ when(n.createdAt) }}</span
        ><span class="dt-feed-text">{{ newsText(n, catalog) }}</span>
      </div>
      <div
        v-if="!daily && !headlines.broadcast && headlines.news.length === 0"
        class="dt-list-line text-muted"
      >
        {{ t.nav.news.empty }}
      </div>
    </div>
  </section>
</template>
