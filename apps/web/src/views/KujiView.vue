<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { KujiAwardDto, KujiDrawDto, KujiViewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

/** 一番赏（一番赏设计 §7.2）：奖池看板、买券、抽签 */
const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<KujiViewDto | null>(null);
const result = ref<KujiDrawDto | null>(null);
const buyNum = ref<number | ''>(1);
const busy = ref(false);

const awardText = (a: KujiAwardDto) =>
  [
    ...(a.goods ?? []).map((g) => `${catalog.goodsName(g.id)}${g.num > 1 ? ` ×${g.num}` : ''}`),
    ...(a.foods ?? []).map((f) => `${catalog.foodName(f.id)} ×${f.num}`),
    ...(a.diamond ? [`钻石 ${formatNum(a.diamond)}`] : []),
    ...(a.coin ? [`银币 ${formatNum(a.coin)}`] : []),
    ...(a.exp ? [`经验 ${formatNum(a.exp)}`] : []),
    ...(a.renown ? [`声望 ${formatNum(a.renown)}`] : []),
  ].join('、');
const tierName = (k: string) => (k === 'last' ? '最后赏' : `${k} 赏`);
const canDraw = (n: number) =>
  !!data.value &&
  !busy.value &&
  !data.value.closedToday &&
  data.value.tickets >= n &&
  data.value.pool.left >= n &&
  n <= data.value.maxDraw;

async function load() {
  try {
    data.value = await endpoints.kuji();
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
async function buy() {
  const n = Number(buyNum.value);
  if (!Number.isInteger(n) || n < 1) return;
  busy.value = true;
  try {
    data.value = await endpoints.kujiBuy(n);
    toast.push(`买了 ${n} 张抽赏券`);
  } catch (e) {
    toast.push(errorMessage(e, '购买失败'), 'danger');
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
    toast.push(errorMessage(e, '抽签失败'), 'danger');
    await load();
  } finally {
    busy.value = false;
  }
}
onMounted(() => void load());
</script>

<template>
  <h5>一番赏</h5>
  <div class="small text-muted mb-2">
    一池共 {{ data?.pool.total ?? 80 }} 张签，抽一张少一张；抽走最后一张的人另得最后赏。每天 0
    点开新池，没抽完的当天作废。
  </div>
  <template v-if="data">
    <!-- 月度主题（问题记录 274）：A/B/C/最后赏的手办只在这个月抽得到 -->
    <div v-if="data.theme" class="alert alert-info py-1 small mb-2" data-testid="kj-theme">
      <b>{{ data.theme.month }} 月主题：{{ data.theme.name }}</b>
      <span class="ms-1">{{ data.theme.desc }}本月的限定手办只在这个月抽得到。</span>
    </div>
    <div v-if="data.closedToday" class="alert alert-warning py-1 small mb-2" data-testid="kj-closed">
      今天的奖池都抽完了，明天 0 点再来。
    </div>
    <div class="dt-card mb-2" data-testid="kj-pool">
      <b>{{ data.pool.day }} 第 {{ data.pool.seq }} 池</b>
      <span class="ms-2">剩 {{ data.pool.left }} / {{ data.pool.total }}</span>
    </div>
    <table class="table table-sm small mb-2">
      <tbody>
        <tr
          v-for="t in data.tiers"
          :key="t.key"
          :class="t.left === 0 ? 'opacity-50' : ''"
          :data-testid="`kj-tier-${t.key}`"
        >
          <td class="text-nowrap">
            <b>{{ tierName(t.key) }}</b
            ><span v-if="t.big" class="badge text-bg-warning ms-1">大赏</span>
          </td>
          <td>{{ awardText(t.award) }}<span v-if="t.icon" class="text-muted">（附限定图标）</span></td>
          <td class="text-end text-nowrap">{{ t.left }} / {{ t.count }}</td>
        </tr>
        <tr data-testid="kj-last">
          <td><b>最后赏</b></td>
          <td>
            {{ awardText(data.last.award)
            }}<span v-if="data.last.icon" class="text-muted">（附限定图标）</span>
          </td>
          <td class="text-end text-muted">抽走最后一张的人</td>
        </tr>
      </tbody>
    </table>
    <div class="dt-card mb-2 small">
      <div class="mb-1" data-testid="kj-tickets">我的抽赏券：{{ data.tickets }} 张</div>
      <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
        买
        <input
          v-model.number="buyNum"
          type="number"
          min="1"
          :max="data.buyLeft"
          class="form-control form-control-sm"
          style="width: 5rem"
          data-testid="kj-buy-num"
        />
        张，共 {{ formatNum(Number(buyNum || 0) * data.price) }} 银币
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          :disabled="busy || data.buyLeft === 0"
          data-testid="kj-buy"
          @click="buy"
        >
          买券
        </button>
        <span class="text-muted">今天还能买 {{ data.buyLeft }} 张</span>
      </div>
      <div class="d-flex gap-2">
        <button
          v-for="n in [1, 5, 10]"
          :key="n"
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="!canDraw(n)"
          :data-testid="`kj-draw-${n}`"
          @click="draw(n)"
        >
          抽 {{ n }} 张
        </button>
      </div>
    </div>
    <div v-if="result" class="dt-card mb-2 small" data-testid="kj-result">
      <b>抽签结果</b>
      <div v-for="(x, i) in result.draws" :key="i">{{ tierName(x.tier) }}：{{ awardText(x.award) }}</div>
      <div v-if="result.last" class="text-success fw-bold">
        恭喜抽走最后一张签，拿下最后赏：{{ awardText(result.last) }}
      </div>
    </div>
    <h6 class="dt-section">最近的大赏</h6>
    <div data-testid="kj-recent" class="small">
      <div v-if="data.recent.length === 0" class="text-muted">还没有人抽中大赏</div>
      <div v-for="(x, i) in data.recent" :key="i" class="border-bottom py-1">
        {{ x.restName }} 抽中了 {{ tierName(x.tier) }}
        <span class="text-muted">{{ new Date(x.at).toLocaleString('zh-CN') }}</span>
      </div>
    </div>
  </template>
</template>
