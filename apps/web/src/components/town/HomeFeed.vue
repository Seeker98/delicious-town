<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { RestLogDto } from '@dt/shared';
import FeedRow from '../FeedRow.vue';
import { useT } from '../../composables/useT';
import { feedSeenAt } from '../../utils/feed';

/**
 * 首页餐厅动态（问题记录 553）：最近 3 天最新的几条；没有就不显示。比上次在好友页看过的更新的加小圆点。
 * 界面改版 P5：区块标题在卡片外，右边“全部”；卡片里一条一行
 */
const props = defineProps<{ items: RestLogDto[]; restId: number }>();
const t = useT();
const seen = computed(() => feedSeenAt(props.restId));
const isNew = (f: RestLogDto) => seen.value === null || f.at > seen.value;
</script>

<template>
  <section v-if="items.length > 0" class="dt-block" data-testid="home-feed">
    <div class="dt-block-head">
      <h2 class="dt-block-title">{{ t.home.feedTitle }}</h2>
      <RouterLink to="/friends?tab=feed" class="dt-go" data-testid="home-feed-more">{{
        t.nav.news.more
      }}</RouterLink>
    </div>
    <!-- 和好友页动态同一种行（界面改版 P2b）；首页只占一行，长的截断 -->
    <div class="dt-card dt-list-card small">
      <FeedRow
        v-for="(f, i) in items"
        :key="i"
        :item="f"
        :show-new="isNew(f)"
        class="dt-feed-1line"
        data-testid="home-feed-row"
      />
    </div>
  </section>
</template>
