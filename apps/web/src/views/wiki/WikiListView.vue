<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type {
  OpenCookbookBrief,
  OpenEquipBrief,
  OpenFoodBrief,
  OpenGoodsBrief,
  OpenStreetDto,
} from '@dt/shared';
import { useT } from '../../composables/useT';
import { formatNum } from '../../utils/format';
import { PART_NAMES } from '../../utils/labels';
import { matchText } from '../../utils/match';
import { isWikiKind, useWikiData, wikiPath, type WikiKind } from './wiki';

/** 游戏资料列表（问题记录 142）：五类共用，按类目换筛选和信息行 */
const PAGE = 50;
const GOODS_TYPES = [0, 1, 2, 3, 4, 5, 9, 10];
const FOOD_LEVELS = [1, 2, 3, 4, 5, 6, 7];
const PARTS = [1, 2, 3, 4, 5];
/** 菜谱推荐等级分段 */
const LEVEL_BANDS: Array<[number, number]> = [
  [1, 20],
  [21, 40],
  [41, 60],
  [61, 80],
  [81, 999],
];

const route = useRoute();
const t = useT();
const data = useWikiData();
const kind = computed<WikiKind | null>(() => (isWikiKind(route.params.kind) ? route.params.kind : null));

const goods = ref<OpenGoodsBrief[]>([]);
const foods = ref<OpenFoodBrief[]>([]);
const cookbooks = ref<OpenCookbookBrief[]>([]);
const equips = ref<OpenEquipBrief[]>([]);
const streets = ref<OpenStreetDto[]>([]);
const error = ref(false);
const loaded = ref(false);

const q = ref('');
/** 类型、等级、部位、等级段：按类目解释；null = 全部 */
const filter = ref<number | null>(null);
const rareOnly = ref(false);
const street = ref<number | null>(null);
const shown = ref(PAGE);

async function load(k: WikiKind) {
  loaded.value = false;
  error.value = false;
  try {
    streets.value = (await data.streets()).items;
    if (k === 'goods') goods.value = (await data.goods()).items;
    else if (k === 'foods') foods.value = (await data.foods()).items;
    else if (k === 'cookbooks') cookbooks.value = (await data.cookbooks()).items;
    else if (k === 'equips') equips.value = (await data.equips()).items;
  } catch {
    error.value = true;
  } finally {
    loaded.value = true;
  }
}
watch(
  kind,
  (k) => {
    q.value = '';
    filter.value = null;
    rareOnly.value = false;
    street.value = null;
    if (k) void load(k);
  },
  { immediate: true },
);
watch([q, filter, rareOnly, street], () => (shown.value = PAGE));

const streetName = computed(() => new Map(streets.value.map((s) => [s.id, s.name])));
const w = computed(() => t.value.wiki);

interface Row {
  id: number;
  name: string;
  meta: string;
}
/** 筛选前的全部行（只看名字搜索） */
const all = computed<Row[]>(() => {
  const k = kind.value;
  const level = (n: number) => w.value.level(n);
  if (k === 'goods')
    return goods.value
      .filter((g) => filter.value === null || g.type === filter.value)
      .map((g) => ({
        id: g.id,
        name: g.name,
        meta: [
          w.value.goodsTypes[String(g.type)] ?? '',
          level(g.level),
          g.onSale && g.coin > 0 ? w.value.coin(formatNum(g.coin)) : '',
          g.onSale && g.diamond > 0 ? w.value.diamond(formatNum(g.diamond)) : '',
        ]
          .filter(Boolean)
          .join(' · '),
      }));
  if (k === 'foods')
    return foods.value
      .filter((f) => (filter.value === null || f.level === filter.value) && (!rareOnly.value || f.rare))
      .map((f) => ({
        id: f.id,
        name: f.name,
        meta: [
          level(f.level),
          f.rare ? w.value.rare : w.value.common,
          f.type === null ? '' : (w.value.foodTypes[String(f.type)] ?? ''),
        ]
          .filter(Boolean)
          .join(' · '),
      }));
  if (k === 'cookbooks') {
    const band = filter.value === null ? null : LEVEL_BANDS[filter.value]!;
    return cookbooks.value
      .filter((c) => street.value === null || c.streetId === street.value)
      .filter((c) => !band || (c.level >= band[0] && c.level <= band[1]))
      .map((c) => ({
        id: c.id,
        name: c.name,
        meta: [
          streetName.value.get(c.streetId) ?? '',
          w.value.fields.recommend(c.level),
          `${w.value.fields.price} ${formatNum(c.coin)}`,
        ]
          .filter(Boolean)
          .join(' · '),
      }));
  }
  if (k === 'equips')
    return equips.value
      .filter((e) => filter.value === null || e.part === filter.value)
      .map((e) => ({
        id: e.id,
        name: e.name,
        meta: [PART_NAMES[e.part] ?? '', w.value.fields.minLevel(e.minLevel), `+10 ${e.maxTotal}`].join(
          ' · ',
        ),
      }));
  if (k === 'streets')
    return streets.value.map((s) => ({
      id: s.id,
      name: s.name,
      meta: `${s.cookName} · ${w.value.fields.cookbookCount(s.cookbookCount)}`,
    }));
  return [];
});
const matched = computed(() => all.value.filter((r) => matchText(r.name, q.value)));
/** 只有菜谱分页（3,800 多道），其他类目一次列完 */
const visible = computed(() =>
  kind.value === 'cookbooks' ? matched.value.slice(0, shown.value) : matched.value,
);

