<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { OpenCookbookBrief, OpenStreetDto } from '@dt/shared';
import DtArt from '../../components/DtArt.vue';
import WikiEntry from '../../components/wiki/WikiEntry.vue';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { usePageTitle } from '../../stores/pageTitle';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { STREET_FOCUS } from '../../utils/labels';
import { useWikiData } from './wiki';

/**
 * 街道词条（问题记录 142；界面改版 P11 报刊风）：名字下面写菜系和街道类型（问题记录 378 方案 C），
 * 一段为什么是这个加成；资料表写加成和街道勋章；这条街的食谱一次 50 道，带主料的图
 */
const PAGE = 50;
const route = useRoute();
const t = useT();
const data = useWikiData();
const streets = shallowRef<OpenStreetDto[]>([]);
const cookbooks = shallowRef<OpenCookbookBrief[]>([]);
const toast = useToastStore();
const catalog = useCatalogStore();
const error = ref(false);
const loaded = ref(false);
const shown = ref(PAGE);
const id = computed(() => Number(route.params.id));

watch(
  id,
  async () => {
    loaded.value = false;
    error.value = false;
    shown.value = PAGE;
    try {
      streets.value = (await data.streets()).items;
      cookbooks.value = (await data.cookbooks()).items;
    } catch {
      error.value = true;
      toast.push(t.value.wiki.loadFailed, 'danger');
    } finally {
      loaded.value = true;
    }
  },
  { immediate: true },
);
const w = computed(() => t.value.wiki);
const s = computed(() => streets.value.find((x) => x.id === id.value) ?? null);
/** 顶栏标题是街名（界面改版 P2a） */
usePageTitle(() => s.value?.name);
const list = computed(() => cookbooks.value.filter((c) => c.streetId === id.value));
/** 第一行分类：街道 · 菜系 · 街道类型 */
const kick = computed(() =>
  s.value
    ? [w.value.kinds.streets, s.value.cookName, s.value.focus ? STREET_FOCUS[s.value.focus] : '']
        .filter(Boolean)
        .join(' · ')
    : '',
);
</script>

<template>
  <div>
    <div v-if="error" class="dt-empty" data-testid="wiki-error">{{ t.wiki.loadFailed }}</div>
    <div v-else-if="loaded && !s" class="dt-empty" data-testid="wiki-error">{{ t.wiki.notFound }}</div>
    <WikiEntry v-else-if="s" art="wiki-streets" :name="s.name" :kick="kick">
      <!-- 为什么是这个加成（问题记录 380） -->
      <p v-if="s.theme" class="dt-entry-desc" data-testid="wiki-street-theme">{{ s.theme }}</p>
      <dl class="dt-entry-dl">
        <dt>{{ w.fields.bonus }}</dt>
        <dd>{{ s.desc }}</dd>
        <template v-if="s.medal">
          <dt>{{ w.sections.medal }}</dt>
          <dd>
            <RouterLink :to="`/wiki/goods/${s.medal.id}`" data-testid="wiki-medal">{{
              s.medal.name
            }}</RouterLink>
          </dd>
        </template>
      </dl>
      <div data-testid="wiki-street-cookbooks">
        <h3 class="dt-entry-h">
          {{ w.sections.streetCookbooks }}<small>{{ w.fields.dishes(list.length) }}</small>
        </h3>
        <RouterLink
          v-for="c in list.slice(0, shown)"
          :key="c.id"
          :to="`/wiki/cookbooks/${c.id}`"
          class="dt-entry-row"
        >
          <DtArt :name="c.mainFoodId ? catalog.foodArt(c.mainFoodId) : 'food-misc'" :size="28" />
          <span class="dt-row-main">
            <span class="dt-row-title">{{ c.name }}</span>
            <span class="dt-row-sub"
              >{{ w.fields.recommend(c.level) }} · {{ w.fields.price }} {{ formatNum(c.coin) }}</span
            >
          </span>
        </RouterLink>
      </div>
      <button v-if="shown < list.length" type="button" class="dt-paper-btn" @click="shown += PAGE">
        {{ w.moreDishes(Math.min(PAGE, list.length - shown)) }}
      </button>
    </WikiEntry>
  </div>
</template>
