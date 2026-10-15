<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  OpenCookbookBrief,
  OpenEquipBrief,
  OpenFoodBrief,
  OpenGoodsBrief,
  OpenStreetDto,
  OpenSuitDto,
} from '@dt/shared';
import type { ArtName } from '../../art/generated/names';
import DtSheet from '../../components/DtSheet.vue';
import PickRow from '../../components/PickRow.vue';
import WikiRow from '../../components/wiki/WikiRow.vue';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { usePageTitle } from '../../stores/pageTitle';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { PART_NAMES, STREET_FOCUS } from '../../utils/labels';
import { matchText } from '../../utils/match';
import { queryInt } from '../../utils/query';
import { isWikiKind, PART_ART, useWikiData, wikiPath, type WikiKind } from './wiki';

/**
 * 游戏资料列表（问题记录 142；界面改版 P11）：五类共用，按类目换筛选和信息行。
 * 一行一条，左边 44px 图（道具按类别、食材按类别、食谱用主料、厨具用部位图标），名字后面按等级标角标；
 * 筛选胶囊放得下就换行，条数写在列表右上；食谱的街道是整宽胶囊，点开底部面板选
 */
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
/** 地址里的显示条数上限（手改成几千时不一次渲染三千多行） */
const MAX_SHOWN = 1000;
/** 每个类目的筛选胶囊取值 */
function filtersOf(k: WikiKind | null): number[] {
  if (k === 'goods') return GOODS_TYPES;
  if (k === 'foods') return FOOD_LEVELS;
  if (k === 'cookbooks') return LEVEL_BANDS.map((_, i) => i);
  if (k === 'equips') return PARTS;
  return [];
}

const route = useRoute();
const router = useRouter();
const t = useT();
const data = useWikiData();
const kind = computed<WikiKind | null>(() => (isWikiKind(route.params.kind) ? route.params.kind : null));

// 列表只整体替换、不逐条改：用 shallowRef，三千多条菜谱不必逐个做成响应式（backlog #115）
const goods = shallowRef<OpenGoodsBrief[]>([]);
const foods = shallowRef<OpenFoodBrief[]>([]);
const cookbooks = shallowRef<OpenCookbookBrief[]>([]);
const equips = shallowRef<OpenEquipBrief[]>([]);
const suits = shallowRef<OpenSuitDto[]>([]);
const streets = shallowRef<OpenStreetDto[]>([]);
const toast = useToastStore();
const error = ref(false);
const loaded = ref(false);

const q = ref('');
/** 类型、等级、部位、等级段：按类目解释；null = 全部 */
const filter = ref<number | null>(null);
const rareOnly = ref(false);
const street = ref<number | null>(null);
/** 当前搜索和筛选的组合；显示条数只对点“再显示”时的这个组合有效，换了就回到一页 */
const filterKey = computed(() => JSON.stringify([q.value, filter.value, rareOnly.value, street.value]));
const more = ref({ key: '', n: PAGE });
const shown = computed(() => (more.value.key === filterKey.value ? more.value.n : PAGE));
// 条件一变就清掉多显示的条数：改回原来的条件也只显示一页（从地址恢复时 key 已经对上，不会被清）
watch(filterKey, (k) => {
  if (more.value.key !== k) more.value = { key: k, n: PAGE };
});

