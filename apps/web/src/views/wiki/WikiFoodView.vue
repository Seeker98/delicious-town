<script setup lang="ts">
import { computed, ref, onBeforeUnmount, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { OpenFoodDto, OpenStreetDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { GRADE_NAMES } from '../../utils/labels';
import { isNotFound, listBack, useWikiData } from './wiki';

/** 食材详情（问题记录 142）：用到它的菜谱一次显示 50 道 */
const PAGE = 50;
const route = useRoute();
const router = useRouter();
const t = useT();
const data = useWikiData();
const f = ref<OpenFoodDto | null>(null);
const streets = ref<OpenStreetDto[]>([]);
const error = ref<'' | 'missing' | 'failed'>('');
const shown = ref(PAGE);

const toast = useToastStore();
/** 读取序号：先打开 A 再打开 B，A 晚到的结果不盖掉 B（backlog #115） */
let seq = 0;
// 离开页面后，旧请求的结果和失败提示都不要了（质量期 ①b 终审）
onBeforeUnmount(() => seq++);
watch(
  () => Number(route.params.id),
  async (id) => {
    const mine = ++seq;
    f.value = null;
    error.value = '';
    shown.value = PAGE;
    try {
      const s = (await data.streets()).items;
      const v = await data.food(id);
      if (mine !== seq) return;
      streets.value = s;
      f.value = v;
      // 旧链接（重新编号前的编号）：接口已跳到新编号，地址栏也换成新的（设计 §5）
      if (v.id !== id) void router.replace(`/wiki/foods/${v.id}`);
    } catch (e) {
      if (mine !== seq) return;
      error.value = isNotFound(e) ? 'missing' : 'failed';
      if (error.value === 'failed') toast.push(t.value.wiki.loadFailed, 'danger');
    }
  },
  { immediate: true },
);
const w = computed(() => t.value.wiki);
const streetName = computed(() => new Map(streets.value.map((s) => [s.id, s.name])));
</script>

<template>
  <div>
    <RouterLink :to="listBack('/wiki/foods', router.options.history.state.back)" class="small">{{
      t.wiki.back
    }}</RouterLink>
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