/** 各类目的筛选胶囊：值和文字 */
const pills = computed<Array<{ value: number; label: string }>>(() => {
  const k = kind.value;
  if (k === 'goods')
    return GOODS_TYPES.map((x) => ({ value: x, label: w.value.goodsTypes[String(x)] ?? '' }));
  if (k === 'foods') return FOOD_LEVELS.map((x) => ({ value: x, label: w.value.level(x) }));
  if (k === 'equips') return PARTS.map((x) => ({ value: x, label: PART_NAMES[x] ?? '' }));
  if (k === 'cookbooks')
    return LEVEL_BANDS.map(([a, b], i) => ({ value: i, label: b >= 999 ? `${a}+` : `${a}~${b}` }));
  return [];
});
const onStreet = (e: Event) => {
  const v = (e.target as HTMLSelectElement).value;
  street.value = v === '' ? null : Number(v);
};
</script>

<template>
  <div>
    <RouterLink to="/wiki" class="small">{{ t.wiki.home }}</RouterLink>
    <div v-if="!kind" class="dt-empty" data-testid="wiki-error">{{ t.wiki.notFound }}</div>
    <template v-else>
      <h5 class="dt-page-title mt-2">
        {{ t.wiki.kinds[kind] }}
        <small class="text-muted">{{ t.wiki.count(formatNum(matched.length)) }}</small>
      </h5>
      <input
        v-model="q"
        type="search"
        class="form-control form-control-sm mb-2"
        :placeholder="t.wiki.search"
        data-testid="wiki-q"
      />
      <select
        v-if="kind === 'cookbooks'"
        class="form-select form-select-sm mb-2"
        :value="street ?? ''"
        data-testid="wiki-street"
        @change="onStreet"
      >
        <option value="">{{ t.wiki.allStreets }}</option>
        <option v-for="s in streets" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <div v-if="pills.length > 0" class="dt-pills mb-2">
        <a
          href="#"
          :class="{ active: filter === null }"
          data-testid="wiki-filter-all"
          @click.prevent="filter = null"
          >{{ t.wiki.all }}</a
        >
        <a
          v-for="p in pills"
          :key="p.value"
          href="#"
          :class="{ active: filter === p.value }"
          :data-testid="`wiki-filter-${p.value}`"
          @click.prevent="filter = p.value"
          >{{ p.label }}</a
        >
        <a
          v-if="kind === 'foods'"
          href="#"
          :class="{ active: rareOnly }"
          data-testid="wiki-rare"
          @click.prevent="rareOnly = !rareOnly"
          >{{ t.wiki.rareOnly }}</a
        >
      </div>
      <div v-if="error" class="dt-empty" data-testid="wiki-error">{{ t.wiki.loadFailed }}</div>
      <template v-else-if="loaded">
        <RouterLink
          v-for="r in visible"
          :key="r.id"
          :to="wikiPath(kind, r.id)"
          class="dt-item text-reset text-decoration-none"
          :data-testid="`wiki-row-${r.id}`"
        >
          <div class="dt-item-main">
            <div class="dt-item-title">{{ r.name }}</div>
            <div class="dt-meta">{{ r.meta }}</div>
          </div>
          <i class="bi bi-chevron-right text-muted"></i>
        </RouterLink>
        <div v-if="matched.length === 0" class="dt-empty" data-testid="wiki-empty">{{ t.wiki.noResult }}</div>
        <button
          v-if="visible.length < matched.length"
          type="button"
          class="btn btn-sm btn-outline-primary w-100 mt-2"
          data-testid="wiki-more"
          @click="shown += PAGE"
        >
          {{ t.wiki.more(Math.min(PAGE, matched.length - visible.length)) }}
        </button>
      </template>
    </template>
  </div>
</template>
