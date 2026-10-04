<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { KujiAwardDto, KujiDrawDto, KujiViewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { activeLocale } from '../i18n';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import HiphopCard from '../components/hiphop/HiphopCard.vue';

/** 一番赏（一番赏设计 §7.2）：奖池看板、买券、抽签 */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<KujiViewDto | null>(null);
const result = ref<KujiDrawDto | null>(null);
const buyNum = ref<number | ''>(1);
const busy = ref(false);

const awardText = (a: KujiAwardDto) =>
  [
    ...(a.goods ?? []).map((g) => `${catalog.goodsName(g.id)}${g.num > 1 ? ` ×${g.num}` : ''}`),
    ...(a.foods ?? []).map((f) => `${catalog.foodName(f.id)} ×${f.num}`),
    ...(a.diamond ? [t.value.kuji.diamond(formatNum(a.diamond))] : []),
    ...(a.coin ? [t.value.kuji.coin(formatNum(a.coin))] : []),
    ...(a.exp ? [t.value.kuji.exp(formatNum(a.exp))] : []),
    ...(a.renown ? [t.value.kuji.renown(formatNum(a.renown))] : []),
  ].join(t.value.events.sep);
const tierName = (k: string) => (k === 'last' ? t.value.kuji.lastTier : t.value.kuji.tier(k));
const recentTime = (iso: string) => new Date(iso).toLocaleString(activeLocale());
const canDraw = (n: number) =>
  !!data.value &&
  !busy.value &&
  !data.value.closedToday &&
  data.value.tickets >= n &&
  data.value.pool.left >= n &&
  n <= data.value.maxDraw;

/**
 * 抽签按钮（backlog 一番赏）：1、5、10 里不超过单次上限的，上限大于 10 时再加一个按上限抽；
 * 池里剩下的不到一个按钮时，加一个"抽完剩下的"
 */
const drawOptions = computed(() => {
  const v = data.value;
  if (!v) return [];
  const out = [1, 5, 10].filter((n) => n <= v.maxDraw);
  if (v.maxDraw > 10) out.push(v.maxDraw);
  const left = v.pool.left;
  if (left > 1 && left <= v.maxDraw && !out.includes(left)) out.push(left);
  return out.sort((a, b) => a - b);
});
/** 买券数量：要整数，且不超过今天还能买的（backlog 一番赏） */
const buyHint = computed(() => {
  const v = data.value;
  const n = Number(buyNum.value);
  if (!v || buyNum.value === '') return '';
  if (!Number.isInteger(n) || n < 1) return t.value.kuji.buyInt;
  if (n > v.buyLeft) return t.value.kuji.buyMax(v.buyLeft);
  return '';
});
const buyOk = computed(() => buyNum.value !== '' && buyHint.value === '');

async function load() {
  try {
    data.value = await endpoints.kuji();
  } catch (e) {
    toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}
async function buy() {
  const n = Number(buyNum.value);
  if (!Number.isInteger(n) || n < 1) return;
  busy.value = true;
  try {
    data.value = await endpoints.kujiBuy(n);
    toast.push(t.value.kuji.bought(n));
  } catch (e) {
    toast.push(errorMessage(e, t.value.kuji.buyFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
async function draw(n: number) {
  busy.value = true;
  try {
    const r = await endpoints.kujiDraw(n);
    result.value = r;
    data.value = r.view;
  } catch (e) {
    toast.push(errorMessage(e, t.value.kuji.drawFailed), 'danger');
    await load();
  } finally {
    busy.value = false;
  }
}
onMounted(() => void load());
</script>

<template>
  <h5>{{ t.kuji.title }}</h5>
  <HiphopCard :place="12" />
  <div class="small text-muted mb-2">
    {{ t.kuji.rule(data?.pool.total ?? 80) }}
  </div>
  <template v-if="data">
    <!-- 月度主题（问题记录 274）：A/B/C/最后赏的手办只在这个月抽得到 -->
    <div v-if="data.theme" class="dt-note small mb-2" data-testid="kj-theme">
      <b>{{
        t.kuji.theme(data.theme.month, catalog.data('kujiThemes', data.theme.month)?.name ?? data.theme.name)
      }}</b>
      <span class="ms-1"
        >{{ catalog.data('kujiThemes', data.theme.month)?.desc ?? data.theme.desc
        }}{{ t.kuji.themeLimited }}</span
      >
    </div>
    <div v-if="data.closedToday" class="alert alert-warning py-1 small mb-2" data-testid="kj-closed">
      {{ t.kuji.closed }}
    </div>
    <div class="dt-card mb-2" data-testid="kj-pool">
      <span class="dt-card-title">{{ t.kuji.pool(data.pool.day, data.pool.seq) }}</span>
      <span class="ms-2 small">{{ t.kuji.left(data.pool.left, data.pool.total) }}</span>
    </div>
    <table class="table table-sm small mb-2">
      <tbody>
        <tr
          v-for="x in data.tiers"
          :key="x.key"
          :class="x.left === 0 ? 'opacity-50' : ''"
          :data-testid="`kj-tier-${x.key}`"
        >
          <td class="text-nowrap">
            <b>{{ tierName(x.key) }}</b
            ><span v-if="x.big" class="badge text-bg-warning ms-1">{{ t.kuji.big }}</span>
          </td>
          <td>
            {{ awardText(x.award) }}<span v-if="x.icon" class="text-muted">{{ t.kuji.icon }}</span>
          </td>
          <td class="text-end text-nowrap">{{ x.left }} / {{ x.count }}</td>
        </tr>
        <tr data-testid="kj-last">
          <td>
            <b>{{ t.kuji.lastTier }}</b>
          </td>
          <td>
            {{ awardText(data.last.award)
            }}<span v-if="data.last.icon" class="text-muted">{{ t.kuji.icon }}</span>
          </td>
          <td class="text-end text-muted">{{ t.kuji.lastWho }}</td>
        </tr>
      </tbody>
    </table>
    <div class="dt-card mb-2 small">
      <div class="mb-1" data-testid="kj-tickets">{{ t.kuji.tickets(data.tickets) }}</div>
      <div class="mb-1 text-muted" data-testid="kj-coin">{{ t.kuji.balance(formatNum(data.coin)) }}</div>
      <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
        {{ t.kuji.buyPrefix }}
        <input
          v-model.number="buyNum"
          type="number"
          min="1"
          :max="data.buyLeft"
          class="form-control form-control-sm"
          style="width: 5rem"
          data-testid="kj-buy-num"
        />
        <template v-if="buyOk">{{ t.kuji.buyTotal(formatNum(Number(buyNum) * data.price)) }}</template>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          :disabled="busy || data.buyLeft === 0 || !buyOk"
          data-testid="kj-buy"
          @click="buy"
        >
          {{ t.kuji.buy }}
        </button>
        <span class="text-muted">{{ t.kuji.buyLeft(data.buyLeft) }}</span>
        <span v-if="buyHint" class="text-danger" data-testid="kj-buy-hint">{{ buyHint }}</span>
      </div>
      <div class="d-flex gap-2">
        <button
          v-for="n in drawOptions"
          :key="n"
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="!canDraw(n)"
          :data-testid="`kj-draw-${n}`"
          @click="draw(n)"
        >
          {{ t.kuji.draw(n) }}
        </button>
      </div>
    </div>
    <div v-if="result" class="dt-card mb-2 small" data-testid="kj-result">
      <b>{{ t.kuji.result }}</b>
      <div v-for="(x, i) in result.draws" :key="i">
        {{ t.kuji.drawLine(tierName(x.tier), awardText(x.award)) }}
      </div>
      <div v-if="result.last" class="text-success fw-bold">
        {{ t.kuji.lastWon(awardText(result.last)) }}
      </div>
    </div>
    <h6 class="dt-section">{{ t.kuji.recent }}</h6>
    <div data-testid="kj-recent" class="small">
      <div v-if="data.recent.length === 0" class="text-muted">{{ t.kuji.noRecent }}</div>
      <div v-for="(x, i) in data.recent" :key="i" class="border-bottom py-1">
        {{ t.kuji.recentLine(x.restName, tierName(x.tier)) }}
        <span class="text-muted">{{ recentTime(x.at) }}</span>
      </div>
    </div>
  </template>
</template>