/** 读取序号：慢网络下先点 A 再点 B，A 晚到的结果（包括失败）不影响 B（backlog #115） */
let seq = 0;
// 离开页面（包括切换语言重新挂载）后，旧请求的结果和失败提示都不要了（质量期 ①b 终审）
onBeforeUnmount(() => seq++);
async function load(k: WikiKind) {
  const mine = ++seq;
  loaded.value = false;
  error.value = false;
  try {
    const s = (await data.streets()).items;
    const items =
      k === 'goods'
        ? (await data.goods()).items
        : k === 'foods'
          ? (await data.foods()).items
          : k === 'cookbooks'
            ? (await data.cookbooks()).items
            : k === 'equips'
              ? await data.equips()
              : null;
    if (mine !== seq) return;
    streets.value = s;
    // 地址里的街道不存在（backlog 第 ⑧ 批审查）：当成全部
    if (street.value !== null && !s.some((x) => x.id === street.value)) {
      // 地址里的显示条数照旧（换了条件组合，要把条数一起挪过去）
      const n = more.value.n;
      street.value = null;
      more.value = { key: filterKey.value, n };
    }
    if (k === 'goods') goods.value = items as OpenGoodsBrief[];
    else if (k === 'foods') foods.value = items as OpenFoodBrief[];
    else if (k === 'cookbooks') cookbooks.value = items as OpenCookbookBrief[];
    else if (k === 'equips' && items && 'suits' in items) {
      equips.value = items.items;
      suits.value = items.suits;
    }
  } catch {
    if (mine !== seq) return;
    error.value = true;
    toast.push(t.value.wiki.loadFailed, 'danger');
  }
  if (mine === seq) loaded.value = true;
}
// 搜索、筛选、街道、显示条数记在地址里（问题记录 372）：从详情返回时按地址恢复
watch(
  kind,
  (k) => {
    const x = route.query;
    q.value = typeof x.q === 'string' ? x.q : '';
    // 按类目校验（backlog 第 ⑧ 批）：筛选值不在这个类目的胶囊里就不算；街道只有菜谱、只看稀有只有食材有；条数有上限
    const f = queryInt(x.f, 0);
    filter.value = f !== null && filtersOf(k).includes(f) ? f : null;
    rareOnly.value = k === 'foods' && x.rare === '1';
    street.value = k === 'cookbooks' ? queryInt(x.street, 0) : null;
    more.value = { key: filterKey.value, n: Math.min(queryInt(x.n, PAGE) ?? PAGE, MAX_SHOWN) };
    // 类目不合法时也作废还在路上的请求
    if (k) void load(k);
    else seq++;
  },
  { immediate: true },
);
watch([q, filter, rareOnly, street, shown], ([qq, f, rare, s, n]) => {
  // 离开列表（点进详情）时路由先变：不能把列表的参数写到别的页面上
  if (!kind.value || route.params.kind !== kind.value) return;
  void router.replace({
    query: {
      // 保留别的参数（和食谱页一样，backlog 第 ⑧ 批审查）；值为 undefined 的会去掉
      ...route.query,
      street: s === null ? undefined : String(s),
      f: f === null ? undefined : String(f),
      rare: rare ? '1' : undefined,
      q: qq === '' ? undefined : qq,
      n: n > PAGE ? String(n) : undefined,
    },
  });
});

const streetName = computed(() => new Map(streets.value.map((s) => [s.id, s.name])));
const suitName = computed(() => new Map(suits.value.map((s) => [s.id, s.name])));
const catalog = useCatalogStore();
const w = computed(() => t.value.wiki);
/** 顶栏标题是类目名（界面改版 P2a） */
usePageTitle(() => (kind.value ? t.value.wiki.kinds[kind.value] : null));

