<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { RestLogDto } from '@dt/shared';
import { useT } from '../composables/useT';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { logText } from '../utils/events';
import { feedLink } from '../utils/feed';
import { gameDateTime } from '../utils/format';

/** 动态的一行（界面改版 P2b）：首页餐厅动态和好友页动态卡同一种——时间（月日时分）、统一文案，能点的去对方餐厅或帖子 */
defineProps<{ item: RestLogDto; showNew?: boolean }>();
const catalog = useCatalogStore();
const rest = useRestaurantStore();
const t = useT();
const when = (iso: string) =>
  gameDateTime(iso, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
</script>

<template>
  <div class="dt-feed">
    <span v-if="showNew" class="dt-feed-new text-danger" data-testid="feed-new"
      ><i class="bi bi-circle-fill" aria-hidden="true"></i
      ><span class="visually-hidden">{{ t.home.feedNew }}</span></span
    >
    <span class="dt-feed-time">{{ when(item.at) }}</span>
    <span class="dt-feed-text">
      <RouterLink v-if="feedLink(item, rest.featureOn)" :to="feedLink(item, rest.featureOn)!">{{
        logText(item, catalog)
      }}</RouterLink>
      <template v-else>{{ logText(item, catalog) }}</template>
    </span>
  </div>
</template>

<style scoped>
.dt-feed-new {
  font-size: 0.45rem;
  align-self: center;
}
</style>
