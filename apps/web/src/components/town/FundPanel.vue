<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { FundViewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { newsTime } from '../../utils/news';
import { remainText } from '../../utils/remain';

/** 小镇发展基金（240-2）：存一笔银币，到期领回九成加经验勋章，提前取出只退七成 */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<FundViewDto | null>(null);
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.fund();
  } catch (e) {
    toast.push(errorMessage(e, t.value.fund.loadFailed), 'danger');
  }
}
async function act(fn: () => Promise<FundViewDto>, done: (v: FundViewDto) => string) {
  if (busy.value) return;
  busy.value = true;
  try {
    const v = await fn();
    data.value = v;
    toast.push(done(v));
  } catch (e) {
    toast.push(errorMessage(e, t.value.fund.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
const pct = (rate: number) => Math.round(rate * 100);
const tierName = (key: string) => t.value.fund.tierName(key);
/** 存款的勋章加成：按勋章找档（存入后运营改了档位 key 也能找到） */
const medalRate = (medal: number) => data.value?.tiers.find((x) => x.medal === medal)?.expRate ?? 0;

function deposit(x: FundViewDto['tiers'][number]) {
  const d = data.value;
  if (!d) return;
  const f = t.value.fund;
  if (!window.confirm(f.depositConfirm(tierName(x.key), formatNum(x.coin), formatNum(x.back), d.days)))
    return;
  return act(
    () => endpoints.fundDeposit(x.key),
    () => f.deposited(tierName(x.key)),
  );
}
function claim() {
  return act(
    () => endpoints.fundClaim(),
    () => t.value.fund.claimed,
  );
}
function withdraw() {
  const dep = data.value?.deposit;
  if (!dep) return;
  const f = t.value.fund;
  if (!window.confirm(f.withdrawConfirm(formatNum(dep.early), formatNum(dep.back)))) return;
  return act(
    () => endpoints.fundWithdraw(),
    () => f.withdrawn(formatNum(dep.early)),
  );
}
onMounted(load);
</script>

<template>
  <div data-testid="fund-panel">
    <template v-if="data">
      <p class="small text-muted mb-2">
        {{ t.fund.rule(data.days, pct(data.returnRate), pct(data.earlyRate)) }}
      </p>
      <p class="small mb-2">{{ t.fund.myCoin(formatNum(data.coin)) }}</p>
      <template v-if="data.deposit">
        <div class="fw-bold small mb-1">{{ t.fund.mine }}</div>
        <div class="dt-item" data-testid="fund-mine">
          <div class="dt-item-main">
            <div class="dt-item-title">
              {{ t.fund.depositLine(tierName(data.deposit.tier), formatNum(data.deposit.coin)) }}
            </div>
            <div class="small text-muted">
              {{
                t.fund.medalLine(catalog.goodsName(data.deposit.medal), pct(medalRate(data.deposit.medal)))
              }}
            </div>
            <div class="small">
              {{ t.fund.maturesAt(newsTime(data.deposit.maturesAt)) }}
              <span v-if="data.deposit.mature" class="text-success">{{ t.fund.mature }}</span>
              <span v-else class="text-muted">{{ remainText(data.deposit.maturesAt) }}</span>
            </div>
          </div>
        </div>
        <button
          v-if="data.deposit.mature"
          class="btn btn-sm btn-success mt-2"
          :disabled="busy"
          data-testid="fund-claim"
          @click="claim"
        >
          {{ t.fund.claim(formatNum(data.deposit.back)) }}
        </button>
        <button
          v-else
          class="btn btn-sm btn-outline-danger mt-2"
          :disabled="busy"
          data-testid="fund-withdraw"
          @click="withdraw"
        >
          {{ t.fund.withdraw(formatNum(data.deposit.early)) }}
        </button>
      </template>
      <template v-else>
        <div v-for="x in data.tiers" :key="x.key" class="dt-item" :data-testid="`fund-tier-${x.key}`">
          <div class="dt-item-main">
            <div class="dt-item-title">{{ tierName(x.key) }}</div>
            <div class="small">{{ t.fund.tierLine(formatNum(x.coin), formatNum(x.back)) }}</div>
            <div class="small text-muted">
              {{ t.fund.medalLine(catalog.goodsName(x.medal), pct(x.expRate)) }} ·
              {{ t.fund.days(data.days) }}
            </div>
            <div v-if="data.coin < x.coin" class="small text-danger">{{ t.fund.notEnough }}</div>
          </div>
          <div class="dt-item-actions">
            <button
              class="btn btn-sm btn-primary"
              :disabled="busy || data.coin < x.coin"
              :data-testid="`fund-deposit-${x.key}`"
              @click="deposit(x)"
            >
              {{ t.fund.deposit }}
            </button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
