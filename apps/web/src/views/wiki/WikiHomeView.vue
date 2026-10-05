<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { OpenIndexDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useToastStore } from '../../stores/toast';
import { matchText } from '../../utils/match';
import { useWikiData, WIKI_KINDS, wikiPath, type WikiKind } from './wiki';

/** 游戏资料首页（问题记录 142）：五类卡片带数量，全局搜索在五类的名字里找，最多列 20 条 */
const LIMIT = 20;
const ICONS: Record<WikiKind, string> = {
  goods: 'bi-box-seam',
  foods: 'bi-basket',
  cookbooks: 'bi-journal-text',
  equips: 'bi-tools',
  streets: 'bi-signpost-2',
};
const t = useT();
const data = useWikiData();
const index = ref<OpenIndexDto | null>(null);
const error = ref(false);
const q = ref('');
/** 全局搜索用的名字表：第一次输入时才读 */
const names = shallowRef<Array<{ kind: WikiKind; id: number; name: string }> | null>(null);
const toast = useToastStore();

onMounted(async () => {
  try {
    index.value = await data.index();
  } catch {
    error.value = true;
    toast.push(t.value.wiki.loadFailed, 'danger');
  }
});
watch(q, async (v) => {
  if (!v || names.value) return;
  try {
    const [goods, foods, cookbooks, streets] = await Promise.all([
      data.goods(),
      data.foods(),
      data.cookbooks(),
      data.streets(),
    ]);
    names.value = [
      ...goods.items.map((x) => ({ kind: 'goods' as const, id: x.id, name: x.name })),
      ...foods.items.map((x) => ({ kind: 'foods' as const, id: x.id, name: x.name })),
      ...cookbooks.items.map((x) => ({ kind: 'cookbooks' as const, id: x.id, name: x.name })),
      ...streets.items.map((x) => ({ kind: 'streets' as const, id: x.id, name: x.name })),
    ];
  } catch {
    error.value = true;
    toast.push(t.value.wiki.loadFailed, 'danger');
  }
});
const hits = computed(() =>
  q.value && names.value ? names.value.filter((x) => matchText(x.name, q.value)).slice(0, LIMIT) : [],
);
</script>

<template>
  <div>
    <h5 class="dt-page-title">{{ t.wiki.title }}</h5>
    <p class="small text-muted mb-2">{{ t.wiki.intro }}</p>
    <input
      v-model="q"
      type="search"
      class="form-control form-control-sm mb-2"
      :placeholder="t.wiki.searchAll"
      data-testid="wiki-home-q"
    />
    <div v-if="q" class="mb-3" data-testid="wiki-hits">
      <RouterLink
        v-for="h in hits"
        :key="`${h.kind}-${h.id}`"
        :to="wikiPath(h.kind, h.id)"
        class="dt-item text-reset text-decoration-none"
        :data-testid="`wiki-hit-${h.kind}-${h.id}`"
      >
        <div class="dt-item-main">
          <div class="dt-item-title">{{ h.name }}</div>
          <div class="dt-meta">{{ t.wiki.kinds[h.kind] }}</div>
        </div>
        <i class="bi bi-chevron-right text-muted"></i>
      </RouterLink>
      <div v-if="names && hits.length === 0" class="dt-empty">{{ t.wiki.noResult }}</div>
    </div>
    <div v-if="error" class="dt-empty" data-testid="wiki-error">{{ t.wiki.loadFailed }}</div>
    <div class="dt-wiki-kinds mb-3">
      <RouterLink
        v-for="k in WIKI_KINDS"
        :key="k"
        :to="`/wiki/${k}`"
        class="dt-card text-reset text-decoration-none"
        :data-testid="`wiki-kind-${k}`"
      >
        <div class="dt-card-title"><i :class="['bi', ICONS[k], 'me-1']"></i>{{ t.wiki.kinds[k] }}</div>
        <div class="dt-meta">{{ index ? t.wiki.count(index.counts[k]) : '' }}</div>
      </RouterLink>
    </div>
    <!-- 玩法攻略（问题记录 384） -->
    <RouterLink to="/wiki/guide" class="d-block small mb-1" data-testid="wiki-guide-link"
      ><i class="bi bi-compass me-1"></i>{{ t.wiki.guide.link }}</RouterLink
    >
    <RouterLink to="/wiki/api" class="small" data-testid="wiki-api-link"
      ><i class="bi bi-braces me-1"></i>{{ t.wiki.apiLink }}</RouterLink
    >
  </div>
</template>
