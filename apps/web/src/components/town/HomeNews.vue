<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { HeadlinesDto } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import { newsText } from '../../utils/news';

defineProps<{ headlines: HeadlinesDto }>();
const catalog = useCatalogStore();
</script>

<template>
  <div class="dt-card my-2 small">
    <div class="d-flex justify-content-between">
      <b>小镇新闻</b>
      <RouterLink to="/town?tab=news" data-testid="home-news-more">更多</RouterLink>
    </div>
    <div v-if="headlines.broadcast" class="text-primary fw-bold dt-clamp1" data-testid="home-broadcast">
      【广播】{{ newsText(headlines.broadcast, catalog) }}
    </div>
    <div v-for="n in headlines.news" :key="n.id" class="dt-clamp1" data-testid="home-news">
      {{ newsText(n, catalog) }}
    </div>
    <div v-if="!headlines.broadcast && headlines.news.length === 0" class="text-muted">还没有新闻</div>
  </div>
</template>
