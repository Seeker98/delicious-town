<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { HeadlinesDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { newsText } from '../../utils/news';

defineProps<{ headlines: HeadlinesDto }>();
const catalog = useCatalogStore();
const t = useT();
</script>

<template>
  <div class="dt-card my-2 small">
    <div class="d-flex justify-content-between">
      <b>{{ t.nav.news.title }}</b>
      <RouterLink to="/town?tab=news" class="dt-go" data-testid="home-news-more">{{
        t.nav.news.more
      }}</RouterLink>
    </div>
    <div v-if="headlines.broadcast" class="text-primary fw-bold dt-clamp1" data-testid="home-broadcast">
      {{ t.nav.news.broadcast }}{{ newsText(headlines.broadcast, catalog) }}
    </div>
    <div v-for="n in headlines.news" :key="n.id" class="dt-clamp1" data-testid="home-news">
      {{ newsText(n, catalog) }}
    </div>
    <div v-if="!headlines.broadcast && headlines.news.length === 0" class="text-muted">
      {{ t.nav.news.empty }}
    </div>
  </div>
</template>
