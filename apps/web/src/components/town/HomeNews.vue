<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { HeadlinesDto, NewsDto } from '@dt/shared';
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
/** 首页最多列几条（问题记录 619：原来日报、广播、新闻最多 5 条，改成 2 条；2026-10-16 改回 3 条）；按日报、广播、新闻的先后取 */
const SHOWN = 3;
type Line = { key: string; kind: 'daily' } | { key: string; kind: 'broadcast' | 'news'; n: NewsDto };
const lines = computed<Line[]>(() => {
  const out: Line[] = [];
  if (daily.value) out.push({ key: 'daily', kind: 'daily' });
  const b = props.headlines.broadcast;
  if (b) out.push({ key: `b${b.id}`, kind: 'broadcast', n: b });
  for (const n of props.headlines.news) out.push({ key: `n${n.id}`, kind: 'news', n });
  return out.slice(0, SHOWN);
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
      <template v-for="l in lines" :key="l.key">
        <div v-if="l.kind === 'daily'" class="dt-list-line dt-clamp1" data-testid="home-daily">
          <RouterLink to="/town?tab=news" class="fw-bold">{{ t.nav.news.daily }}{{ daily }}</RouterLink>
        </div>
        <!-- 和餐厅动态同一种只读行：时间 + 文字（P5 返工：原来新闻没有时间、动态有，两块不一致） -->
        <div v-else-if="l.kind === 'broadcast'" class="dt-feed dt-feed-1line" data-testid="home-broadcast">
          <span class="dt-feed-time">{{ when(l.n.createdAt) }}</span
          ><span class="dt-feed-text text-primary fw-bold"
            >{{ t.nav.news.broadcast }}{{ newsText(l.n, catalog) }}</span
          >
        </div>
        <div v-else class="dt-feed dt-feed-1line" data-testid="home-news">
          <span class="dt-feed-time">{{ when(l.n.createdAt) }}</span
          ><span class="dt-feed-text">{{ newsText(l.n, catalog) }}</span>
        </div>
      </template>
      <div
        v-if="!daily && !headlines.broadcast && headlines.news.length === 0"
        class="dt-list-line text-muted"
      >
        {{ t.nav.news.empty }}
      </div>
    </div>
  </section>
</template>
