<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ExchangeBookDto, ExchangeFoodDto, ExchangeMeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

/** 交易所（问题记录 156，156-1 设计 §8）：选食材 → 盘口 → 下单；我的挂单、账户、成交 */
const catalog = useCatalogStore();
const toast = useToastStore();
const foods = ref<ExchangeFoodDto[]>([]);
const me = ref<ExchangeMeDto | null>(null);
const book = ref<ExchangeBookDto | null>(null);
const selected = ref<number | null>(null);
const search = ref('');
const side = ref<'buy' | 'sell'>('buy');
const price = ref<number | ''>('');
const qty = ref<number | ''>(1);
const busy = ref(false);

const levelOf = (id: number) => catalog.foodsMap.get(id)?.level ?? 0;
const groups = computed(() => {
  const q = search.value.trim();
  const list = foods.value.filter((f) => !q || catalog.foodName(f.foodsId).includes(q));
  const by = new Map<number, ExchangeFoodDto[]>();
  for (const f of list) by.set(levelOf(f.foodsId), [...(by.get(levelOf(f.foodsId)) ?? []), f]);
  return [...by.entries()].sort((a, b) => a[0] - b[0]);
});
const pct = (x: number | null) => (x === null ? '' : `${x >= 0 ? '+' : ''}${Math.round(x * 1000) / 10}%`);
const REASON: Record<string, (m: ExchangeMeDto) => string> = {
  exchange_level: (m) => `餐厅 ${m.need.level} 级才能交易`,
  exchange_age: (m) => `账号注册满 ${m.need.days} 天才能交易`,
  exchange_email: () => '验证邮箱后才能交易',
};
const blocked = computed(() =>
  me.value && !me.value.eligible ? (REASON[me.value.reason ?? '']?.(me.value) ?? '暂时不能交易') : '',
);
const valid = computed(
  () =>
    book.value !== null &&
    typeof price.value === 'number' &&
    typeof qty.value === 'number' &&
    Number.isInteger(price.value) &&
    Number.isInteger(qty.value) &&
    price.value >= book.value.min &&
    price.value <= book.value.max &&
    qty.value >= 1 &&
    qty.value <= 999,
);
const estimate = computed(() => {
  if (!valid.value || !me.value) return '';
  const total = (price.value as number) * (qty.value as number);
  return side.value === 'buy'
    ? `预计最多花费 ${formatNum(total)} 银币`
    : `全部成交后约得 ${formatNum(total - Math.floor(total * me.value.feeRate))} 银币（已扣手续费）`;
});

