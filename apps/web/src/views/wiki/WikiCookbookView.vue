<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { OpenCookbookDto, OpenStreetDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { formatNum } from '../../utils/format';
import { GRADE_NAMES, TASTE_NAMES } from '../../utils/labels';
import { isNotFound, useWikiData } from './wiki';

/** 菜谱详情（问题记录 142）：1~10 品级的食材，食材都是链接 */
const route = useRoute();
const t = useT();
const data = useWikiData();
const c = ref<OpenCookbookDto | null>(null);
const streets = ref<OpenStreetDto[]>([]);
const error = ref<'' | 'missing' | 'failed'>('');

watch(
  () => Number(route.params.id),
  async (id) => {
    c.value = null;
    error.value = '';
    try {
      streets.value = (await data.streets()).items;
      c.value = await data.cookbook(id);
    } catch (e) {
      error.value = isNotFound(e) ? 'missing' : 'failed';
    }
  },
  { immediate: true },
);
const w = computed(() => t.value.wiki);
const street = computed(() => streets.value.find((s) => s.id === c.value?.streetId) ?? null);
/** 口味用顿号还是逗号跟着语言：简繁中文用顿号 */
const tastes = computed(() =>
  (c.value?.taste ?? []).map((x) => TASTE_NAMES[x] ?? '').join(t.value.events.sep),
);
</script>

<template>
  <div>
    <RouterLink to="/wiki/cookbooks" class="small">{{ t.wiki.back }}</RouterLink>
    <div v-if="error" class="dt-empty" data-testid="wiki-error">
      {{ error === 'missing' ? t.wiki.notFound : t.wiki.loadFailed }}
    </div>
    <template v-else-if="c">
      <h5 class="dt-page-title mt-2">{{ c.name }}</h5>
      <p v-if="c.desc" class="small mb-2">{{ c.desc }}</p>
      <dl class="dt-kv small">
        <dt>{{ w.fields.street }}</dt>
        <dd>
          <RouterLink :to="`/wiki/streets/${c.streetId}`" data-testid="wiki-street-link">{{
            street?.name ?? c.streetId
          }}</RouterLink>
        </dd>
        <dt>{{ w.fields.level }}</dt>
        <dd>{{ w.fields.recommend(c.level) }}</dd>
        <dt>{{ w.fields.price }}</dt>
        <dd>{{ w.coin(formatNum(c.coin)) }}</dd>
        <template v-if="tastes">
          <dt>{{ w.fields.taste }}</dt>
          <dd>{{ tastes }}</dd>
        </template>
      </dl>
      <h6 class="dt-section">{{ w.sections.grades }}</h6>
      <dl class="dt-kv small" data-testid="wiki-grades">
        <template v-for="g in c.grades" :key="g.grade">
          <dt>{{ GRADE_NAMES[g.grade] }}</dt>
          <dd>
            <span class="dt-wiki-foods">
              <span v-for="f in g.foods" :key="f.foodsId" class="text-nowrap"
                ><RouterLink :to="`/wiki/foods/${f.foodsId}`">{{ f.name }}</RouterLink> ×{{ f.num }}</span
              >
            </span>
          </dd>
        </template>
      </dl>
    </template>
  </div>
</template>
