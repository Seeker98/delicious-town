<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { TownDto, TownRewardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { effectChips } from '../../utils/effects';
import { formatNum } from '../../utils/format';
import { rewardText } from '../../utils/rewards';
import DtArt from '../DtArt.vue';
import DtSheet from '../DtSheet.vue';

/**
 * 广场 · 居民（界面改版 P10）：蟹老板的钱袋（大头像卡 + 摇一摇）、今天的星愿（谁许的愿、效果小胶囊、
 * 共飨奖励和按钮）、改天气（天气改版：雷神锤换成司天罗盘、晴雨签，在天气页用；这里一行入口）
 */
const props = defineProps<{ data: TownDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);

async function act<T>(fn: () => Promise<T>, done: (r: T) => string, fallback: string): Promise<boolean> {
  if (busy.value) return false;
  busy.value = true;
  try {
    toast.push(done(await fn()), 'success');
    emit('reload');
    return true;
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    // 失败多半是页面已经过时（别人刚许过愿、跨天等）：重新读一次
    emit('reload');
    return false;
  } finally {
    busy.value = false;
  }
}
const rewards = (list: TownRewardDto[]) => list.map((r) => rewardText(r, catalog)).join(t.value.events.sep);

function shake() {
  void act(
    () => endpoints.townShake(),
    (r) =>
      t.value.town.shook(formatNum(r.coin)) +
      (r.egg ? t.value.town.shookEgg(catalog.goodsName(r.egg.goodsId), r.egg.num) : ''),
    t.value.town.shakeFailed,
  );
}

const bless = computed(() => props.data.bless.today);
const blessName = computed(() =>
  bless.value ? (catalog.data('bless', bless.value.id)?.name ?? bless.value.name) : '',
);
/** 自选食材的星愿：点“共飨”先弹出选食材面板 */
const pickOpen = ref(false);
const pick = ref<number | null>(null);
const blessFoods = computed(() => {
  const b = bless.value;
  if (!b || !b.levels) return [];
  const [lo, hi] = b.levels;
  return [...catalog.foodsMap.values()].filter((f) => f.level >= lo && f.level <= hi);
});
const blessReward = computed(() => {
  const b = bless.value;
  if (!b) return '';
  const lv = b.levels
    ? b.levels[0] === b.levels[1]
      ? `${b.levels[0]}`
      : `${b.levels[0]}~${b.levels[1]}`
    : '';
  const x = t.value.town;
  const base =
    b.type === 5
      ? x.blessRandom(lv, b.num)
      : b.type === 0
        ? x.blessPick(lv, b.num)
        : b.type === 2
          ? t.value.common.qty(catalog.goodsName(b.goodsId!), b.num)
          : b.type === 3
            ? x.blessCoin(formatNum(b.num))
            : x.blessDiamond(b.num);
  if (!props.data.bless.hasLamp) return base;
  return base + (b.type === 3 ? x.lampCoin : x.lampOne);
});
const feastBlock = computed(() => {
  const b = bless.value;
  if (!b) return '';
  if (props.data.bless.feasted) return t.value.town.feasted;
  if (props.data.bless.activation < b.needAct)
    return t.value.town.feastNeedAct(props.data.bless.activation, b.needAct);
  return '';
});
function feastClick() {
  if (bless.value?.type === 0) {
    pick.value = null;
    pickOpen.value = true;
  } else void feast();
}
async function feast() {
  const foodsId = bless.value?.type === 0 ? (pick.value ?? undefined) : undefined;
  const ok = await act(
    () => endpoints.townFeast(foodsId),
    (r) => t.value.town.feastDone(rewards(r.rewards)),
    t.value.town.feastFailed,
  );
  if (ok) pickOpen.value = false;
}
function wish() {
  void act(
    () => endpoints.townWish(),
    (r) => t.value.town.wished(catalog.data('bless', r.bless.id)?.name ?? r.bless.name),
    t.value.town.wishFailed,
  );
}
</script>

<template>
  <!-- 广场没有别的 NPC 了：雯姐在酒吧（问题记录 453）；13 哥、镇长大胃锅、卡门的见面礼在协会（问题记录 441） -->
  <div class="dt-card dt-mascot is-large dt-krab" data-testid="krab-card">
    <span class="dt-npc-ava"><DtArt name="npc-krab" :size="56" /></span>
    <div class="dt-mascot-text">
      <b>{{ t.town.krab }}</b>
      <span class="dt-krab-hint">{{ t.town.shakeHint }}</span>
    </div>
    <span v-if="data.shaken" class="dt-tag dt-tag-ok text-nowrap" data-testid="shake">{{
      t.town.shakenToday
    }}</span>
    <button
      v-else
      type="button"
      class="btn btn-sm btn-primary text-nowrap"
      :disabled="busy"
      data-testid="shake"
      @click="shake"
    >
      {{ t.town.shake }}
    </button>
  </div>

  <div class="dt-block-head mt-3">
    <h2 class="dt-block-title">{{ t.town.blessTitle }}</h2>
    <span class="dt-block-more">{{ t.town.blessAll }}</span>
  </div>
  <div v-if="bless" class="dt-card dt-bless" data-testid="bless-card">
    <div class="dt-bless-head">
      <span class="dt-bless-art"><DtArt name="town-lamp" :size="32" /></span>
      <span class="dt-bless-main">
        <b data-testid="bless-name">{{ blessName }}</b>
        <span v-if="data.bless.restName">{{ t.town.blessBy(data.bless.restName) }}</span>
      </span>
    </div>
    <div class="dt-effect-chips mt-2">
      <span
        v-for="c in effectChips(bless.buff)"
        :key="c.text"
        :class="['dt-chip', c.good ? 'dt-chip-good' : 'dt-chip-bad']"
        >{{ c.text }}</span
      >
    </div>
    <div class="dt-bless-feast">
      <span class="dt-bless-feast-main">
        <b>{{ t.town.feastReward }}</b>
        <span data-testid="bless-reward">{{ blessReward }}</span>
        <span v-if="feastBlock && !data.bless.feasted" class="text-danger" data-testid="feast-block">{{
          feastBlock
        }}</span>
      </span>
      <span v-if="data.bless.feasted" class="dt-tag dt-tag-ok text-nowrap" data-testid="feast-block">{{
        t.town.feasted
      }}</span>
      <button
        v-else
        type="button"
        class="btn btn-sm btn-primary text-nowrap"
        :disabled="busy || !!feastBlock"
        data-testid="feast"
        @click="feastClick"
      >
        {{ t.town.feast }}
      </button>
    </div>
  </div>
  <div v-else class="dt-card dt-rows-card" data-testid="bless-none">
    <div class="dt-row">
      <span class="dt-row-ico"><DtArt name="town-lamp" :size="28" /></span>
      <span class="dt-row-main">
        <span class="dt-row-sub dt-row-sub-wrap">{{ t.town.noWish }}</span>
        <span v-if="!data.bless.hasLamp" class="dt-row-sub text-danger" data-testid="wish-block">{{
          t.town.needLamp
        }}</span>
      </span>
      <span v-if="data.bless.hasLamp" class="dt-row-end">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="busy"
          data-testid="wish"
          @click="wish"
        >
          {{ t.town.wish }}
        </button>
      </span>
    </div>
  </div>

  <div class="dt-block-head mt-3">
    <h2 class="dt-block-title">{{ t.town.weatherTool }}</h2>
  </div>
  <div class="dt-card dt-rows-card">
    <RouterLink to="/weather" class="dt-row is-link" data-testid="weather-tool-row">
      <span class="dt-row-ico"><DtArt name="goods-compass" :size="28" /></span>
      <span class="dt-row-main">
        <span class="dt-row-title is-strong">{{ t.town.toWeather }}</span>
        <span class="dt-row-sub dt-row-sub-wrap">{{
          t.town.weatherToolSub(catalog.weatherName(data.weather.id, data.weather.name))
        }}</span>
      </span>
    </RouterLink>
  </div>

  <!-- 自选食材的星愿：选一种再共飨 -->
  <DtSheet :open="pickOpen" :title="t.town.pickFood" @close="pickOpen = false">
    <div class="dt-bag" role="radiogroup" :aria-label="t.town.pickFood" data-testid="feast-food">
      <button
        v-for="f in blessFoods"
        :key="f.id"
        type="button"
        role="radio"
        :aria-checked="pick === f.id"
        :aria-pressed="pick === f.id"
        class="dt-bag-cell"
        :data-testid="`feast-food-${f.id}`"
        @click="pick = f.id"
      >
        <DtArt :name="catalog.foodArt(f.id)" :size="40" />
        <span class="dt-bag-name">{{ f.name }}</span>
      </button>
    </div>
    <template #actions>
      <div class="dt-sheet-pair">
        <button type="button" class="btn btn-light" @click="pickOpen = false">{{ t.common.cancel }}</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy || pick === null"
          data-testid="feast-ok"
          @click="feast"
        >
          {{ t.town.feast }}
        </button>
      </div>
    </template>
  </DtSheet>
</template>
