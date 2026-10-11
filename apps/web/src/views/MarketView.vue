<script setup lang="ts">
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtRow from '../components/DtRow.vue';
import DtSheet from '../components/DtSheet.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtStepper from '../components/DtStepper.vue';
import FoodArt from '../components/FoodArt.vue';
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import GardenSis from '../components/market/GardenSis.vue';
import { computed, onMounted, ref } from 'vue';
import { MARKET_BUY_MAX, type MarketDto, type MarketItemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useConfirmStore } from '../stores/confirm';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { foodLevelLabel, formatNum, timeHM } from '../utils/format';
import { serverNowMs } from '../utils/serverNow';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const restStore = useRestaurantStore();
const session = useSessionStore();
const myRest = computed(() => session.me?.restaurantId ?? null);
const data = ref<MarketDto | null>(null);
const picks = ref<number[]>([]);
const busy = ref(false);
/** 读取失败时不再显示骨架行（终审 I4） */
const failed = ref(false);
const guessOpen = ref(false);

const time = timeHM;
/** 高级菜场暂时隐藏（问题记录 477）：服务端照常进货，恢复时把 premium 加回来 */
const sections = [
  { key: 'daily', next: 'nextDaily' },
  { key: 'special', next: 'nextSpecial' },
] as const;

/** 特价同一网络的购买间隔（规格书 06；问题记录：买第二个只提示"操作太快"） */
const specialWait = computed(() => {
  const until = data.value?.specialCooldownUntil;
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - serverNowMs()) / 60_000));
});
const sectionNote = (key: string) =>
  key === 'special' && data.value ? t.value.market.specialNote(data.value.specialCooldownMin) : '';

