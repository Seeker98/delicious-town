<script setup lang="ts">
import { computed, ref, onBeforeUnmount, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { OpenGiftItem, OpenGoodsDto, OpenSuitDto } from '@dt/shared';
import type { ArtName } from '../../art/generated/names';
import DtArt from '../../components/DtArt.vue';
import WikiEntry from '../../components/wiki/WikiEntry.vue';
import WikiExchangeRule from '../../components/wiki/WikiExchangeRule.vue';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { usePageTitle } from '../../stores/pageTitle';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { ATTR_KEYS, ATTR_NAMES, PART_NAMES } from '../../utils/labels';
import { isNotFound, PART_ART, useWikiData } from './wiki';

/**
 * 道具词条（厨具也用这一页，问题记录 142；界面改版 P11 报刊风）：厨具的大图用部位图标；
 * 礼包多一节“礼包内容”（一行一样，带图和数量），宝石多一节“宝石属性”和下一阶链接
 */
const route = useRoute();
const router = useRouter();
const t = useT();
const data = useWikiData();
const g = ref<OpenGoodsDto | null>(null);
const error = ref<'' | 'missing' | 'failed'>('');
const toast = useToastStore();
const catalog = useCatalogStore();
/** 套装效果（从厨具列表取，backlog #115）、宝石下一阶的名字（从道具列表取） */
const suit = ref<OpenSuitDto | null>(null);

/** 读取序号：先打开 A 再打开 B，A 晚到的结果不盖掉 B（backlog #115） */
let seq = 0;
// 离开页面后，旧请求的结果和失败提示都不要了（质量期 ①b 终审）
onBeforeUnmount(() => seq++);
watch(
  () => Number(route.params.id),
  async (id) => {
    const mine = ++seq;
    g.value = null;
    error.value = '';
    suit.value = null;
    try {
      const v = await data.goodsDetail(id);
      if (mine !== seq) return;
      g.value = v;
      // 旧链接（重新编号前的编号）：接口已跳到新编号，地址栏也换成新的（设计 §5）
      if (v.id !== id) void router.replace(`/wiki/goods/${v.id}`);
    } catch (e) {
      if (mine !== seq) return;
      error.value = isNotFound(e) ? 'missing' : 'failed';
      if (error.value === 'failed') toast.push(t.value.wiki.loadFailed, 'danger');
      return;
    }
    // 套装效果是补充信息：读不到就不显示，不算页面读失败
    try {
      const v = g.value;
      if (v.equip && v.equip.suitId > 0) {
        const s = (await data.equips()).suits.find((x) => x.id === v.equip!.suitId) ?? null;
        if (mine !== seq) return;
        suit.value = s;
      }
    } catch {
      // 忽略
    }
  },
  { immediate: true },
);

const w = computed(() => t.value.wiki);
/** 顶栏标题是道具名；类型标签放在第一行（界面改版 P2a） */
usePageTitle(() => g.value?.name);
/** 基础属性：只列不为 0 的，范围写 a~b */
const attrs = computed(() => {
  const r = g.value?.equip?.ranges ?? {};
  return ATTR_KEYS.flatMap((k) => {
    const v = r[k];
    if (v === undefined || v === 0) return [];
    return [`${ATTR_NAMES[k]} ${Array.isArray(v) ? `${v[0]}~${v[1]}` : v}`];
  });
});
const gemAttrs = computed(() =>
  ATTR_KEYS.flatMap((k) => {
    const v = g.value?.gem?.attrs[k] ?? 0;
    return v === 0 ? [] : [`${ATTR_NAMES[k]} +${v}`];
  }),
);
/** 礼包里不带链接的项（随机道具、食材、银币等）的文字 */
function giftText(i: OpenGiftItem): string {
  switch (i.kind) {
    case 'randomGoods':
      return w.value.gift.randomGoods(i.level, i.num);
    case 'randomFoods':
      return w.value.gift.randomFoods(i.level, i.num);
    case 'masterFoods':
      return w.value.gift.masterFoods(i.num);
    case 'renown':
      return w.value.renown(formatNum(i.num));
    case 'coin':
    case 'exp':
    case 'diamond': {
      return w.value.gift.range(formatNum(i.min), formatNum(i.max), w.value.units[i.kind]);
    }
    default:
      return '';
  }
}
const noSource = computed(
  () =>
    g.value !== null &&
    !g.value.sources.shop &&
    !g.value.sources.renownShop &&
    g.value.sources.exchange.length === 0 &&
    !g.value.sources.special &&
    g.value.sources.black == null &&
    !g.value.sources.award &&
    !g.value.sources.gemFrom,
);
const shopPrice = computed(() => {
  const s = g.value?.sources.shop;
  if (!s) return '';
  return [
    s.coin > 0 ? w.value.coin(formatNum(s.coin)) : '',
    s.diamond > 0 ? w.value.diamond(formatNum(s.diamond)) : '',
  ]
    .filter(Boolean)
    .join(' / ');
});
/** 第一行分类：厨具写部位、等级、几级能穿；别的道具写类型和等级 */
const kick = computed(() => {
  const v = g.value;
  if (!v) return '';
  if (v.equip)
    return [
      w.value.kinds.equips,
      PART_NAMES[v.equip.part] ?? '',
      w.value.level(v.level),
      v.equip.minLevel > 0 ? w.value.fields.minLevel(v.equip.minLevel) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  return [w.value.kinds.goods, w.value.goodsTypes[String(v.type)] ?? '', w.value.level(v.level)]
    .filter(Boolean)
    .join(' · ');
});
/** 礼包里不带链接的项的图 */
function giftArt(i: OpenGiftItem): ArtName {
  switch (i.kind) {
    case 'coin':
      return 'res-coin-silver';
    case 'exp':
      return 'res-exp';
    case 'diamond':
      return 'res-diamond';
    case 'renown':
      return 'res-prestige';
    case 'masterFoods':
      return 'food-master';
    case 'randomFoods':
      return 'food-misc';
    default:
      return 'goods-gift';
  }
}
</script>

<template>
  <div>
    <div v-if="error" class="dt-empty" data-testid="wiki-error">
      {{ error === 'missing' ? t.wiki.notFound : t.wiki.loadFailed }}
    </div>
    <WikiEntry
      v-else-if="g"
      :art="g.equip ? (PART_ART[g.equip.part] ?? 'wiki-equips') : catalog.goodsArt(g.id)"
      :name="g.name"
      :kick="kick"
    >
      <p v-if="g.desc" class="dt-entry-desc">{{ g.desc }}</p>
      <dl v-if="!g.equip" class="dt-entry-dl">
        <dt>{{ w.fields.level }}</dt>
        <dd>{{ w.level(g.level) }}</dd>
        <dt>{{ w.fields.type }}</dt>
        <dd>
          {{ w.goodsTypes[String(g.type)] }}
          <span v-if="g.stackable">· {{ w.fields.stackable }}</span>
          <span v-if="g.stackable">· {{ w.fields.maxNum(g.maxNum) }}</span>
          <span v-if="g.invalidHours">· {{ w.fields.invalidHours(g.invalidHours) }}</span>
        </dd>
        <template v-if="g.needStar > 0">
          <dt>{{ w.fields.star }}</dt>
          <dd data-testid="wiki-need-star">{{ w.fields.needStar(g.needStar) }}</dd>
        </template>
      </dl>

      <template v-if="g.equip">
        <h3 class="dt-entry-h">{{ w.sections.equip }}</h3>
        <dl class="dt-entry-dl" data-testid="wiki-equip">
          <dt>{{ w.fields.suit }}</dt>
          <dd>{{ g.equip.suitName ?? w.fields.noSuit }}</dd>
          <dt>{{ w.fields.baseAttrs }}</dt>
          <dd>{{ attrs.join(' · ') }}</dd>
          <dt>{{ w.fields.enhance }}</dt>
          <dd>{{ w.fields.essence(g.equip.essence) }}</dd>
          <template v-if="g.equip.maxHole > 0">
            <dt>{{ w.fields.sockets }}</dt>
            <dd>{{ w.fields.holes(g.equip.hole, g.equip.maxHole) }}</dd>
          </template>
        </dl>
        <h3 class="dt-entry-h">{{ w.sections.stress }}</h3>
        <div class="dt-entry-table" data-testid="wiki-stress">
          <table>
            <tbody>
              <tr>
                <td v-for="(_, i) in g.equip.stressTable" :key="i" class="is-head">
                  {{ w.fields.stressLevel(i) }}
                </td>
              </tr>
              <tr>
                <td v-for="(v, i) in g.equip.stressTable" :key="i">{{ v }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <template v-if="suit && suit.tiers.length > 0">
          <h3 class="dt-entry-h">
            {{ w.sections.suit }}<small>{{ w.fields.suitOf(suit.name, suit.maxNum) }}</small>
          </h3>
          <dl class="dt-entry-dl" data-testid="wiki-suit">
            <template v-for="x in suit.tiers" :key="x.need">
              <dt>{{ w.fields.suitTier(x.need) }}</dt>
              <dd>{{ x.desc }}</dd>
            </template>
          </dl>
        </template>
      </template>

      <template v-if="g.gem">
        <h3 class="dt-entry-h">{{ w.sections.gem }}</h3>
        <dl class="dt-entry-dl" data-testid="wiki-gem">
          <dt>{{ w.fields.level }}</dt>
          <dd>{{ w.fields.gemLevel(g.gem.level) }} · {{ gemAttrs.join(' · ') }}</dd>
          <template v-if="g.gem.nextId !== null">
            <dt>{{ w.fields.nextGem }}</dt>
            <dd>
              <RouterLink :to="`/wiki/goods/${g.gem.nextId}`">{{
                g.gem.nextName ?? w.fields.nextGem
              }}</RouterLink>
            </dd>
          </template>
        </dl>
      </template>

      <template v-if="g.gift && g.gift.length > 0">
        <h3 class="dt-entry-h">{{ w.sections.gift }}</h3>
        <div data-testid="wiki-gift">
          <template v-for="(i, n) in g.gift" :key="n">
            <RouterLink
              v-if="i.kind === 'goods' || i.kind === 'foods'"
              :to="`/wiki/${i.kind}/${i.id}`"
              class="dt-entry-row"
            >
              <DtArt :name="i.kind === 'goods' ? catalog.goodsArt(i.id) : catalog.foodArt(i.id)" :size="28" />
              <span class="dt-row-main"
                ><span class="dt-row-title">{{ i.name }}{{ t.common.times }}{{ i.num }}</span></span
              >
            </RouterLink>
            <div v-else class="dt-entry-row is-static">
              <DtArt :name="giftArt(i)" :size="28" />
              <span class="dt-row-main"
                ><span class="dt-row-title">{{ giftText(i) }}</span></span
              >
            </div>
          </template>
          <p class="dt-entry-note">{{ w.gift.note }}</p>
        </div>
      </template>

      <h3 class="dt-entry-h">{{ w.sections.sources }}</h3>
      <ul class="dt-entry-list" data-testid="wiki-sources">
        <li v-if="g.sources.shop">{{ w.sources.shop }}{{ shopPrice }}</li>
        <li v-if="g.sources.renownShop">
          {{ w.sources.renownShop(formatNum(g.sources.renownShop.renown), g.sources.renownShop.rotating) }}
        </li>
        <!-- 今日特价、钻石黑市、随机奖励、宝石升阶（视觉第三轮：原来只写商店） -->
        <li v-if="g.sources.special">{{ w.sources.special }}</li>
        <li v-if="g.sources.black != null">{{ w.sources.black(formatNum(g.sources.black)) }}</li>
        <li v-if="g.sources.award">{{ w.sources.award }}</li>
        <li v-if="g.sources.gemFrom">
          {{ w.sources.gemFromBefore
          }}<RouterLink :to="`/wiki/goods/${g.sources.gemFrom.id}`">{{ g.sources.gemFrom.name }}</RouterLink
          >{{ w.sources.gemFromAfter }}
        </li>
        <li v-for="(r, n) in g.sources.exchange" :key="`x${n}`">
          {{ w.sources.exchange }}<WikiExchangeRule :rule="r" />
        </li>
        <li v-if="noSource" class="is-none">{{ w.sources.none }}</li>
      </ul>

      <template v-if="g.usedIn.length > 0">
        <h3 class="dt-entry-h">{{ w.sections.usedIn }}</h3>
        <ul class="dt-entry-list" data-testid="wiki-used-in">
          <li v-for="(r, n) in g.usedIn" :key="n"><WikiExchangeRule :rule="r" /></li>
        </ul>
      </template>
    </WikiEntry>
  </div>
</template>
