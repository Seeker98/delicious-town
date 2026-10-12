<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { WealthDepositDto, WealthViewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import DtEmpty from '../DtEmpty.vue';
import DtSheet from '../DtSheet.vue';
import DtStepper from '../DtStepper.vue';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useConfirmStore } from '../../stores/confirm';
import { useToastStore } from '../../stores/toast';
import { formatNum, shortNum } from '../../utils/format';
import { newsTime } from '../../utils/news';
import { remainText } from '../../utils/remain';
import { serverNowMs } from '../../utils/serverNow';
import { useNow } from '../../composables/useNow';

/**
 * 食材理财（理财设计 §3.4）：锁银币几天，到期本金全退加街市补给包；提前取出退一部分、没有包。
 * 界面改版 P8：“怎么算”收进一行；存一笔是存期三选一、存几份、到期摘要；我存着的一笔一行
 */
const catalog = useCatalogStore();
const confirm = useConfirmStore();
const toast = useToastStore();
const t = useT();
const data = ref<WealthViewDto | null>(null);
const busy = ref(false);
const helpOpen = ref(false);
/** 选中的期限天数；读到的期限里没有它时用第一个 */
const term = ref(3);
/** 存几档（每档 unit 银币） */
const qty = ref(1);

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
/** 确认文案第一行做标题，其余做正文 */
async function ask(text: string, danger = false) {
  const [title = '', ...body] = text.split('\n');
  return confirm.ask({ title, body: body.join('\n'), danger });
}

const pct = (rate: number) => Math.round(rate * 100);
const packName = (goodsId: number) => catalog.goodsName(goodsId);
const pick = computed(() => data.value?.terms.find((x) => x.days === term.value) ?? null);
const used = computed(() => (data.value?.deposits ?? []).reduce((a, x) => a + x.coin, 0));
/** 还能存几档：合计上限减去存着的 */
const leftUnits = computed(() =>
  data.value ? Math.max(0, Math.floor((data.value.maxTotal - used.value) / data.value.unit)) : 0,
);
/** 档数：步进器夹在 1 和还能存的之间；一档都存不了时为 0 */
const n = computed(() =>
  leftUnits.value < 1 ? 0 : Math.min(leftUnits.value, Math.max(1, Math.floor(qty.value))),
);
const amount = computed(() => n.value * (data.value?.unit ?? 0));
const packs = computed(() => n.value * (pick.value?.perUnit ?? 0));
/** 到期了没有：服务端给的 mature，或页面开着时已经过了到期时间（backlog 理财：原来还显示“提前取出”） */
const nowMs = useNow();
const isMature = (x: { mature: boolean; maturesAt: string }) =>
  x.mature || nowMs.value >= Date.parse(x.maturesAt);
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

async function deposit() {
  const p = pick.value;
  const d = data.value;
  if (!p || !d || !canDeposit.value) return;
  const w = t.value.wealth;
  const coin = amount.value;
  if (
    !(await ask(
      w.depositConfirm(formatNum(coin), p.days, packs.value, packName(p.goodsId), pct(d.earlyRate)),
    ))
  )
    return;
  return act(() => endpoints.wealthDeposit(p.days, coin), w.deposited);
}
function claim(x: WealthDepositDto) {
  return act(() => endpoints.wealthClaim(x.id), t.value.wealth.claimed(packName(x.goodsId), x.packs));
}
async function withdraw(x: WealthDepositDto) {
  const w = t.value.wealth;
  if (!(await ask(w.withdrawConfirm(formatNum(x.early), formatNum(x.coin)), true))) return;
  return act(() => endpoints.wealthWithdraw(x.id), w.withdrawn(formatNum(x.early)));
}
onMounted(load);
</script>

<template>
  <div data-testid="wealth-panel">
    <template v-if="data">
      <div class="dt-card dt-rows-card">
        <button type="button" class="dt-row is-link" data-testid="we-help" @click="helpOpen = true">
          <span class="dt-row-main"
            ><span class="dt-row-title">{{ t.wealth.helpTitle }}</span
            ><span class="dt-row-sub">{{ t.wealth.intro }}</span></span
          >
        </button>
      </div>

      <section class="dt-block">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.wealth.tiersTitle }}</h2>
          <span class="dt-block-more">{{ t.wealth.myCoin(formatNum(data.coin)) }}</span>
        </div>
        <div class="dt-card dt-bank-mine" data-testid="we-box">
          <div class="dt-seg dt-seg-tall" role="group" :aria-label="t.wealth.termLabel">
            <button
              v-for="x in data.terms"
              :key="x.days"
              type="button"
              :aria-pressed="term === x.days"
              :data-testid="`we-term-${x.days}`"
              @click="term = x.days"
            >
              {{ t.wealth.termDays(x.days) }}<small>{{ catalog.goodsName(x.goodsId) }}</small
              ><small :data-testid="`we-rate-${x.days}`">{{
                t.wealth.termRate(shortNum(data.unit), x.perUnit)
              }}</small>
            </button>
          </div>
          <div class="dt-field-row">
            <span class="dt-field-label"
              ><b
                >{{ t.wealth.qty }}
                <span class="dt-meta">{{ t.wealth.unitSuffix(formatNum(data.unit)) }}</span></b
              ><small data-testid="we-left">{{
                t.wealth.left(formatNum(leftUnits * data.unit))
              }}</small></span
            >
            <DtStepper
              v-model="qty"
              :min="1"
              :max="Math.max(1, leftUnits)"
              :disabled="leftUnits < 1"
              testid="we-qty"
            />
          </div>
          <div v-if="pick && n >= 1" class="dt-sum" data-testid="we-summary">
            {{ t.wealth.summary(formatNum(amount), dueAt, packs, packName(pick.goodsId)) }}
          </div>
          <div v-if="blocked" class="dt-detail-note text-danger" data-testid="we-blocked">{{ blocked }}</div>
          <div v-else-if="poor" class="dt-detail-note text-danger">{{ t.wealth.notEnough }}</div>
          <button
            type="button"
            class="btn btn-primary dt-btn-block mt-3"
            :disabled="!canDeposit"
            data-testid="we-deposit"
            @click="deposit"
          >
            {{ t.wealth.deposit }}
          </button>
        </div>
      </section>

      <section class="dt-block">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.wealth.mine }}</h2>
        </div>
        <DtEmpty v-if="data.deposits.length === 0" :title="t.wealth.none" />
        <div v-else class="dt-card dt-rows-card">
          <div
            v-for="x in data.deposits"
            :key="x.id"
            class="dt-row dt-row-wrap"
            :data-testid="`we-d-${x.id}`"
          >
            <span class="dt-row-main">
              <span class="dt-row-title is-strong"
                >{{ t.wealth.line(formatNum(x.coin), x.days)
                }}<span v-if="isMature(x)" class="dt-tag-ok">{{ t.wealth.mature }}</span></span
              >
              <span class="dt-row-sub">{{ t.wealth.packLine(packName(x.goodsId), x.packs) }}</span>
              <span class="dt-row-sub"
                >{{ t.wealth.dueAt(newsTime(x.maturesAt))
                }}<template v-if="!isMature(x)"> · {{ remainText(x.maturesAt) }}</template></span
              >
            </span>
            <button
              v-if="isMature(x)"
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
              {{ t.wealth.withdrawShort }}
            </button>
          </div>
        </div>
      </section>

      <DtSheet :open="helpOpen" :title="t.wealth.helpTitle" @close="helpOpen = false">
        <div class="dt-help">
          <p>{{ t.wealth.intro }}</p>
          <ul>
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
        </div>
      </DtSheet>
    </template>
  </div>
</template>
