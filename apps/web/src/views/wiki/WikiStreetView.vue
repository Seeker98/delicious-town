<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { OpenCookbookBrief, OpenStreetDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { formatNum } from '../../utils/format';
import { useWikiData } from './wiki';

/** 街道详情（问题记录 142）：菜系、加成、街道勋章、这条街的菜谱（一次 50 道） */
const PAGE = 50;
const route = useRoute();
const t = useT();
const data = useWikiData();
const streets = ref<OpenStreetDto[]>([]);
const cookbooks = ref<OpenCookbookBrief[]>([]);
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
    } finally {
      loaded.value = true;
    }
  },
  { immediate: true },
);
const w = computed(() => t.value.wiki);
const s = computed(() => streets.value.find((x) => x.id === id.value) ?? null);
const list = computed(() => cookbooks.value.filter((c) => c.streetId === id.value));
</script>

<template>
  <div>
    <RouterLink to="/wiki/streets" class="small">{{ t.wiki.back }}</RouterLink>
    <div v-if="error" class="dt-empty" data-testid="wiki-error">{{ t.wiki.loadFailed }}</div>
    <div v-else-if="loaded && !s" class="dt-empty" data-testid="wiki-error">{{ t.wiki.notFound }}</div>
    <template v-else-if="s">
      <h5 class="dt-page-title mt-2">{{ s.name }}</h5>
      <dl class="dt-kv small">
        <dt>{{ w.fields.cookName }}</dt>
        <dd>{{ s.cookName }}</dd>
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
        <h6 class="dt-section">
          {{ w.sections.streetCookbooks }}
          <small class="text-muted">{{ w.count(list.length) }}</small>
        </h6>
        <RouterLink
          v-for="c in list.slice(0, shown)"
          :key="c.id"
          :to="`/wiki/cookbooks/${c.id}`"
          class="dt-item text-reset text-decoration-none"
        >
          <div class="dt-item-main">
            <div class="dt-item-title">{{ c.name }}</div>
            <div class="dt-meta">
              {{ w.fields.recommend(c.level) }} · {{ w.fields.price }} {{ formatNum(c.coin) }}
            </div>
          </div>
          <i class="bi bi-chevron-right text-muted"></i>
        </RouterLink>
      </div>
      <button
        v-if="shown < list.length"
        type="button"
        class="btn btn-sm btn-outline-primary w-100 mt-2"
        @click="shown += PAGE"
      >
        {{ w.more(Math.min(PAGE, list.length - shown)) }}
      </button>
    </template>
  </div>
</template>