interface Row {
  id: number;
  name: string;
  art: ArtName;
  /** 名字后面的等级角标（1 级不标） */
  level?: number;
  /** 名字后面的灰色小标签（食谱的推荐等级） */
  tag?: string;
  sub: string;
  rare?: boolean;
}
/** 筛选前的全部行（只看名字搜索） */
const all = computed<Row[]>(() => {
  const k = kind.value;
  if (k === 'goods')
    return goods.value
      .filter((g) => filter.value === null || g.type === filter.value)
      .map((g) => ({
        id: g.id,
        name: g.name,
        art: catalog.goodsArt(g.id),
        level: g.level,
        sub: [
          w.value.goodsTypes[String(g.type)] ?? '',
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
        art: catalog.foodArt(f.id),
        level: f.level,
        sub: f.type === null ? '' : (w.value.foodTypes[String(f.type)] ?? ''),
        rare: f.rare,
      }));
  if (k === 'cookbooks') {
    const band = filter.value === null ? null : LEVEL_BANDS[filter.value]!;
    return cookbooks.value
      .filter((c) => street.value === null || c.streetId === street.value)
      .filter((c) => !band || (c.level >= band[0] && c.level <= band[1]))
      .map((c) => ({
        id: c.id,
        name: c.name,
        art: c.mainFoodId ? catalog.foodArt(c.mainFoodId) : 'food-misc',
        tag: w.value.fields.recommend(c.level),
        sub: [streetName.value.get(c.streetId) ?? '', `${w.value.fields.price} ${formatNum(c.coin)}`]
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
        art: PART_ART[e.part] ?? 'wiki-equips',
        // 没有等级门槛时不写“0 级可以穿”（backlog #115）
        sub: [
          PART_NAMES[e.part] ?? '',
          suitName.value.get(e.suitId) ?? '',
          e.minLevel > 0 ? w.value.fields.minLevel(e.minLevel) : '',
          `+10 ${e.maxTotal}`,
        ]
          .filter(Boolean)
          .join(' · '),
      }));
  if (k === 'streets')
    return streets.value.map((s) => ({
      id: s.id,
      name: s.name,
      art: 'wiki-streets' as const,
      sub: [s.cookName, w.value.fields.cookbookCount(s.cookbookCount), s.focus ? STREET_FOCUS[s.focus] : '']
        .filter(Boolean)
        .join(' · '),
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
/** 食谱的街道：整宽胶囊，点开从底部弹出街道单选面板 */
const streetSheet = ref(false);
function pickStreet(id: number | null) {
  street.value = id;
  streetSheet.value = false;
}
</script>

<template>
  <div>
    <div v-if="!kind" class="dt-empty" data-testid="wiki-error">{{ t.wiki.notFound }}</div>
    <template v-else>
      <label class="dt-search-box dt-wiki-search">
        <i class="bi bi-search" aria-hidden="true"></i>
        <input
          v-model="q"
          type="search"
          :placeholder="t.wiki.searchKind(t.wiki.kinds[kind])"
          :aria-label="t.wiki.search"
          data-testid="wiki-q"
        />
      </label>
      <button
        v-if="kind === 'cookbooks'"
        type="button"
        class="dt-wide-select"
        :aria-label="t.wiki.kinds.streets"
        data-testid="wiki-street"
        @click="streetSheet = true"
      >
        <span>{{ street === null ? t.wiki.allStreets : (streetName.get(street) ?? t.wiki.allStreets) }}</span
        ><i class="bi bi-chevron-down" aria-hidden="true"></i>
      </button>
      <div v-if="pills.length > 0" class="dt-pills dt-wiki-pills">
        <button
          type="button"
          :class="{ active: filter === null }"
          :aria-pressed="filter === null"
          data-testid="wiki-filter-all"
          @click="filter = null"
        >
          {{ t.wiki.all }}
        </button>
        <button
          v-for="p in pills"
          :key="p.value"
          type="button"
          :class="{ active: filter === p.value }"
          :aria-pressed="filter === p.value"
          :data-testid="`wiki-filter-${p.value}`"
          @click="filter = p.value"
        >
          {{ p.label }}
        </button>
        <button
          v-if="kind === 'foods'"
          type="button"
          :class="{ active: rareOnly }"
          :aria-pressed="rareOnly"
          data-testid="wiki-rare"
          @click="rareOnly = !rareOnly"
        >
          {{ t.wiki.rareOnly }}
        </button>
      </div>
      <div class="dt-wiki-count dt-meta">{{ t.wiki.count(matched.length) }}</div>
      <div v-if="error" class="dt-empty" data-testid="wiki-error">{{ t.wiki.loadFailed }}</div>
      <template v-else-if="loaded">
        <div v-if="visible.length > 0" class="dt-card dt-rows-card">
          <WikiRow
            v-for="r in visible"
            :key="r.id"
            :to="wikiPath(kind, r.id)"
            :art="r.art"
            :name="r.name"
            :level="r.level"
            :tag="r.tag"
            :testid="`wiki-row-${r.id}`"
          >
            <template #sub
              >{{ r.sub
              }}<template v-if="r.rare"
                >{{ r.sub ? ' · ' : '' }}<span class="dt-ink-warn">{{ t.wiki.rare }}</span></template
              ></template
            >
          </WikiRow>
        </div>
        <div v-if="matched.length === 0" class="dt-empty" data-testid="wiki-empty">{{ t.wiki.noResult }}</div>
        <!-- 显示条数最多 MAX_SHOWN（地址里恢复也按它）：到了就不再给“再显示”，改写怎么缩小范围（backlog 第 ⑧ 批审查） -->
        <button
          v-if="visible.length < matched.length && shown < MAX_SHOWN"
          type="button"
          class="btn btn-light dt-btn-block mt-2"
          data-testid="wiki-more"
          @click="more = { key: filterKey, n: Math.min(shown + PAGE, MAX_SHOWN) }"
        >
          {{ t.wiki.more(Math.min(PAGE, matched.length - visible.length, MAX_SHOWN - shown)) }}
        </button>
        <div
          v-else-if="visible.length < matched.length"
          class="dt-meta mt-2 text-center"
          data-testid="wiki-max"
        >
          {{ t.wiki.maxShown(formatNum(MAX_SHOWN)) }}
        </div>
      </template>
      <DtSheet :open="streetSheet" :title="t.wiki.kinds.streets" @close="streetSheet = false">
        <div class="dt-card dt-rows-card" role="radiogroup" :aria-label="t.wiki.kinds.streets">
          <PickRow
            :on="street === null"
            :title="t.wiki.allStreets"
            testid="wiki-street-all"
            @pick="pickStreet(null)"
          />
          <PickRow
            v-for="s in streets"
            :key="s.id"
            :on="street === s.id"
            :title="s.name"
            :sub="s.cookName"
            :testid="`wiki-street-${s.id}`"
            @pick="pickStreet(s.id)"
          />
        </div>
      </DtSheet>
    </template>
  </div>
</template>
