<script setup lang="ts">
import DtEmpty from '../components/DtEmpty.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtStepper from '../components/DtStepper.vue';
import FoodArt from '../components/FoodArt.vue';
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import GardenSis from '../components/market/GardenSis.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import type { MarketDto, MarketItemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useConfirmStore } from '../stores/confirm';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { formatNum, timeHM } from '../utils/format';
import { serverNowMs } from '../utils/serverNow';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const restStore = useRestaurantStore();
const session = useSessionStore();
const myRest = computed(() => session.me?.restaurantId ?? null);
const data = ref<MarketDto | null>(null);
const qty = reactive<Record<number, number>>({});
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
  for (const it of [...data.value.daily, ...data.value.special, ...data.value.premium]) qty[it.id] ??= 1;
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
/** 买的数量不超过最多还能买几个 */
const buy = (it: MarketItemDto) =>
  run(
    () => endpoints.marketBuy(it.id, Math.max(1, Math.min(qty[it.id] || 1, it.canBuy))),
    t.value.market.buyFailed,
  );
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
      <i class="bi bi-graph-up-arrow"></i> {{ t.nav.links.exchange }}
    </RouterLink>
  </GardenSis>
  <HiphopCard :place="1" @changed="load" />
  <DtEmpty v-if="!data && failed" :title="t.market.loadFailed" data-testid="market-failed" />
  <DtSkeleton v-else-if="!data" :rows="6" data-testid="market-skeleton" />
  <template v-else>
    <section v-for="s in sections" :key="s.key" class="mb-3">
      <!-- 间距放在外层：.dt-section 自带上边距，放在 flex 行里会把标题挤低半行（问题记录 192） -->
      <div class="d-flex align-items-center mt-3 mb-1" :data-testid="`section-head-${s.key}`">
        <h6 class="dt-section m-0">
          {{ t.market.sections[s.key]
          }}<small v-if="sectionNote(s.key)" class="text-muted fw-normal">{{
            t.common.paren(sectionNote(s.key))
          }}</small>
        </h6>
        <span class="small text-muted ms-auto">{{ t.market.nextStock(time(data[s.next])) }}</span>
      </div>
      <button
        v-if="s.key === 'daily' && data.manual.hasCard"
        class="btn btn-sm btn-outline-primary mb-1"
        :disabled="busy"
        data-testid="market-manual"
        @click="manualStock"
      >
        {{ t.market.manualBtn(formatNum(data.manual.cost)) }}
      </button>
      <div
        v-if="s.key === 'special' && specialWait > 0"
        class="small text-danger"
        data-testid="special-cooldown"
      >
        {{ t.market.specialWait(specialWait) }}
      </div>
      <div v-if="data[s.key].length === 0" class="small text-muted">{{ t.market.empty }}</div>
      <!-- 一段一张卡片，每种食材一行，前面是食材图（界面改版 P4） -->
      <div v-else class="dt-card">
        <div v-for="it in data[s.key]" :key="it.id" class="dt-item small" :data-testid="`item-${it.id}`">
          <FoodArt :id="it.foodsId" :size="24" />
          <div class="dt-item-main">
            <!-- 放不下时限购换到下一行（终审 I1：法文名字收窄成 0，限购压在名字上） -->
            <div class="dt-name-row">
              <span class="dt-name-row-name">{{ catalog.foodName(it.foodsId) }}</span>
              <span v-if="it.hot" class="badge bg-danger">{{ t.market.hot }}</span>
              <!-- 限购写在名字这一行右边，价格行才放得下一行（界面改版 P4） -->
              <span
                v-if="it.owner?.restId !== myRest"
                class="dt-meta text-nowrap ms-auto"
                :data-testid="`limit-${it.id}`"
                >{{ t.market.limitLine(it.bought, it.limit) }}</span
              >
            </div>
            <div v-if="it.owner" class="dt-meta" :data-testid="`owner-${it.id}`">
              {{ it.owner.restId === myRest ? t.market.ownFree : t.market.stockedBy(it.owner.name) }}
            </div>
            <div v-if="it.owner?.restId === myRest" class="text-muted">
              {{ t.market.left(formatNum(it.left)) }}
            </div>
            <div v-else class="text-muted" :data-testid="`price-${it.id}`">
              {{ t.market.priceLine(formatNum(it.price), formatNum(it.left)) }}
            </div>
            <div v-if="capNote(it)" class="text-danger" :data-testid="`cap-${it.id}`">{{ capNote(it) }}</div>
          </div>
          <DtStepper
            v-model="qty[it.id]!"
            :min="1"
            :max="Math.max(1, it.canBuy)"
            :testid="`qty-${it.id}`"
            size="sm"
            :disabled="it.canBuy < 1"
          />
          <button
            class="btn btn-sm btn-primary"
            :data-testid="`buy-${it.id}`"
            :disabled="busy || it.canBuy < 1 || (s.key === 'special' && specialWait > 0)"
            @click="buy(it)"
          >
            {{ t.market.buy }}
          </button>
        </div>
      </div>
    </section>

    <section class="dt-card small">
      <div class="d-flex align-items-center">
        <b>{{ t.market.guess.title }}</b>
        <span class="text-muted ms-2">{{ t.market.guess.hint(data.guess.period.slice(-2)) }}</span>
        <button
          type="button"
          class="dt-link-btn ms-auto"
          data-testid="guess-toggle"
          :aria-expanded="guessOpen"
          @click="guessOpen = !guessOpen"
        >
          {{ guessOpen ? t.common.collapse : t.common.expand }}
        </button>
      </div>
      <div v-if="data.guess.last" class="text-muted">
        {{ t.market.guess.last(data.guess.last.hits ?? 0) }}
      </div>
      <div v-if="data.guess.joined" class="mt-1">
        {{ t.market.guess.joined(data.guess.joined.map((id) => catalog.foodName(id)).join(t.events.sep)) }}
      </div>
      <div v-else-if="guessOpen" class="mt-1">
        <div class="text-muted mb-1">
          {{ t.market.guess.rule(data.guess.maxPick, data.guess.cost) }}
        </div>
        <button
          v-for="id in data.guess.pool"
          :key="id"
          type="button"
          class="dt-choice me-1 mb-1"
          :aria-pressed="picks.includes(id)"
          :data-testid="`guess-${id}`"
          @click="togglePick(id)"
        >
          {{ catalog.foodName(id) }}
        </button>
        <div>
          <button
            class="btn btn-sm btn-primary"
            data-testid="guess-join"
            :disabled="busy || picks.length === 0"
            @click="joinGuess"
          >
            {{ t.market.guess.join(picks.length) }}
          </button>
        </div>
      </div>
    </section>
  </template>
</template>