async function loadMe() {
  me.value = await endpoints.tradeMe();
}
async function pick(id: number) {
  selected.value = id;
  book.value = await endpoints.tradeBook(id);
}
async function run(fn: () => Promise<unknown>, ok: (r: unknown) => string, fallback: string) {
  busy.value = true;
  try {
    const r = await fn();
    toast.push(ok(r));
    await loadMe();
    if (selected.value !== null) book.value = await endpoints.tradeBook(selected.value);
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
function submit() {
  if (!valid.value || selected.value === null) return;
  const b = {
    foodsId: selected.value,
    side: side.value,
    price: price.value as number,
    qty: qty.value as number,
  };
  void run(
    () => endpoints.tradePlace(b),
    (r) => {
      const n = (r as { fills: Array<{ qty: number }> }).fills.reduce((s, x) => s + x.qty, 0);
      return n > 0 ? `已成交 ${n} 个${n < b.qty ? '，其余挂单中' : ''}` : '已挂单';
    },
    '下单失败',
  );
}
const cancel = (id: number) =>
  run(
    () => endpoints.tradeCancel(id),
    () => '已撤单',
    '撤单失败',
  );
const withdraw = () =>
  run(
    () => endpoints.tradeWithdraw(),
    () => '已取出',
    '取出失败',
  );

onMounted(async () => {
  try {
    [foods.value] = await Promise.all([endpoints.tradeFoods(), loadMe()]);
  } catch (e) {
    toast.push(errorMessage(e, '读取交易所失败'), 'danger');
  }
});
</script>

<template>
  <h5>交易所</h5>
  <div class="small text-muted mb-2">
    玩家之间买卖稀有食材。挂单价要在当天参考价的一半到两倍之间；卖方成交时扣手续费。
  </div>
  <input v-model="search" class="form-control form-control-sm mb-2" placeholder="搜索食材" />
  <div class="dt-card mb-3" style="max-height: 14rem; overflow-y: auto">
    <div v-for="[lv, list] in groups" :key="lv" class="mb-1">
      <div class="dt-group-label">{{ lv }} 级</div>
      <button
        v-for="f in list"
        :key="f.foodsId"
        type="button"
        :class="['btn btn-sm me-1 mb-1', f.foodsId === selected ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`ex-food-${f.foodsId}`"
        @click="pick(f.foodsId)"
      >
        {{ catalog.foodName(f.foodsId) }}
        <span class="small opacity-75">{{ formatNum(f.last ?? f.ref) }} {{ pct(f.changePct) }}</span>
      </button>
    </div>
  </div>

  <div v-if="book" class="dt-card mb-3" data-testid="ex-book">
    <div class="d-flex flex-wrap gap-2 small mb-1">
      <b>{{ catalog.foodName(book.foodsId) }}</b>
      <span>参考价 {{ formatNum(book.ref) }}</span>
      <span v-if="book.last !== null">最新 {{ formatNum(book.last) }}</span>
      <span>今日成交 {{ formatNum(book.volume) }}</span>
      <span class="text-muted" data-testid="ex-band"
        >可挂 {{ formatNum(book.min) }} ~ {{ formatNum(book.max) }}</span
      >
    </div>
    <table class="table table-sm small mb-2">
      <tbody>
        <tr
          v-for="a in [...book.asks].reverse()"
          :key="`a${a.price}`"
          class="text-danger"
          role="button"
          :data-testid="`ex-ask-${a.price}`"
          @click="price = a.price"
        >
          <td>卖</td>
          <td>{{ formatNum(a.price) }}</td>
          <td class="text-end">{{ formatNum(a.qty) }}</td>
        </tr>
        <tr
          v-for="b in book.bids"
          :key="`b${b.price}`"
          class="text-success"
          role="button"
          :data-testid="`ex-bid-${b.price}`"
          @click="price = b.price"
        >
          <td>买</td>
          <td>{{ formatNum(b.price) }}</td>
          <td class="text-end">{{ formatNum(b.qty) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="btn-group btn-group-sm mb-2">
      <button
        type="button"
        :class="['btn', side === 'buy' ? 'btn-success' : 'btn-outline-success']"
        data-testid="ex-side-buy"
        @click="side = 'buy'"
      >
        买入
      </button>
      <button
        type="button"
        :class="['btn', side === 'sell' ? 'btn-danger' : 'btn-outline-danger']"
        data-testid="ex-side-sell"
        @click="side = 'sell'"
      >
        卖出
      </button>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center small">
      单价
      <input
        v-model.number="price"
        type="number"
        :min="book.min"
        :max="book.max"
        class="form-control form-control-sm"
        style="width: 7rem"
        data-testid="ex-price"
      />
      数量
      <input
        v-model.number="qty"
        type="number"
        min="1"
        max="999"
        class="form-control form-control-sm"
        style="width: 5rem"
        data-testid="ex-qty"
      />
      <button
        type="button"
        class="btn btn-sm btn-primary"
        :disabled="busy || !valid || !!blocked"
        data-testid="ex-submit"
        @click="submit"
      >
        {{ side === 'buy' ? '挂买单' : '挂卖单' }}
      </button>
    </div>
    <div class="small text-muted mt-1" data-testid="ex-estimate">{{ estimate }}</div>
    <div v-if="blocked" class="small text-danger mt-1">{{ blocked }}</div>
  </div>

  <template v-if="me">
    <h6 class="dt-section">交易所账户</h6>
    <div class="dt-card mb-3 d-flex flex-wrap align-items-center gap-2 small" data-testid="ex-wallet">
      <span>银币 {{ formatNum(me.wallet.coin) }}</span>
      <span v-for="f in me.wallet.foods" :key="f.foodsId">{{ catalog.foodName(f.foodsId) }}×{{ f.num }}</span>
      <button
        type="button"
        class="btn btn-sm btn-outline-primary ms-auto"
        :disabled="busy || (me.wallet.coin === 0 && me.wallet.foods.length === 0)"
        data-testid="ex-withdraw"
        @click="withdraw"
      >
        全部取出
      </button>
    </div>
    <h6 class="dt-section">我的挂单</h6>
    <div v-if="me.orders.length === 0" class="small text-muted mb-3">没有挂单</div>
    <div v-for="o in me.orders" :key="o.id" class="d-flex align-items-center gap-2 small border-bottom py-1">
      <span :class="o.side === 'buy' ? 'text-success' : 'text-danger'">{{
        o.side === 'buy' ? '买' : '卖'
      }}</span>
      <span class="flex-fill"
        >{{ catalog.foodName(o.foodsId) }} {{ formatNum(o.price) }} × {{ o.qty }}（已成交
        {{ o.filled }}）</span
      >
      <button
        type="button"
        class="btn btn-sm btn-link text-danger"
        :disabled="busy"
        :data-testid="`ex-cancel-${o.id}`"
        @click="cancel(o.id)"
      >
        撤单
      </button>
    </div>
    <h6 class="dt-section mt-3">近 7 天成交</h6>
    <div v-if="me.trades.length === 0" class="small text-muted">没有成交</div>
    <div v-for="(x, i) in me.trades" :key="i" class="small border-bottom py-1">
      {{ x.side === 'buy' ? '买入' : '卖出' }} {{ catalog.foodName(x.foodsId) }} {{ formatNum(x.price) }} ×
      {{ x.qty }}
      <span v-if="x.fee > 0" class="text-muted">（手续费 {{ formatNum(x.fee) }}）</span>
    </div>
  </template>
</template>
