<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { RestLogDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { logText } from '../../utils/events';
import { feedLink, feedSeenAt } from '../../utils/feed';
import { gameDateTime } from '../../utils/format';

/** 首页餐厅动态（问题记录 553）：最近 3 天最新的几条；没有就不显示。比上次在好友页看过的更新的加小圆点 */
const props = defineProps<{ items: RestLogDto[]; restId: number }>();
const catalog = useCatalogStore();
const t = useT();
const seen = computed(() => feedSeenAt(props.restId));
const isNew = (f: RestLogDto) => seen.value === null || f.at > seen.value;
const when = (iso: string) =>
  gameDateTime(iso, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
</script>

<template>
  <div v-if="items.length > 0" class="dt-card my-2 small" data-testid="home-feed">
    <div class="d-flex justify-content-between">
      <b>{{ t.home.feedTitle }}</b>
      <RouterLink to="/friends?tab=feed" class="dt-go" data-testid="home-feed-more">{{
        t.nav.news.more
      }}</RouterLink>
    </div>
    <div v-for="(f, i) in items" :key="i" class="dt-clamp1" data-testid="home-feed-row">
      <span v-if="isNew(f)" class="dt-feed-new text-danger me-1" data-testid="home-feed-new"
        ><i class="bi bi-circle-fill" aria-hidden="true"></i
        ><span class="visually-hidden">{{ t.home.feedNew }}</span></span
      ><span class="text-muted me-1">{{ when(f.at) }}</span>
      <RouterLink v-if="feedLink(f)" :to="feedLink(f)!">{{ logText(f, catalog) }}</RouterLink>
      <template v-else>{{ logText(f, catalog) }}</template>
    </div>
  </div>
</template>

<style scoped>
.dt-feed-new {
  font-size: 0.45rem;
  vertical-align: middle;
}
</style>
