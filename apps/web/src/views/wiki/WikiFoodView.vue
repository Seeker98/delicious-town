<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { OpenFoodDto, OpenStreetDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { formatNum } from '../../utils/format';
import { GRADE_NAMES } from '../../utils/labels';
import { isNotFound, useWikiData } from './wiki';

/** 食材详情（问题记录 142）：用到它的菜谱一次显示 50 道 */
const PAGE = 50;
const route = useRoute();
const t = useT();
const data = useWikiData();
const f = ref<OpenFoodDto | null>(null);
const streets = ref<OpenStreetDto[]>([]);
const error = ref<'' | 'missing' | 'failed'>('');
const shown = ref(PAGE);

watch(
  () => Number(route.params.id),
  async (id) => {
    f.value = null;
    error.value = '';
    shown.value = PAGE;
    try {
      streets.value = (await data.streets()).items;
      f.value = await data.food(id);
    } catch (e) {
      error.value = isNotFound(e) ? 'missing' : 'failed';
    }
  },
  { immediate: true },
);
const w = computed(() => t.value.wiki);
const streetName = computed(() => new Map(streets.value.map((s) => [s.id, s.name])));
</script>

<template>
  <div>
    <RouterLink to="/wiki/foods" class="small">{{ t.wiki.back }}</RouterLink>
    <div v-if="error" class="dt-empty" data-testid="wiki-error">
      {{ error === 'missing' ? t.wiki.notFound : t.wiki.loadFailed }}
    </div>
    <template v-else-if="f">
      <h5 class="dt-page-title mt-2">
        {{ f.name }} <span class="dt-tag">{{ f.rare ? w.rare : w.common }}</span>
      </h5>
      <dl class="dt-kv small">
        <dt>{{ w.fields.level }}</dt>
        <dd>
          {{ w.level(f.level) }}
          <span v-if="f.type !== null">· {{ w.foodTypes[String(f.type)] }}</span>
        </dd>
        <dt>{{ w.fields.systemPrice }}</dt>
        <dd>{{ w.coin(formatNum(f.coin)) }} · {{ w.fields.maxNum(f.maxNum) }}</dd>
      </dl>
      <p v-if="f.seed" class="small mt-2 mb-0">{{ w.fields.seed(f.seed.harvestNum) }}</p>

      <div data-testid="wiki-cookbooks">
        <h6 class="dt-section">{{ w.sections.cookbooks(f.cookbooks.length) }}</h6>
        <RouterLink
          v-for="c in f.cookbooks.slice(0, shown)"
          :key="c.id"
          :to="`/wiki/cookbooks/${c.id}`"
          class="dt-item text-reset text-decoration-none"
        >
          <div class="dt-item-main">
            <div class="dt-item-title">{{ c.name }}</div>
            <div class="dt-meta">
              {{ streetName.get(c.streetId) ?? '' }} · {{ w.fields.fromGrade(GRADE_NAMES[c.grade] ?? '') }}
            </div>
          </div>
          <i class="bi bi-chevron-right text-muted"></i>
        </RouterLink>
      </div>
      <button
        v-if="shown < f.cookbooks.length"
        type="button"
        class="btn btn-sm btn-outline-primary w-100 mt-2"
        @click="shown += PAGE"
      >
        {{ w.more(Math.min(PAGE, f.cookbooks.length - shown)) }}
      </button>

      <template v-if="f.mysterious.length > 0">
        <h6 class="dt-section">{{ w.sections.mysterious }}</h6>
        <p class="small mb-0" data-testid="wiki-mysterious">
          {{ f.mysterious.map((m) => m.name).join(t.events.sep) }}
        </p>
      </template>
    </template>
  </div>
</template>
