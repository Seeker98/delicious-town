<script setup lang="ts">
import { computed, ref, onBeforeUnmount, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { OpenMysteriousDto, OpenMysteriousListDto } from '@dt/shared';
import WikiEntry from '../../components/wiki/WikiEntry.vue';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { usePageTitle } from '../../stores/pageTitle';
import { useToastStore } from '../../stores/toast';
import { formatNum, formatPct } from '../../utils/format';
import { ROAD_NAMES, TASTE_NAMES } from '../../utils/labels';
import { isNotFound, KIND_ART, useWikiData } from './wiki';

/**
 * 特色菜词条（资料库特色菜 2026-10-17）：大图用第一样食材的图，名字下面写特色菜 · 道 · 口味；
 * 资料表写等级、道（点了回到按这一道筛选的列表）、营养值、卖给顾客的倍率、残卷单价；
 * 下面是食材、当令天气、残卷从哪来、道的加成。当令表和道的规则在特色菜列表接口里（缓存），两个一起读
 */
const route = useRoute();
const t = useT();
const data = useWikiData();
const m = ref<OpenMysteriousDto | null>(null);
const list = ref<OpenMysteriousListDto | null>(null);
const error = ref<'' | 'missing' | 'failed'>('');

const toast = useToastStore();
const catalog = useCatalogStore();
/** 读取序号：先打开 A 再打开 B，A 晚到的结果不盖掉 B */
let seq = 0;
onBeforeUnmount(() => seq++);
watch(
  () => Number(route.params.id),
  async (id) => {
    const mine = ++seq;
    m.value = null;
    error.value = '';
    try {
      const [l, v] = await Promise.all([data.mysterious(), data.mysteriousDetail(id)]);
      if (mine !== seq) return;
      list.value = l;
      m.value = v;
    } catch (e) {
      if (mine !== seq) return;
      error.value = isNotFound(e) ? 'missing' : 'failed';
      if (error.value === 'failed') toast.push(t.value.wiki.loadFailed, 'danger');
    }
  },
  { immediate: true },
);
const w = computed(() => t.value.wiki);
usePageTitle(() => m.value?.name);
const sep = computed(() => t.value.events.sep);
const road = computed(() => (m.value ? (ROAD_NAMES[m.value.road] ?? '') : ''));
const tastes = computed(() =>
  (m.value?.taste ?? [])
    .map((x) => TASTE_NAMES[x] ?? '')
    .filter(Boolean)
    .join(sep.value),
);
/** 第一行分类：特色菜 · 道 · 口味 */
const kick = computed(() =>
  [w.value.kinds.mysterious, road.value, tastes.value ? w.value.fields.tasteOf(tastes.value) : '']
    .filter(Boolean)
    .join(' · '),
);
const inSeason = computed(() => {
  if (!m.value || !list.value) return '';
  return w.value.mc.inSeason(
    m.value.inSeason.map((x) => x.name).join(sep.value),
    list.value.special.map((x) => x.name).join(sep.value),
  );
});
const pct = (x: number) => formatPct(x, { digits: 1 });
const roadRule = computed(() => {
  const r = list.value?.rules;
  return r ? w.value.mc.roadRule(road.value, pct(r.same), pct(r.sameMax), pct(r.other), pct(r.otherMax)) : '';
});
</script>

<template>
  <div>
    <div v-if="error" class="dt-empty" data-testid="wiki-error">
      {{ error === 'missing' ? t.wiki.notFound : t.wiki.loadFailed }}
    </div>
    <WikiEntry
      v-else-if="m && list"
      :art="m.mainFoodId ? catalog.foodArt(m.mainFoodId) : KIND_ART.mysterious"
      :name="m.name"
      :kick="kick"
    >
      <dl class="dt-entry-dl">
        <dt>{{ w.fields.level }}</dt>
        <dd>{{ w.level(m.level) }}</dd>
        <dt>{{ w.fields.road }}</dt>
        <dd>
          <RouterLink
            :to="{ path: '/wiki/mysterious', query: { f: String(m.road) } }"
            data-testid="wiki-road-link"
            >{{ road }}</RouterLink
          >
        </dd>
        <dt>{{ w.fields.nutritive }}</dt>
        <dd>{{ formatNum(m.nutritive) }}</dd>
        <dt>{{ w.fields.saleRate }}</dt>
        <dd>{{ w.fields.saleRateVal(formatNum(m.saleRate)) }}</dd>
        <dt>{{ w.fields.remnantPrice }}</dt>
        <dd>{{ w.coin(formatNum(m.coin)) }}</dd>
      </dl>

      <h3 class="dt-entry-h">{{ w.sections.mcFoods }}</h3>
      <p class="dt-entry-p" data-testid="wiki-mc-foods">
        <template v-for="(f, i) in m.foods" :key="f.id"
          >{{ i > 0 ? sep : '' }}<RouterLink :to="`/wiki/foods/${f.id}`">{{ f.name }}</RouterLink></template
        >
      </p>

      <h3 class="dt-entry-h">{{ w.sections.inSeason }}</h3>
      <p class="dt-entry-p" data-testid="wiki-mc-season">{{ inSeason }}</p>
      <p class="dt-entry-note">{{ w.mc.inSeasonNote(list.rules.shilingMinStar) }}</p>

      <h3 class="dt-entry-h">{{ w.sections.remnantSources }}</h3>
      <ul class="dt-entry-list" data-testid="wiki-mc-sources">
        <li v-if="m.sources.appraise.length > 0">
          {{ w.mc.appraise
          }}<template v-for="(a, i) in m.sources.appraise" :key="a.id"
            >{{ i > 0 ? sep : '' }}<RouterLink :to="`/wiki/goods/${a.id}`">{{ a.name }}</RouterLink> ({{
              a.rate >= 1 ? w.mc.sure : pct(a.rate)
            }})</template
          >
        </li>
        <li v-if="m.sources.fragments !== null">{{ w.mc.fragments(m.sources.fragments, m.level) }}</li>
        <li v-if="m.sources.shilingShop">
          {{
            (m.sources.shilingShop.rare ? w.mc.shopRare : w.mc.shop)(
              formatNum(m.sources.shilingShop.price),
              m.sources.shilingShop.weekly,
            )
          }}
        </li>
        <li>{{ w.mc.lesson }}</li>
      </ul>
      <p class="dt-entry-note">{{ w.mc.learn(list.rules.remnants) }}</p>

      <h3 class="dt-entry-h">{{ w.sections.roadRule }}</h3>
      <p class="dt-entry-p" data-testid="wiki-mc-road">{{ roadRule }}</p>
      <RouterLink to="/wiki/guide" class="dt-wiki-more dt-go" data-testid="wiki-mc-guide">{{
        w.mc.guide
      }}</RouterLink>
    </WikiEntry>
  </div>
</template>
