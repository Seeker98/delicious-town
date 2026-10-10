<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { WealthDepositDto, WealthViewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { newsTime } from '../../utils/news';
import { remainText } from '../../utils/remain';
import { serverNowMs } from '../../utils/serverNow';

/** 食材理财（理财设计 §3.4）：锁银币几天，到期本金全退加街市补给包；提前取出退一部分、没有包 */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<WealthViewDto | null>(null);
const busy = ref(false);
/** 选中的期限天数；读到的期限里没有它时用第一个 */
const term = ref(3);
/** 存几档（每档 unit 银币） */
const qty = ref<number | ''>(1);

async function load() {
  try {
    data.value = await endpoints.wealth();
    if (!data.value.terms.some((x) => x.days === term.value)) term.value = data.value.terms[0]?.days ?? 0;
  } catch (e) {
    toast.push(errorMessage(e, t.value.wealth.loadFailed), 'danger');
  }
}
async function act(fn: () => Promise<WealthViewDto>, done: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    data.value = await fn();
    toast.push(done);
  } catch (e) {
    toast.push(errorMessage(e, t.value.wealth.failed), 'danger');
    // 被拒多半是状态变了（别处已经存过、领过，或者到期了）：重新读取
    await load();
  } finally {
    busy.value = false;
  }
}

const pct = (rate: number) => Math.round(rate * 100);
const packName = (goodsId: number) => catalog.goodsName(goodsId);
const pick = computed(() => data.value?.terms.find((x) => x.days === term.value) ?? null);
const used = computed(() => (data.value?.deposits ?? []).reduce((a, x) => a + x.coin, 0));
/** 还能存几档：合计上限减去存着的 */
const leftUnits = computed(() =>
  data.value ? Math.max(0, Math.floor((data.value.maxTotal - used.value) / data.value.unit)) : 0,
);
/** 档数：输入框里的正整数；空、0、小数时为 0（同期货下单框） */
const n = computed(() => {
  const v = Number(qty.value);
  return qty.value !== '' && Number.isInteger(v) && v >= 1 ? v : 0;
});
const amount = computed(() => n.value * (data.value?.unit ?? 0));
const packs = computed(() => n.value * (pick.value?.perUnit ?? 0));
const dueAt = computed(() =>
  newsTime(new Date(serverNowMs() + (pick.value?.days ?? 0) * 86_400_000).toISOString()),
);
/** 整体存不了的原因：等级、笔数、合计上限 */
const blocked = computed(() => {
  const d = data.value;
  if (!d) return '';
  const w = t.value.wealth;
  if (d.level < d.minLevel) return w.needLevel(d.minLevel);
  if (d.deposits.length >= d.maxActive) return w.countFull(d.maxActive);
  if (leftUnits.value < 1) return w.totalFull(formatNum(d.maxTotal));
  return '';
});
const poor = computed(() => !!data.value && amount.value > data.value.coin);
const canDeposit = computed(
  () =>
    !busy.value &&
    !blocked.value &&
    !!pick.value &&
    n.value >= 1 &&
    n.value <= leftUnits.value &&
    !poor.value,
);

function deposit() {
  const p = pick.value;
  const d = data.value;
  if (!p || !d || !canDeposit.value) return;
  const w = t.value.wealth;
  const coin = amount.value;
  if (
    !window.confirm(
      w.depositConfirm(formatNum(coin), p.days, packs.value, packName(p.goodsId), pct(d.earlyRate)),
    )
  )
    return;
  return act(() => endpoints.wealthDeposit(p.days, coin), w.deposited);
}
function claim(x: WealthDepositDto) {
  return act(() => endpoints.wealthClaim(x.id), t.value.wealth.claimed(packName(x.goodsId), x.packs));
}
function withdraw(x: WealthDepositDto) {
  const w = t.value.wealth;
  if (!window.confirm(w.withdrawConfirm(formatNum(x.early), formatNum(x.coin)))) return;
  return act(() => endpoints.wealthWithdraw(x.id), w.withdrawn(formatNum(x.early)));
}
onMounted(load);
</script>

