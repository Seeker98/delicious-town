<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { RankDto, RenownShopDto, TowerDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import towerScene from '../art/scene/tower.svg?url';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtTabs from '../components/DtTabs.vue';
import PlaceScene from '../components/place/PlaceScene.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import FloorPanel from '../components/tower/FloorPanel.vue';
import RankPanel from '../components/tower/RankPanel.vue';
import ShopPanel from '../components/tower/ShopPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

/**
 * 厨塔（界面改版 P9）：120px 头图叠我的厨力、赛厨榜名次、声望；下面挑战、赛厨榜、声望商店三个标签。
 * 头图要三样数据，进页面一起读，各标签用同一份
 */
type Tab = 'tower' | 'rank' | 'shop';
const TABS: readonly Tab[] = ['tower', 'rank', 'shop'];
const KEY = 'dt_tower_tab';
const toast = useToastStore();
const t = useT();
/** 当前标签写进网址、记住上次看的（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: TABS, storageKey: KEY });
const tabItems = computed(() => TABS.map((k) => ({ key: k, label: t.value.tower.tabs[k] })));
const data = ref<TowerDto | null>(null);
const rank = ref<RankDto | null>(null);
const shop = ref<RenownShopDto | null>(null);
/** 哪份数据读失败了：那个标签显示失败和重试（P9 终审 I5） */
const failed = ref<Record<Tab, boolean>>({ tower: false, rank: false, shop: false });

/** 读一份数据；只有当前标签的那份失败才弹提示（进页面时三份一起读，别一下弹三条） */
async function fetchOne<T>(k: Tab, fn: () => Promise<T>, set: (v: T) => void, msg: string) {
  try {
    set(await fn());
    failed.value[k] = false;
  } catch (e) {
    failed.value[k] = true;
    if (tab.value === k) toast.push(errorMessage(e, msg), 'danger');
  }
}
const loadTower = () => fetchOne('tower', endpoints.tower, (v) => (data.value = v), t.value.tower.loadFailed);
const loadRank = () =>
  fetchOne('rank', endpoints.towerRank, (v) => (rank.value = v), t.value.tower.rank.loadFailed);
const loadShop = () =>
  fetchOne('shop', endpoints.renownShop, (v) => (shop.value = v), t.value.tower.shop.loadFailed);
const LOAD: Record<Tab, () => Promise<void>> = { tower: loadTower, rank: loadRank, shop: loadShop };
/** 挑战、占位、兑换都会改头图上的数字（厨力不变、名次和声望会变）：三样一起重读 */
const loadAll = () => Promise.all([loadTower(), loadRank(), loadShop()]).then(() => undefined);
onMounted(loadAll);
/** 切标签重读这一页的数据：赛厨榜是抢位的，切回来要看到最新的榜（P9 终审 I5） */
watch(tab, (k) => void LOAD[k]());
</script>

<template>
  <PlaceScene :src="towerScene" place="tower">
    <span v-if="data" class="dt-place-chip" data-testid="tower-power"
      >{{ t.tower.chips.power }} <b>{{ formatNum(data.power) }}</b></span
    >
    <span v-if="rank" class="dt-place-chip" data-testid="tower-rank"
      >{{ t.tower.chips.rank }}
      <b>{{ rank.myRank === null ? t.tower.rank.unranked : t.tower.rank.rankN(rank.myRank) }}</b></span
    >
    <span v-if="shop" class="dt-place-chip" data-testid="tower-renown"
      ><DtArt name="res-prestige" :size="18" />{{ t.tower.chips.renown }}
      <b>{{ formatNum(shop.renown) }}</b></span
    >
  </PlaceScene>
  <DtTabs v-model="tab" :tabs="tabItems" />
  <template v-if="tab === 'tower'">
    <FloorPanel v-if="data" :data="data" @reload="loadAll" />
    <DtEmpty v-else-if="failed.tower" :title="t.tower.loadFailed" data-testid="tower-failed"
      ><button type="button" class="btn btn-sm btn-outline-primary" @click="loadTower">
        {{ t.town.retry }}
      </button></DtEmpty
    >
    <DtSkeleton v-else :rows="6" />
  </template>
  <template v-else-if="tab === 'rank'">
    <RankPanel v-if="rank" :data="rank" :reload="loadAll" @reload="loadAll" />
    <DtEmpty v-else-if="failed.rank" :title="t.tower.rank.loadFailed" data-testid="rank-failed"
      ><button type="button" class="btn btn-sm btn-outline-primary" @click="loadRank">
        {{ t.town.retry }}
      </button></DtEmpty
    >
    <DtSkeleton v-else :rows="6" />
  </template>
  <template v-else>
    <ShopPanel v-if="shop" :data="shop" @reload="loadShop" />
    <DtEmpty v-else-if="failed.shop" :title="t.tower.shop.loadFailed" data-testid="shop-failed"
      ><button type="button" class="btn btn-sm btn-outline-primary" @click="loadShop">
        {{ t.town.retry }}
      </button></DtEmpty
    >
    <DtSkeleton v-else :rows="5" />
  </template>
</template>
