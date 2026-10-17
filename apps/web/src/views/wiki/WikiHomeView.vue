<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type {
  OpenCookbookBrief,
  OpenFoodBrief,
  OpenGoodsBrief,
  OpenIndexDto,
  OpenMysteriousBrief,
  OpenStreetDto,
} from '@dt/shared';
import type { ArtName } from '../../art/generated/names';
import DtArt from '../../components/DtArt.vue';
import WikiRow from '../../components/wiki/WikiRow.vue';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { ROAD_NAMES } from '../../utils/labels';
import { matchText } from '../../utils/match';
import { KIND_ART, useWikiData, wikiPath, type WikiKind } from './wiki';

/**
 * 资料库首页（问题记录 142；界面改版 P11 报刊目录）：整页米色纸，报头宋体“小镇资料库”、双线，下面一行写总条数；
 * 分类目录是带图的格子（宋体名字 + 条数），特色菜（2026-10-17）、街道各占一整行；“专栏”两条是玩法攻略和开放接口。
 * 输入搜索后目录收起，结果按类分组，每组最多 3 条，多的给“看全部”（跳到那一类的列表并带上搜索词）。
 * 没登录的玩家也能看
 */
const PER_GROUP = 3;
const t = useT();
const data = useWikiData();
const catalog = useCatalogStore();
const index = ref<OpenIndexDto | null>(null);
const error = ref(false);
const q = ref('');
const toast = useToastStore();
/** 搜索用的五类列表：第一次输入时才读 */
const lists = shallowRef<{
  goods: OpenGoodsBrief[];
  foods: OpenFoodBrief[];
  cookbooks: OpenCookbookBrief[];
  mysterious: OpenMysteriousBrief[];
  streets: OpenStreetDto[];
} | null>(null);

onMounted(async () => {
  try {
    index.value = await data.index();
  } catch {
    error.value = true;
    toast.push(t.value.wiki.loadFailed, 'danger');
  }
});
watch(q, async (v) => {
  if (!v || lists.value) return;
  try {
    const [goods, foods, cookbooks, mysterious, streets] = await Promise.all([
      data.goods(),
      data.foods(),
      data.cookbooks(),
      data.mysterious(),
      data.streets(),
    ]);
    lists.value = {
      goods: goods.items,
      foods: foods.items,
      cookbooks: cookbooks.items,
      mysterious: mysterious.items,
      streets: streets.items,
    };
  } catch {
    error.value = true;
    toast.push(t.value.wiki.loadFailed, 'danger');
  }
});

const total = computed(() =>
  index.value ? Object.values(index.value.counts).reduce((a, b) => a + b, 0) : null,
);
const KINDS: Exclude<WikiKind, 'streets' | 'mysterious'>[] = ['goods', 'foods', 'cookbooks', 'equips'];

interface Hit {
  id: number;
  name: string;
  art: ArtName;
  level?: number;
  sub: string;
  rare?: boolean;
}
const w = computed(() => t.value.wiki);
const streetName = computed(() => new Map((lists.value?.streets ?? []).map((s) => [s.id, s.name])));
/** 按类分组的搜索结果：每组全部命中（显示时只列前 3 条） */
const groups = computed<Array<{ kind: WikiKind; hits: Hit[] }>>(() => {
  const l = lists.value;
  if (!q.value || !l) return [];
  const m = (name: string) => matchText(name, q.value);
  const out: Array<{ kind: WikiKind; hits: Hit[] }> = [
    {
      kind: 'goods',
      hits: l.goods
        .filter((g) => m(g.name))
        .map((g) => ({
          id: g.id,
          name: g.name,
          art: catalog.goodsArt(g.id),
          level: g.level,
          sub: w.value.goodsTypes[String(g.type)] ?? '',
        })),
    },
    {
      kind: 'foods',
      hits: l.foods
        .filter((f) => m(f.name))
        .map((f) => ({
          id: f.id,
          name: f.name,
          art: catalog.foodArt(f.id),
          level: f.level,
          sub: f.type === null ? '' : (w.value.foodTypes[String(f.type)] ?? ''),
          rare: f.rare,
        })),
    },
    {
      kind: 'cookbooks',
      hits: l.cookbooks
        .filter((c) => m(c.name))
        .map((c) => ({
          id: c.id,
          name: c.name,
          art: c.mainFoodId ? catalog.foodArt(c.mainFoodId) : 'food-misc',
          sub: [streetName.value.get(c.streetId) ?? '', w.value.fields.recommend(c.level)]
            .filter(Boolean)
            .join(' · '),
        })),
    },
    {
      kind: 'mysterious',
      hits: l.mysterious
        .filter((x) => m(x.name))
        .map((x) => ({
          id: x.id,
          name: x.name,
          art: x.mainFoodId ? catalog.foodArt(x.mainFoodId) : KIND_ART.mysterious,
          level: x.level,
          sub: ROAD_NAMES[x.road] ?? '',
        })),
    },
    {
      kind: 'streets',
      hits: l.streets
        .filter((s) => m(s.name))
        .map((s) => ({ id: s.id, name: s.name, art: 'wiki-streets' as const, sub: s.cookName })),
    },
  ];
  return out.filter((g) => g.hits.length > 0);
});
</script>