async function load() {
  data.value = await endpoints.market();
}
async function run(fn: () => Promise<unknown>, fallback: string) {
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
/** 菜场工作证手动进货（4E-2）：挂 4 种自己的货到日常货架 */
const confirm = useConfirmStore();
const manualStock = async () => {
  const d = data.value;
  if (!d) return;
  // 每次至少 100 万、越进越贵，先确认；手动货在下次日常进货时一起下架（PR29 遗留；界面改版 P4：确认面板）
  if (
    !(await confirm.ask({ title: t.value.market.manualConfirm(formatNum(d.manual.cost), time(d.nextDaily)) }))
  )
    return;
  return run(async () => {
    const r = await endpoints.marketManualStock();
    toast.push(t.value.market.manualDone(r.renown), 'success');
  }, t.value.market.manualFailed);
};
/** 自己的手动货：免费、不限购（4E-2） */
const isOwn = (it: MarketItemDto) => it.owner?.restId === myRest.value;
const unitPrice = (it: MarketItemDto) => (isOwn(it) ? 0 : it.price);
const priceText = (it: MarketItemDto) => (isOwn(it) ? t.value.market.sheet.free : formatNum(it.price));
const levelOf = (foodsId: number) => catalog.food(foodsId)?.level ?? 0;
/** 等级角标的底色：2 级绿、3 级以上紫（和橱柜格子一致） */
const lvClass = (foodsId: number) =>
  levelOf(foodsId) >= 3 ? 'is-t3' : levelOf(foodsId) === 2 ? 'is-t2' : '';
/**
 * 最多能买几个：限购、库存、橱柜上限（canBuy），再按银币算（界面改版 P6，P4 终审 I3）。
 * 旧服务端没有银币字段时不按银币限制，买不起由服务端拦
 */
function maxBuy(it: MarketItemDto): number {
  const coin = data.value?.coin;
  const p = unitPrice(it);
  const byCoin = coin === undefined || p <= 0 ? Infinity : Math.floor(coin / p);
  // 一次最多 1000 个（接口的上限，P6 审查）
  return Math.max(0, Math.min(it.canBuy, byCoin, MARKET_BUY_MAX));
}
/** 购买面板：点价格按钮弹出 */
const buying = ref<MarketItemDto | null>(null);
const buyNum = ref(1);
function openBuy(it: MarketItemDto) {
  buying.value = it;
  // 特价菜默认填满能买的（用户 2026-10-11：特价通常就几份，省得一个个加）；日常菜默认 1 个
  buyNum.value = it.shelf === 1 ? Math.max(1, maxBuy(it)) : 1;
}
const buyMax = computed(() => (buying.value ? maxBuy(buying.value) : 0));
const buyNumClamped = computed(() => Math.max(1, Math.min(buyNum.value || 1, Math.max(1, buyMax.value))));
const buyTotal = computed(() => (buying.value ? unitPrice(buying.value) * buyNumClamped.value : 0));
/** 银币连一个都买不起（限购、库存还有） */
const coinShort = computed(() => {
  const it = buying.value;
  const coin = data.value?.coin;
  return !!it && coin !== undefined && it.canBuy > 0 && unitPrice(it) > coin;
});
/** 快捷数量：10、100（比最多还少时才给）和“最多” */
const quickNums = computed(() => {
  const max = buyMax.value;
  const out: { key: string; n: number; label: string }[] = [];
  for (const n of [10, 100]) if (n < max) out.push({ key: String(n), n, label: String(n) });
  if (max > 1) out.push({ key: 'max', n: max, label: t.value.market.sheet.max(formatNum(max)) });
  return out;
});
const buy = () => {
  const it = buying.value;
  if (!it) return;
  const n = buyNumClamped.value;
  buying.value = null;
  return run(() => endpoints.marketBuy(it.id, n), t.value.market.buyFailed);
};
/**
 * 能买的数量被别的限制压低时写明原因（问题记录：显示能买 1000，实际只能买 996；显示 0/1000 却提示限购已满）。
 * 限购按店、设备、网络分别算；橱柜有单种上限和格子数
 */
function capNote(it: MarketItemDto): string {
  const d = data.value;
  if (!d) return '';
  const limitLeft = it.limit - Math.max(it.bought, it.sharedBought);
  if (
    it.sharedBought > it.bought &&
    limitLeft < Math.min(it.limit - it.bought, it.left) &&
    it.canBuy <= limitLeft
  )
    return t.value.market.capShared(it.sharedBought, it.canBuy);
  if (it.have === 0 && d.cupboardFull) return t.value.market.capSlots;
  const room = d.foodsMaxNum - it.have;
  if (it.have > 0 && room < Math.min(limitLeft, it.left))
    return room <= 0
      ? t.value.market.capFull(d.foodsMaxNum)
      : t.value.market.capRoom(d.foodsMaxNum, it.have, room);
  return '';
}
function onGuessToggle(e: Event) {
  guessOpen.value = (e.target as HTMLDetailsElement).open;
}
function togglePick(id: number) {
  const i = picks.value.indexOf(id);
  if (i >= 0) picks.value.splice(i, 1);
  else if (data.value && picks.value.length < data.value.guess.maxPick) picks.value.push(id);
}
const joinGuess = () => run(() => endpoints.marketGuess([...picks.value]), t.value.market.guessFailed);
onMounted(() =>
  load().catch((e) => {
    failed.value = true;
    toast.push(errorMessage(e, t.value.market.loadFailed), 'danger');
  }),
);
</script>

<template>
  <!-- 交易所入口放在菜园姐那一行（问题记录 246）；区服关掉交易所时不显示（问题记录 248） -->
  <GardenSis :data="data">
    <RouterLink
      v-if="restStore.featureOn('exchange')"
      to="/exchange"
      class="btn btn-sm btn-outline-primary text-nowrap"
      data-testid="market-exchange"
    >
      {{ t.nav.links.exchange }}
    </RouterLink>
  </GardenSis>
  <HiphopCard :place="1" @changed="load" />
  <DtEmpty v-if="!data && failed" :title="t.market.loadFailed" data-testid="market-failed" />
  <DtSkeleton v-else-if="!data" :rows="6" data-testid="market-skeleton" />
  <template v-else>
    <!-- 一段一个区块（界面改版 P6）：标题右边写下次进货；一种菜一行，右边是价格按钮，点了弹出购买面板 -->
    <section v-for="s in sections" :key="s.key" class="dt-block" :data-testid="`section-${s.key}`">
      <div class="dt-block-head" :data-testid="`section-head-${s.key}`">
        <h2 class="dt-block-title">{{ t.market.sections[s.key] }}</h2>
        <span class="dt-block-more">{{ t.market.nextStock(time(data[s.next])) }}</span>
      </div>
      <div v-if="sectionNote(s.key)" class="dt-block-note">{{ sectionNote(s.key) }}</div>
      <div
        v-if="s.key === 'special' && specialWait > 0"
        class="dt-block-note text-danger"
        data-testid="special-cooldown"
      >
        {{ t.market.specialWait(specialWait) }}
      </div>
      <button
        v-if="s.key === 'daily' && data.manual.hasCard"
        class="btn btn-sm btn-outline-primary mb-2"
        :disabled="busy"
        data-testid="market-manual"
        @click="manualStock"
      >
        {{ t.market.manualBtn(formatNum(data.manual.cost)) }}
      </button>
      <div v-if="data[s.key].length === 0" class="dt-card dt-list-card small text-muted">
        {{ t.market.empty }}
      </div>
      <div v-else class="dt-card dt-rows-card">
        <DtRow v-for="it in data[s.key]" :key="it.id" class="dt-row-wrap" :data-testid="`item-${it.id}`">
          <template #icon><FoodArt :id="it.foodsId" :size="28" /></template>
          <template #title
            >{{ catalog.foodName(it.foodsId)
            }}<span v-if="levelOf(it.foodsId) >= 2" :class="['dt-tag', 'dt-lv', lvClass(it.foodsId)]">{{
              foodLevelLabel(levelOf(it.foodsId))
            }}</span
            ><span v-if="it.hot" class="dt-tag dt-tag-hot">{{ t.market.hot }}</span></template
          >
          <template #sub>
            <span v-if="it.owner" :data-testid="`owner-${it.id}`"
              >{{ isOwn(it) ? t.market.ownFree : t.market.stockedBy(it.owner.name) }} · </span
            ><span>{{ t.market.left(formatNum(it.left)) }}</span
            ><template v-if="!isOwn(it)">
              ·
              <span :data-testid="`limit-${it.id}`">{{
                t.market.limitLine(it.bought, it.limit)
              }}</span></template
            >
            <span v-if="capNote(it)" class="dt-row-warn" :data-testid="`cap-${it.id}`">{{
              capNote(it)
            }}</span>
          </template>
          <template #end>
            <button
              type="button"
              class="dt-price-btn"
              :data-testid="`buy-${it.id}`"
              :disabled="busy || it.canBuy < 1 || (s.key === 'special' && specialWait > 0)"
              :aria-label="t.market.sheet.open(catalog.foodName(it.foodsId), priceText(it))"
              @click="openBuy(it)"
            >
              <DtArt v-if="!isOwn(it)" name="res-coin-silver" :size="16" /><span
                :data-testid="`price-${it.id}`"
                >{{ priceText(it) }}</span
              >
            </button>
          </template>
        </DtRow>
      </div>
    </section>

    <!-- 菜场竞猜：和首页“生效的加成”同一种折叠卡片；报过名时摘要写报了哪些 -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.market.guess.title }}</h2>
      </div>
      <details class="dt-card dt-effects" data-testid="guess" :open="guessOpen" @toggle="onGuessToggle">
        <summary class="dt-effects-sum" data-testid="guess-toggle">
          <span class="dt-effects-sum-text">{{
            data.guess.joined
              ? t.market.guess.joined(data.guess.joined.map((id) => catalog.foodName(id)).join(t.events.sep))
              : t.market.guess.hint(data.guess.period.slice(-2))
          }}</span>
          <i class="bi bi-chevron-down dt-effects-chev" aria-hidden="true"></i>
        </summary>
        <div class="dt-effects-body dt-guess-body small">
          <div v-if="data.guess.last" class="text-muted">
            {{ t.market.guess.last(data.guess.last.hits ?? 0) }}
          </div>
          <template v-if="!data.guess.joined">
            <div class="text-muted mb-2">
              {{ t.market.guess.rule(data.guess.maxPick, data.guess.cost) }}
            </div>
            <div class="dt-guess-picks">
              <button
                v-for="id in data.guess.pool"
                :key="id"
                type="button"
                class="dt-choice"
                :aria-pressed="picks.includes(id)"
                :data-testid="`guess-${id}`"
                @click="togglePick(id)"
              >
                {{ catalog.foodName(id) }}
              </button>
            </div>
            <button
              class="btn btn-primary dt-btn-block"
              data-testid="guess-join"
              :disabled="busy || picks.length === 0"
              @click="joinGuess"
            >
              {{ t.market.guess.join(picks.length) }}
            </button>
          </template>
        </div>
      </details>
    </section>
  </template>

  <!-- 购买面板（界面改版 P6，设计 §1.1 第 5 条）：大图、单价、最多能买；数量和快捷 10 / 100 / 最多；合计和余额 -->
  <DtSheet :open="!!buying" :title="buying ? catalog.foodName(buying.foodsId) : ''" @close="buying = null">
    <div v-if="buying" data-testid="buy-sheet">
      <div class="dt-detail-head">
        <span :class="['dt-detail-art', lvClass(buying.foodsId)]"
          ><FoodArt :id="buying.foodsId" :size="52"
        /></span>
        <div class="dt-detail-info">
          <div>
            {{ isOwn(buying) ? t.market.sheet.free : t.market.sheet.each(formatNum(buying.price)) }}
          </div>
          <div class="dt-detail-sub">
            {{ t.market.sheet.have(formatNum(buying.have)) }} · {{ t.market.sheet.canBuy(formatNum(buyMax)) }}
          </div>
        </div>
      </div>
      <div v-if="capNote(buying)" class="dt-detail-note text-danger">{{ capNote(buying) }}</div>
      <div class="dt-detail-qty">
        <span>{{ t.market.sheet.qty }}</span>
        <DtStepper
          v-model="buyNum"
          :min="1"
          :max="Math.max(1, buyMax)"
          testid="qty-sheet"
          :disabled="buyMax < 1"
        />
      </div>
      <div class="dt-buy-quick">
        <button
          v-for="q in quickNums"
          :key="q.key"
          type="button"
          class="dt-choice"
          :aria-pressed="buyNum === q.n"
          :data-testid="`quick-${q.key}`"
          @click="buyNum = q.n"
        >
          {{ q.label }}
        </button>
      </div>
      <div class="dt-buy-total" data-testid="buy-total">
        <span>{{ t.market.sheet.total }}</span>
        <span
          ><b>{{ formatNum(buyTotal) }}</b> {{ t.market.sheet.coin
          }}<template v-if="data?.coin !== undefined">
            · {{ t.market.sheet.balance(formatNum(data.coin)) }}</template
          ></span
        >
      </div>
      <div v-if="coinShort" class="dt-detail-note text-danger" data-testid="buy-short">
        {{ t.market.sheet.short }}
      </div>
    </div>
    <template #actions>
      <button
        v-if="buying"
        type="button"
        class="btn btn-primary dt-btn-block"
        data-testid="buy-confirm"
        :disabled="busy || buyMax < 1"
        @click="buy"
      >
        {{ t.market.sheet.confirm(buyNumClamped) }}
      </button>
    </template>
  </DtSheet>
</template>
