<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import GardenSis from '../components/market/GardenSis.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import type { MarketDto, MarketItemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const session = useSessionStore();
const myRest = computed(() => session.me?.restaurantId ?? null);
const data = ref<MarketDto | null>(null);
const qty = reactive<Record<number, number>>({});
const picks = ref<number[]>([]);
const busy = ref(false);
const guessOpen = ref(false);

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const sections = [
  { key: 'daily', title: '日常菜场', next: 'nextDaily' },
  { key: 'special', title: '特价菜场', next: 'nextSpecial' },
  { key: 'premium', title: '高级菜场（需爱心项链）', next: 'nextPremium' },
] as const;

/** 特价同一网络的购买间隔（规格书 06；问题记录：买第二个只提示"操作太快"） */
const specialWait = computed(() => {
  const until = data.value?.specialCooldownUntil;
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 60_000));
});
const sectionNote = (key: string) =>
  key === 'special' && data.value
    ? `需验证邮箱，每种每人 1 份；同一网络 ${data.value.specialCooldownMin} 分钟内只能抢一次`
    : '';

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
const manualStock = () => {
  const d = data.value;
  if (!d) return;
  // 每次至少 100 万、越进越贵，先确认；手动货在下次日常进货时一起下架（PR29 遗留）
  if (
    !window.confirm(
      `花 ${formatNum(d.manual.cost)} 银币进 4 种日常菜？下次日常进货（${time(d.nextDaily)}）时会一起下架。`,
    )
  )
    return;
  return run(async () => {
    const r = await endpoints.marketManualStock();
    toast.push(`进货完成，声望 +${r.renown}`, 'success');
  }, '进货失败');
};
/** 买的数量不超过最多还能买几个 */
const buy = (it: MarketItemDto) =>
  run(() => endpoints.marketBuy(it.id, Math.max(1, Math.min(qty[it.id] || 1, it.canBuy))), '购买失败');
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
    return `同一网络或设备本轮已买 ${it.sharedBought} 份（限购按店、设备、网络分别算），最多再买 ${it.canBuy}`;
  if (it.have === 0 && d.cupboardFull) return '橱柜格子满了，先腾出一格';
  const room = d.foodsMaxNum - it.have;
  if (it.have > 0 && room < Math.min(limitLeft, it.left))
    return room <= 0
      ? `橱柜里已经放满了（单种上限 ${d.foodsMaxNum}）`
      : `橱柜单种上限 ${d.foodsMaxNum}，已有 ${it.have}，最多再买 ${room}`;
  return '';
}
function togglePick(id: number) {
  const i = picks.value.indexOf(id);
  if (i >= 0) picks.value.splice(i, 1);
  else if (data.value && picks.value.length < data.value.guess.maxPick) picks.value.push(id);
}
const joinGuess = () => run(() => endpoints.marketGuess([...picks.value]), '竞猜失败');
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取菜场失败'), 'danger')));
</script>

<template>
  <GardenSis :data="data" />
  <HiphopCard :place="1" @changed="load" />
  <template v-if="data">
    <section v-for="s in sections" :key="s.key" class="mb-3">
      <!-- 间距放在外层：.dt-section 自带上边距，放在 flex 行里会把标题挤低半行（问题记录 192） -->
      <div class="d-flex align-items-center mt-3 mb-1" :data-testid="`section-head-${s.key}`">
        <h6 class="dt-section m-0">
          {{ s.title
          }}<small v-if="sectionNote(s.key)" class="text-muted fw-normal">（{{ sectionNote(s.key) }}）</small>
        </h6>
        <span class="small text-muted ms-auto">下次进货 {{ time(data[s.next]) }}</span>
      </div>
      <button
        v-if="s.key === 'daily' && data.manual.hasCard"
        class="btn btn-sm btn-outline-primary mb-1"
        :disabled="busy"
        data-testid="market-manual"
        @click="manualStock"
      >
        手动进货（{{ formatNum(data.manual.cost) }} 银币）
      </button>
      <div
        v-if="s.key === 'special' && specialWait > 0"
        class="small text-danger"
        data-testid="special-cooldown"
      >
        刚抢过特价，同一网络还要等 {{ specialWait }} 分钟才能再抢
      </div>
      <div v-if="data[s.key].length === 0" class="small text-muted">还没有进货</div>
      <div
        v-for="it in data[s.key]"
        :key="it.id"
        class="d-flex align-items-center gap-2 border-bottom py-1 small"
        :data-testid="`item-${it.id}`"
      >
        <div class="flex-fill">
          <span>{{ catalog.foodName(it.foodsId) }}</span>
          <span v-if="it.hot" class="badge bg-danger ms-1">热门</span>
          <div v-if="it.owner" class="dt-meta" :data-testid="`owner-${it.id}`">
            {{ it.owner.restId === myRest ? '自己的货，免费' : `${it.owner.name} 进的货` }}
          </div>
          <div v-if="it.owner?.restId === myRest" class="text-muted">剩 {{ formatNum(it.left) }}</div>
          <div v-else class="text-muted">
            {{ formatNum(it.price) }} 银币 · 剩 {{ formatNum(it.left) }} · 限购 {{ it.bought }}/{{ it.limit }}
          </div>
          <div v-if="capNote(it)" class="text-danger" :data-testid="`cap-${it.id}`">{{ capNote(it) }}</div>
        </div>
        <input
          v-model.number="qty[it.id]"
          :data-testid="`qty-${it.id}`"
          type="number"
          min="1"
          :max="Math.max(1, it.canBuy)"
          class="form-control form-control-sm"
          style="width: 72px"
        />
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`buy-${it.id}`"
          :disabled="busy || it.canBuy < 1 || (s.key === 'special' && specialWait > 0)"
          @click="buy(it)"
        >
          买
        </button>
      </div>
    </section>

    <section class="border rounded p-2 small">
      <div class="d-flex align-items-center">
        <b>菜场竞猜</b>
        <span class="text-muted ms-2">猜下一轮日常菜场（{{ data.guess.period.slice(-2) }} 点）上什么菜</span>
        <a href="#" class="ms-auto" data-testid="guess-toggle" @click.prevent="guessOpen = !guessOpen">
          {{ guessOpen ? '收起' : '展开' }}
        </a>
      </div>
      <div v-if="data.guess.last" class="text-muted">上次猜中 {{ data.guess.last.hits ?? 0 }} 种</div>
      <div v-if="data.guess.joined" class="mt-1">
        已报名：{{ data.guess.joined.map((id) => catalog.foodName(id)).join('、') }}
      </div>
      <div v-else-if="guessOpen" class="mt-1">
        <div class="text-muted mb-1">
          最多选 {{ data.guess.maxPick }} 种，花 {{ data.guess.cost }} 张神秘礼券
        </div>
        <button
          v-for="id in data.guess.pool"
          :key="id"
          :class="[
            'btn',
            'btn-sm',
            'me-1',
            'mb-1',
            picks.includes(id) ? 'btn-warning' : 'btn-outline-secondary',
          ]"
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
            报名（{{ picks.length }} 种）
          </button>
        </div>
      </div>
    </section>
  </template>
</template>
