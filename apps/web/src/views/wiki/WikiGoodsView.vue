<script setup lang="ts">
import { computed, ref, onBeforeUnmount, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { OpenGiftItem, OpenGoodsDto, OpenSuitDto } from '@dt/shared';
import WikiExchangeRule from '../../components/wiki/WikiExchangeRule.vue';
import { useT } from '../../composables/useT';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { ATTR_KEYS, ATTR_NAMES, PART_NAMES } from '../../utils/labels';
import { isNotFound, listBack, useWikiData } from './wiki';

/** 道具详情（厨具也用这一页，问题记录 142） */
const route = useRoute();
const router = useRouter();
const t = useT();
const data = useWikiData();
const g = ref<OpenGoodsDto | null>(null);
const error = ref<'' | 'missing' | 'failed'>('');
const toast = useToastStore();
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
    g.value.sources.exchange.length === 0,
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
</script>

<template>
  <div>
    <RouterLink
      :to="listBack(g?.equip ? '/wiki/equips' : '/wiki/goods', router.options.history.state.back)"
      class="small"
      >{{ t.wiki.back }}</RouterLink
    >
    <div v-if="error" class="dt-empty" data-testid="wiki-error">
      {{ error === 'missing' ? t.wiki.notFound : t.wiki.loadFailed }}
    </div>
    <template v-else-if="g">
      <h5 class="dt-page-title mt-2">
        {{ g.name }} <span class="dt-tag">{{ w.goodsTypes[String(g.type)] }}</span>
      </h5>
      <p v-if="g.desc" class="small mb-2">{{ g.desc }}</p>
      <dl class="dt-kv small">
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
        <h6 class="dt-section">{{ w.sections.equip }}</h6>
        <dl class="dt-kv small" data-testid="wiki-equip">
          <dt>{{ w.fields.part }}</dt>
          <dd>
            {{ PART_NAMES[g.equip.part]
            }}<template v-if="g.equip.minLevel > 0"> · {{ w.fields.minLevel(g.equip.minLevel) }}</template>
          </dd>
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
        <template v-if="suit && suit.tiers.length > 0">
          <h6 class="dt-section">{{ w.sections.suit }}</h6>
          <dl class="dt-kv small" data-testid="wiki-suit">
            <template v-for="x in suit.tiers" :key="x.need">
              <dt>{{ w.fields.suitTier(x.need) }}</dt>
              <dd>{{ x.desc }}</dd>
            </template>
          </dl>
        </template>
        <h6 class="dt-section">{{ w.sections.stress }}</h6>
        <div class="table-responsive" data-testid="wiki-stress">
          <table class="table table-sm small mb-0 text-center">
            <tbody>
              <tr>
                <td v-for="(_, i) in g.equip.stressTable" :key="i" class="text-muted">
                  {{ w.fields.stressLevel(i) }}
                </td>
              </tr>
              <tr>
                <td v-for="(v, i) in g.equip.stressTable" :key="i">{{ v }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template v-if="g.gem">
        <h6 class="dt-section">{{ w.sections.gem }}</h6>
        <dl class="dt-kv small" data-testid="wiki-gem">
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
        <h6 class="dt-section">{{ w.sections.gift }}</h6>
        <ul class="small mb-1 ps-3" data-testid="wiki-gift">
          <li v-for="(i, n) in g.gift" :key="n">
            <template v-if="i.kind === 'goods'">
              <RouterLink :to="`/wiki/goods/${i.id}`">{{ i.name }}</RouterLink> ×{{ i.num }}
            </template>
            <template v-else-if="i.kind === 'foods'">
              <RouterLink :to="`/wiki/foods/${i.id}`">{{ i.name }}</RouterLink> ×{{ i.num }}
            </template>
            <template v-else>{{ giftText(i) }}</template>
          </li>
          <li class="list-unstyled dt-meta">{{ w.gift.note }}</li>
        </ul>
      </template>

      <h6 class="dt-section">{{ w.sections.sources }}</h6>
      <ul class="small mb-1 ps-3" data-testid="wiki-sources">
        <li v-if="g.sources.shop">{{ w.sources.shop }}{{ shopPrice }}</li>
        <li v-if="g.sources.renownShop">
          {{ w.sources.renownShop(formatNum(g.sources.renownShop.renown), g.sources.renownShop.rotating) }}
        </li>
        <li v-for="(r, n) in g.sources.exchange" :key="`x${n}`">
          {{ w.sources.exchange }}<WikiExchangeRule :rule="r" />
        </li>
        <li v-if="noSource" class="list-unstyled text-muted">{{ w.sources.none }}</li>
      </ul>

      <template v-if="g.usedIn.length > 0">
        <h6 class="dt-section">{{ w.sections.usedIn }}</h6>
        <ul class="small mb-1 ps-3" data-testid="wiki-used-in">
          <li v-for="(r, n) in g.usedIn" :key="n"><WikiExchangeRule :rule="r" /></li>
        </ul>
      </template>
    </template>
  </div>
</template>