<template>
  <div data-testid="wealth-panel">
    <template v-if="data">
      <p class="small text-muted mb-2">{{ t.wealth.intro }}</p>
      <details class="small text-muted mb-2" data-testid="we-help">
        <summary>{{ t.wealth.helpTitle }}</summary>
        <ul class="mb-0 ps-3">
          <li v-for="x in data.terms" :key="x.days">
            {{ t.wealth.helpTerm(x.days, formatNum(data.unit), x.perUnit, packName(x.goodsId)) }}
          </li>
          <li
            v-for="(x, i) in t.wealth.helpRules(
              data.maxActive,
              formatNum(data.maxTotal),
              pct(data.earlyRate),
              data.minLevel,
            )"
            :key="`r${i}`"
          >
            {{ x }}
          </li>
        </ul>
      </details>
      <p class="small mb-2">{{ t.wealth.myCoin(formatNum(data.coin)) }}</p>

      <div class="dt-card mb-3 small" data-testid="we-box">
        <div class="dt-pills mb-2">
          <button
            v-for="x in data.terms"
            :key="x.days"
            type="button"
            :class="{ active: term === x.days }"
            :aria-pressed="term === x.days"
            :data-testid="`we-term-${x.days}`"
            @click="term = x.days"
          >
            {{ t.wealth.term(x.days, catalog.goodsName(x.goodsId)) }}
          </button>
        </div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <label class="text-nowrap" for="we-qty">{{ t.wealth.qty }}</label>
          <input
            id="we-qty"
            v-model.number="qty"
            type="number"
            min="1"
            :max="leftUnits"
            class="form-control form-control-sm"
            style="width: 6rem"
            data-testid="we-qty"
          />
          <span class="text-nowrap">{{ t.wealth.unitSuffix(formatNum(data.unit)) }}</span>
        </div>
        <div class="text-muted" data-testid="we-left">
          {{ t.wealth.left(formatNum(leftUnits * data.unit)) }}
        </div>
        <div v-if="pick && n >= 1" data-testid="we-summary">
          {{ t.wealth.summary(formatNum(amount), dueAt, packs, packName(pick.goodsId)) }}
        </div>
        <div v-if="blocked" class="text-danger" data-testid="we-blocked">{{ blocked }}</div>
        <div v-else-if="poor" class="text-danger">{{ t.wealth.notEnough }}</div>
        <button
          type="button"
          class="btn btn-sm btn-primary mt-1"
          :disabled="!canDeposit"
          data-testid="we-deposit"
          @click="deposit"
        >
          {{ t.wealth.deposit }}
        </button>
      </div>

      <h6 class="dt-section">{{ t.wealth.mine }}</h6>
      <div v-if="data.deposits.length === 0" class="small text-muted">{{ t.wealth.none }}</div>
      <div v-for="x in data.deposits" :key="x.id" class="dt-item" :data-testid="`we-d-${x.id}`">
        <div class="dt-item-main">
          <div class="dt-item-title">{{ t.wealth.line(formatNum(x.coin), x.days) }}</div>
          <div class="small text-muted">{{ t.wealth.packLine(packName(x.goodsId), x.packs) }}</div>
          <div class="small">
            {{ t.wealth.dueAt(newsTime(x.maturesAt)) }}
            <span v-if="x.mature" class="text-success">{{ t.wealth.mature }}</span>
            <span v-else class="text-muted">{{ remainText(x.maturesAt) }}</span>
          </div>
        </div>
        <div class="dt-item-actions">
          <button
            v-if="x.mature"
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="busy"
            :data-testid="`we-claim-${x.id}`"
            @click="claim(x)"
          >
            {{ t.wealth.claim }}
          </button>
          <button
            v-else
            type="button"
            class="btn btn-sm btn-outline-danger"
            :disabled="busy"
            :data-testid="`we-withdraw-${x.id}`"
            @click="withdraw(x)"
          >
            {{ t.wealth.withdraw(pct(data.earlyRate)) }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
