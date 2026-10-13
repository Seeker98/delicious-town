<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { UiArtName } from '../art/generated/names';
import DtArt from '../components/DtArt.vue';
import { useT } from '../composables/useT';
import type { Messages } from '../i18n';
import { useRestaurantStore } from '../stores/restaurant';

/** 小镇（界面改版设计 §4.1）：取代“更多”，按地方分三组；副标题是固定说明 */
type PlaceKey = keyof Messages['nav']['map']['places'];
interface Place {
  key: PlaceKey;
  to: string;
  art: UiArtName;
  /** 所属的区服功能；关掉时不显示（问题记录 248）。几个功能时全关才不显示 */
  feature?: string | string[];
}
const GROUPS: Array<{ key: keyof Messages['nav']['map']['groups']; places: Place[] }> = [
  {
    key: 'trade',
    places: [
      { key: 'shop', to: '/shop', art: 'place-shop', feature: 'shop' },
      { key: 'exchange', to: '/exchange', art: 'place-exchange', feature: 'exchange' },
      { key: 'acquire', to: '/acquire', art: 'place-acquire', feature: 'acquire' },
      // 盖乐瑞的基金、理财（界面改版 P2b：原来在协会）
      { key: 'bank', to: '/bank', art: 'place-bank', feature: ['fund', 'wealth'] },
      { key: 'kuji', to: '/kuji', art: 'place-kuji', feature: 'kuji' },
      // 事件预测关掉后入口保留：页面只能查看持仓和结算结果（backlog 238-1）
      { key: 'predict', to: '/predict', art: 'place-predict' },
      { key: 'takeaway', to: '/takeaway', art: 'place-takeaway', feature: 'takeaway' },
    ],
  },
  {
    key: 'play',
    places: [
      { key: 'bar', to: '/bar', art: 'place-bar', feature: 'bar' },
      { key: 'temple', to: '/temple', art: 'place-temple', feature: 'temple' },
      { key: 'tower', to: '/tower', art: 'place-tower', feature: 'tower' },
    ],
  },
  {
    key: 'public',
    places: [
      { key: 'society', to: '/society', art: 'place-society' },
      { key: 'town', to: '/town', art: 'place-plaza', feature: 'town' },
      { key: 'forum', to: '/forum', art: 'place-forum', feature: 'forum' },
      { key: 'activities', to: '/activities', art: 'place-activities', feature: 'activity' },
    ],
  },
];
const t = useT();
const restStore = useRestaurantStore();
const groups = computed(() =>
  GROUPS.map((g) => ({
    ...g,
    places: g.places.filter((p) => !p.feature || [p.feature].flat().some((f) => restStore.featureOn(f))),
  })).filter((g) => g.places.length > 0),
);
</script>

<template>
  <section v-for="g in groups" :key="g.key">
    <h2 class="dt-section">{{ t.nav.map.groups[g.key] }}</h2>
    <div class="dt-place-grid">
      <RouterLink
        v-for="p in g.places"
        :key="p.key"
        :to="p.to"
        class="dt-place dt-tap"
        :data-testid="`place-${p.key}`"
      >
        <span class="dt-place-icon"><DtArt :name="p.art" :size="26" /></span>
        <span class="dt-place-name">{{ t.nav.map.places[p.key].name }}</span>
        <span class="dt-place-sub">{{ t.nav.map.places[p.key].sub }}</span>
      </RouterLink>
    </div>
  </section>
</template>
