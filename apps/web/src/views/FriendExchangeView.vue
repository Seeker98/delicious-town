<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { ExchangeFoodsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { matchText } from '../utils/match';
import DtArt from '../components/DtArt.vue';
import FoodArt from '../components/FoodArt.vue';

const route = useRoute();
const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
const restId = computed(() => Number(route.params.restId));
const level = ref(1);
const data = ref<ExchangeFoodsDto | null>(null);
const take = ref<number | null>(null);
const give = ref<number | null>(null);
const busy = ref(false);
/** 格子底色按等级（和橱柜一致）：2 级绿、3 级以上紫 */
const tier = computed(() => (level.value >= 3 ? 'is-t3' : level.value === 2 ? 'is-t2' : ''));
const fee = computed(() => data.value?.theirs.find((x) => x.foodsId === take.value)?.fee ?? 0);
/** 和这家还能换几次：我自己的剩余和对方还能被换的取小（问题记录 479） */
const canSwap = computed(() => Math.min(data.value?.left ?? 0, data.value?.takenLeft ?? Infinity) > 0);
/**
 * 对方的食材按名字筛（backlog 370：蟹老板的橱柜一级有八九十种；不区分大小写、忽略重音）；
 * 我学菜缺的排前面、缺得多的在前，锁着换不了的排最后。我的那一栏不筛，选好要的再挑给出的
 */
const q = ref('');
const takeable = (f: { locked: boolean }) => !f.locked || (data.value?.storm ?? false);
const theirs = computed(() =>
  (data.value?.theirs ?? [])
    .filter((f) => matchText(catalog.foodName(f.foodsId), q.value.trim()))
    .sort((a, b) => Number(takeable(b)) - Number(takeable(a)) || b.need - a.need || a.foodsId - b.foodsId),
);
// 选中的被搜索筛掉时取消选择，免得确认时换的是看不见的那个
watch(theirs, (list) => {
  if (take.value !== null && !list.some((f) => f.foodsId === take.value)) take.value = null;
});

async function load() {
  take.value = null;
  give.value = null;
  try {
    data.value = await endpoints.exchangeFoods(restId.value, level.value);
  } catch (e) {
    toast.push(errorMessage(e, t.value.friends.exchange.loadFailed), 'danger');
  }
}

async function confirm() {
  if (busy.value || take.value === null || give.value === null) return;
  busy.value = true;
  try {
    const r = await endpoints.exchange({
      restId: restId.value,
      giveFoodsId: give.value,
      takeFoodsId: take.value,
    });
    if (r.result === 'caught') toast.push(t.value.friends.exchange.caught, 'danger');
    else
      toast.push(
        r.redPantsFoodsId !== null
          ? t.value.friends.exchange.redPants(catalog.foodName(r.redPantsFoodsId))
          : t.value.friends.exchange.done,
      );
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.friends.exchange.failed), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <!-- 换食材（界面改版 P10）：上面一张卡写规则和今天还能换几次；等级胶囊；先在“要它的”格子里选一种，再在“我给出”里选一种；底部吸住一条写清换什么 -->
  <div class="dt-card dt-bar-info" data-testid="exchange-info">
    <span class="dt-bar-info-art"><DtArt name="food-master" :size="30" /></span>
    <span class="dt-bar-info-main">
      <b>{{ t.friends.exchange.title }}</b>
      <span>{{ t.friends.exchange.rule }}</span>
      <span v-if="data" data-testid="exchange-left"
        >{{ t.friends.exchange.left(data.left)
        }}<template v-if="!data.npc">{{ t.common.paren(t.friends.exchange.allFriends) }}</template
        ><template v-if="data.takenLeft === 0">{{ t.friends.exchange.takenFull }}</template
        ><template v-else-if="data.takenLeft !== null && data.takenLeft < data.left">{{
          t.friends.exchange.takenLeft(data.takenLeft)
        }}</template></span
      >
    </span>
  </div>
  <p v-if="data?.storm" class="dt-block-note text-warning-emphasis">{{ t.friends.exchange.stormNote }}</p>
  <div class="dt-pills" role="group" :aria-label="t.friends.exchange.levelLabel">
    <button
      v-for="l in 5"
      :key="l"
      type="button"
      :class="{ active: l === level }"
      :aria-pressed="l === level"
      :data-testid="`exchange-level-${l}`"
      @click="
        level = l;
        load();
      "
    >
      {{ t.friends.exchange.level(l) }}
    </button>
  </div>
  <template v-if="data">
    <label class="dt-search-box">
      <i class="bi bi-search" aria-hidden="true"></i>
      <input
        v-model="q"
        type="search"
        :placeholder="t.friends.exchange.search"
        :aria-label="t.friends.exchange.search"
        data-testid="exchange-search"
      />
    </label>
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.friends.exchange.theirs }}</h2>
      <span class="dt-block-more">{{ t.friends.exchange.lockedNote }}</span>
    </div>
    <div v-if="theirs.length === 0" class="dt-card dt-up-max">
      {{ q.trim() === '' ? t.friends.exchange.theirsEmpty : t.friends.exchange.noMatch }}
    </div>
    <div v-else class="dt-bag" role="group" :aria-label="t.friends.exchange.theirs">
      <button
        v-for="f in theirs"
        :key="f.foodsId"
        type="button"
        :class="['dt-bag-cell', tier]"
        :aria-pressed="take === f.foodsId"
        :disabled="!takeable(f)"
        :data-testid="`theirs-${f.foodsId}`"
        @click="take = f.foodsId"
      >
        <span class="dt-bag-num" aria-hidden="true">{{ f.num }}</span>
        <i v-if="f.locked" class="bi bi-lock-fill dt-bag-lock" :aria-label="t.friends.exchange.locked"></i>
        <FoodArt :id="f.foodsId" :size="40" />
        <span class="dt-bag-name">{{ catalog.foodName(f.foodsId) }}</span>
        <span v-if="f.need > 0" class="dt-tag dt-tag-warn">{{ t.friends.exchange.need(f.need) }}</span>
      </button>
    </div>
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.friends.exchange.mine }}</h2>
      <span class="dt-block-more">{{ t.friends.exchange.oneLeftNote }}</span>
    </div>
    <div v-if="data.mine.length === 0" class="dt-card dt-up-max">{{ t.friends.exchange.mineEmpty }}</div>
    <div v-else class="dt-bag" role="group" :aria-label="t.friends.exchange.mine">
      <button
        v-for="f in data.mine"
        :key="f.foodsId"
        type="button"
        :class="['dt-bag-cell', tier]"
        :aria-pressed="give === f.foodsId"
        :disabled="f.num < 2"
        :data-testid="`mine-${f.foodsId}`"
        @click="give = f.foodsId"
      >
        <span class="dt-bag-num" aria-hidden="true">{{ f.num }}</span>
        <FoodArt :id="f.foodsId" :size="40" />
        <span class="dt-bag-name">{{ catalog.foodName(f.foodsId) }}</span>
      </button>
    </div>
    <div class="dt-sticky-bar" data-testid="exchange-bar">
      <span class="dt-sticky-bar-main">
        <b v-if="take !== null && give !== null" data-testid="exchange-summary"
          >{{ t.common.qty(catalog.foodName(give), 2) }}
          <i class="bi bi-arrow-left-right" aria-hidden="true"></i
          ><span class="visually-hidden">{{ t.friends.exchange.forLabel }}</span>
          {{ t.common.qty(catalog.foodName(take), 1) }}</b
        >
        <b v-else>{{ take === null ? t.friends.exchange.pickTheirs : t.friends.exchange.pickMine }}</b>
        <span v-if="fee > 0">{{ t.friends.exchange.feeLine(fee) }}</span>
      </span>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="confirm"
        :disabled="busy || take === null || give === null || !canSwap"
        @click="confirm"
      >
        {{ t.friends.exchange.btn }}
      </button>
    </div>
  </template>
</template>
