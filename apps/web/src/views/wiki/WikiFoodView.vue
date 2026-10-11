<script setup lang="ts">
import { computed, ref, onBeforeUnmount, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { OpenFoodDto, OpenStreetDto } from '@dt/shared';
import DtArt from '../../components/DtArt.vue';
import WikiEntry from '../../components/wiki/WikiEntry.vue';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { usePageTitle } from '../../stores/pageTitle';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { GRADE_NAMES } from '../../utils/labels';
import { isNotFound, useWikiData } from './wiki';

/** 食材词条（问题记录 142；界面改版 P11 报刊风）：资料表、用到它的食谱（一次显示 50 道，带主料的图）、用到它的特色菜 */
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
const catalog = useCatalogStore();
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
/** 顶栏标题是食材名；稀有/普通的标签放在第一行（界面改版 P2a） */
usePageTitle(() => f.value?.name);
const streetName = computed(() => new Map(streets.value.map((s) => [s.id, s.name])));
</script>

<template>
  <div>
    <div v-if="error" class="dt-empty" data-testid="wiki-error">
      {{ error === 'missing' ? t.wiki.notFound : t.wiki.loadFailed }}
    </div>
    <WikiEntry v-else-if="f" :art="catalog.foodArt(f.id)" :name="f.name">
      <template #kick
        >{{
          [w.kinds.foods, f.type === null ? '' : (w.foodTypes[String(f.type)] ?? '')]
            .filter(Boolean)
            .join(' · ')
        }}<template v-if="f.rare">
          · <span class="dt-entry-rare">{{ w.rare }}</span></template
        ></template
      >
      <dl class="dt-entry-dl">
        <dt>{{ w.fields.level }}</dt>
        <dd>{{ w.level(f.level) }}</dd>
        <dt>{{ w.fields.systemPrice }}</dt>
        <dd>{{ w.coin(formatNum(f.coin)) }}</dd>
        <dt>{{ w.fields.maxHold }}</dt>
        <dd>{{ w.fields.pieces(f.maxNum) }}</dd>
        <template v-if="f.seed">
          <dt>{{ w.fields.garden }}</dt>
          <dd>{{ w.fields.seed(f.seed.harvestNum) }}</dd>
        </template>
      </dl>

      <div data-testid="wiki-cookbooks">
        <h3 class="dt-entry-h">
          {{ w.sections.cookbooks }}<small>{{ w.fields.dishes(f.cookbooks.length) }}</small>
        </h3>
        <RouterLink
          v-for="c in f.cookbooks.slice(0, shown)"
          :key="c.id"
          :to="`/wiki/cookbooks/${c.id}`"
          class="dt-entry-row"
        >
          <DtArt :name="c.mainFoodId ? catalog.foodArt(c.mainFoodId) : 'food-misc'" :size="28" />
          <span class="dt-row-main">
            <span class="dt-row-title">{{ c.name }}</span>
            <span class="dt-row-sub"
              >{{ streetName.get(c.streetId) ?? '' }} ·
              {{ w.fields.fromGrade(GRADE_NAMES[c.grade] ?? '') }}</span
            >
          </span>
        </RouterLink>
      </div>
      <button v-if="shown < f.cookbooks.length" type="button" class="dt-paper-btn" @click="shown += PAGE">
        {{ w.moreDishes(Math.min(PAGE, f.cookbooks.length - shown)) }}
      </button>

      <template v-if="f.mysterious.length > 0">
        <h3 class="dt-entry-h">{{ w.sections.mysterious }}</h3>
        <p class="dt-entry-p" data-testid="wiki-mysterious">
          {{ f.mysterious.map((m) => m.name).join(t.events.sep) }}
        </p>
      </template>
    </WikiEntry>
  </div>
</template>
