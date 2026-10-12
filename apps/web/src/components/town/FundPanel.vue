<script setup lang="ts">
import JobCardNote from '../JobCardNote.vue';
import { computed, onMounted, ref } from 'vue';
import type { FundViewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import DtArt from '../DtArt.vue';
import { useConfirmStore } from '../../stores/confirm';
import { useNow } from '../../composables/useNow';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { newsTime } from '../../utils/news';
import { remainText } from '../../utils/remain';

/**
 * 小镇发展基金（240-2）：存一笔银币，到期领回九成加经验勋章，提前取出只退七成。
 * 界面改版 P8：我的存款一张卡（领取 / 提前取出），下面三档一行一档，存着的时候灰掉
 */
const catalog = useCatalogStore();
const toast = useToastStore();
const confirm = useConfirmStore();
/** 确认文案第一行做标题，其余做正文 */
const ask = async (text: string, danger = false) => {
  const [title = '', ...body] = text.split('\n');
  return confirm.ask({ title, body: body.join('\n'), danger });
};
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
    // 被拒多半是状态变了（页面开着时已到期、别处已经存过或领过）：重新读取
    await load();
  } finally {
    busy.value = false;
  }
}
const pct = (rate: number) => Math.round(rate * 100);
const tierName = (key: string) => t.value.fund.tierName(key);
/** 档位附带的限时称号名：按目录取（跟着语言），目录里没有时显示 key */
const iconTitle = (key: string) => catalog.icon(key)?.title ?? key;
const medalIcon = (medal: number) => data.value?.tiers.find((x) => x.medal === medal)?.icon ?? null;
/** 存款的勋章加成：按勋章找档（存入后运营改了档位 key 也能找到） */
const medalRate = (medal: number) => data.value?.tiers.find((x) => x.medal === medal)?.expRate ?? 0;

async function deposit(x: FundViewDto['tiers'][number]) {
  const d = data.value;
  if (!d) return;
  const f = t.value.fund;
  if (!(await ask(f.depositConfirm(tierName(x.key), formatNum(x.coin), formatNum(x.back), d.days)))) return;
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
async function withdraw() {
  const dep = data.value?.deposit;
  if (!dep) return;
  const f = t.value.fund;
  if (!(await ask(f.withdrawConfirm(formatNum(dep.early), formatNum(dep.back)), true))) return;
  return act(
    () => endpoints.fundWithdraw(),
    () => f.withdrawn(formatNum(dep.early)),
  );
}
onMounted(load);
/** 到期了没有：服务端给的 mature，或页面开着时已经过了到期时间（backlog 理财：发展基金同样） */
const nowMs = useNow();
const depositMature = computed(() => {
  const x = data.value?.deposit;
  return !!x && (x.mature || nowMs.value >= Date.parse(x.maturesAt));
});
</script>

<template>
  <div data-testid="fund-panel">
    <template v-if="data">
      <div class="dt-block-note">{{ t.fund.rule(data.days, pct(data.returnRate), pct(data.earlyRate)) }}</div>
      <JobCardNote v-if="data.returnCard" :card="data.returnCard" />
      <section v-if="data.deposit" class="dt-block">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.fund.mine }}</h2>
        </div>
        <div class="dt-card dt-bank-mine" data-testid="fund-mine">
          <div class="dt-bank-mine-head">
            <b>{{ t.fund.depositLine(tierName(data.deposit.tier), formatNum(data.deposit.coin)) }}</b>
            <span v-if="depositMature" class="dt-tag-ok">{{ t.fund.mature }}</span>
            <span v-else class="dt-tag-mute">{{ remainText(data.deposit.maturesAt) }}</span>
          </div>
          <div class="dt-meta">
            {{
              t.fund.medalLine(
                catalog.goodsName(data.deposit.medal),
                pct(data.deposit.expRate ?? medalRate(data.deposit.medal)),
              )
            }}
          </div>
          <div v-if="medalIcon(data.deposit.medal)" class="dt-meta">
            {{ t.fund.iconLine(iconTitle(medalIcon(data.deposit.medal)!)) }}
          </div>
          <div class="dt-meta">{{ t.fund.maturesAt(newsTime(data.deposit.maturesAt)) }}</div>
          <button
            v-if="depositMature"
            type="button"
            class="btn btn-primary dt-btn-block mt-3"
            :disabled="busy"
            data-testid="fund-claim"
            @click="claim"
          >
            {{ t.fund.claim(formatNum(data.deposit.back)) }}
          </button>
          <button
            v-else
            type="button"
            class="btn btn-outline-danger dt-btn-block mt-3"
            :disabled="busy"
            data-testid="fund-withdraw"
            @click="withdraw"
          >
            {{ t.fund.withdraw(formatNum(data.deposit.early)) }}
          </button>
        </div>
      </section>
      <section class="dt-block">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.fund.tiersTitle }}</h2>
          <span class="dt-block-more">{{ t.fund.myCoin(formatNum(data.coin)) }}</span>
        </div>
        <div class="dt-card dt-rows-card">
          <div
            v-for="x in data.tiers"
            :key="x.key"
            class="dt-row dt-row-wrap"
            :data-testid="`fund-tier-${x.key}`"
          >
            <span class="dt-row-ico"><DtArt name="res-medal" :size="24" /></span>
            <span class="dt-row-main">
              <span class="dt-row-title is-strong">{{ tierName(x.key) }}</span>
              <span class="dt-row-sub">{{ t.fund.tierLine(formatNum(x.coin), formatNum(x.back)) }}</span>
              <span class="dt-row-sub"
                >{{ t.fund.medalLine(catalog.goodsName(x.medal), pct(x.expRate)) }} ·
                {{ t.fund.days(data.days) }}</span
              >
              <span v-if="x.icon" class="dt-row-sub">{{ t.fund.iconLine(iconTitle(x.icon)) }}</span>
              <span v-if="!data.deposit && data.coin < x.coin" class="dt-row-sub"
                ><span class="dt-tag-danger">{{ t.fund.notEnough }}</span></span
              >
            </span>
            <button
              type="button"
              class="btn btn-sm btn-outline-primary"
              :disabled="busy || !!data.deposit || data.coin < x.coin"
              :data-testid="`fund-deposit-${x.key}`"
              @click="deposit(x)"
            >
              {{ t.fund.deposit }}
            </button>
          </div>
        </div>
        <div v-if="data.deposit" class="dt-block-note mt-2">{{ t.fund.oneAtATime }}</div>
      </section>
    </template>
  </div>
</template>