<template>
  <div class="dt-paper-page" data-testid="wiki-home">
    <header class="dt-paper-mast2">
      <div class="dt-paper-kick">{{ t.nav.appName }}</div>
      <h2 class="dt-paper-head">{{ t.wiki.libTitle }}</h2>
      <div class="dt-paper-dateline">
        <span>{{ total !== null ? t.wiki.totalCount(formatNum(total)) : '' }}</span
        ><span>{{ t.wiki.synced }}</span>
      </div>
    </header>
    <label class="dt-search-box dt-wiki-search">
      <i class="bi bi-search" aria-hidden="true"></i>
      <input
        v-model="q"
        type="search"
        :placeholder="t.wiki.searchAll"
        :aria-label="t.wiki.searchAll"
        data-testid="wiki-home-q"
      />
    </label>
    <div v-if="error" class="dt-empty" data-testid="wiki-error">{{ t.wiki.loadFailed }}</div>

    <div v-if="q" data-testid="wiki-hits">
      <section v-for="g in groups" :key="g.kind" :data-testid="`wiki-group-${g.kind}`">
        <div class="dt-wiki-group">{{ t.wiki.kinds[g.kind] }} · {{ g.hits.length }}</div>
        <div class="dt-card dt-rows-card">
          <WikiRow
            v-for="h in g.hits.slice(0, PER_GROUP)"
            :key="h.id"
            :to="wikiPath(g.kind, h.id)"
            :art="h.art"
            :name="h.name"
            :level="h.level"
            :testid="`wiki-hit-${g.kind}-${h.id}`"
          >
            <template #sub
              >{{ h.sub
              }}<template v-if="h.rare"
                >{{ h.sub ? ' · ' : '' }}<span class="dt-ink-warn">{{ t.wiki.rare }}</span></template
              ></template
            >
          </WikiRow>
        </div>
        <RouterLink
          v-if="g.hits.length > PER_GROUP"
          :to="{ path: `/wiki/${g.kind}`, query: { q } }"
          class="dt-wiki-more dt-go"
          :data-testid="`wiki-all-${g.kind}`"
          >{{ t.wiki.moreIn(g.hits.length - PER_GROUP, t.wiki.kinds[g.kind]) }}</RouterLink
        >
      </section>
      <div v-if="lists && groups.length === 0" class="dt-empty">{{ t.wiki.noResult }}</div>
    </div>

    <template v-else>
      <h3 class="dt-paper-sect">{{ t.wiki.catalogTitle }}</h3>
      <div class="dt-wiki-kinds">
        <RouterLink
          v-for="k in KINDS"
          :key="k"
          :to="`/wiki/${k}`"
          class="dt-wiki-kind"
          :data-testid="`wiki-kind-${k}`"
        >
          <span class="dt-wiki-kind-art"><DtArt :name="KIND_ART[k]" :size="30" /></span>
          <span
            ><b>{{ t.wiki.kinds[k] }}</b
            ><span class="dt-wiki-kind-count">{{ index ? t.wiki.count(index.counts[k]) : '' }}</span></span
          >
        </RouterLink>
        <RouterLink to="/wiki/mysterious" class="dt-wiki-kind is-wide" data-testid="wiki-kind-mysterious">
          <span class="dt-wiki-kind-art"><DtArt :name="KIND_ART.mysterious" :size="30" /></span>
          <span
            ><b>{{ t.wiki.kinds.mysterious }}</b
            ><span class="dt-wiki-kind-count"
              >{{ index ? `${t.wiki.count(index.counts.mysterious)} · ` : ''
              }}{{ t.wiki.mysteriousNote }}</span
            ></span
          >
        </RouterLink>
        <RouterLink to="/wiki/streets" class="dt-wiki-kind is-wide" data-testid="wiki-kind-streets">
          <span class="dt-wiki-kind-art"><DtArt :name="KIND_ART.streets" :size="30" /></span>
          <span
            ><b>{{ t.wiki.kinds.streets }}</b
            ><span class="dt-wiki-kind-count"
              >{{ index ? `${t.wiki.count(index.counts.streets)} · ` : '' }}{{ t.wiki.streetsNote }}</span
            ></span
          >
        </RouterLink>
      </div>
      <h3 class="dt-paper-sect">{{ t.wiki.columns }}</h3>
      <RouterLink to="/wiki/guide" class="dt-wiki-col" data-testid="wiki-guide-link">
        <DtArt name="wiki-compass" :size="34" />
        <span class="dt-row-main"
          ><b>{{ t.wiki.guide.title }}</b
          ><span>{{ t.wiki.guide.colSub }}</span></span
        >
      </RouterLink>
      <RouterLink to="/wiki/api" class="dt-wiki-col" data-testid="wiki-api-link">
        <DtArt name="wiki-api" :size="34" />
        <span class="dt-row-main"
          ><b>{{ t.wiki.api.title }}</b
          ><span>{{ t.wiki.api.colSub }}</span></span
        >
      </RouterLink>
    </template>
  </div>
</template>
