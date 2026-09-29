<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { MarketDto, MarketItemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<MarketDto | null>(null);
const qty = reactive<Record<number, number>>({});
const picks = ref<number[]>([]);
const busy = ref(false);
const guessOpen = ref(false);

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const sections = [
  { key: 'daily', title: '日常菜场', next: 'nextDaily' },
  { key: 'special', title: '特价菜场（需验证邮箱，每人 1 份）', next: 'nextSpecial' },
  { key: 'premium', title: '高级菜场（需爱心项链）', next: 'nextPremium' },
] as const;

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
const buy = (it: MarketItemDto) => run(() => endpoints.marketBuy(it.id, qty[it.id] ?? 1), '购买失败');
function togglePick(id: number) {
  const i = picks.value.indexOf(id);
  if (i >= 0) picks.value.splice(i, 1);
  else if (data.value && picks.value.length < data.value.guess.maxPick) picks.value.push(id);
}
const joinGuess = () => run(() => endpoints.marketGuess([...picks.value]), '竞猜失败');
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取菜场失败'), 'danger')));
</script>

<template>
  <template v-if="data">
    <section v-for="s in sections" :key="s.key" class="mb-3">
      <div class="d-flex align-items-center">
        <h6 class="mb-1">{{ s.title }}</h6>
        <span class="small text-muted ms-auto">下次进货 {{ time(data[s.next]) }}</span>
      </div>
      <div v-if="data[s.key].length === 0" class="small text-muted">还没有进货</div>
      <div
        v-for="it in data[s.key]"
        :key="it.id"
        class="d-flex align-items-center gap-2 border-bottom py-1 small"
      >
        <div class="flex-fill">
          <b>{{ catalog.foodName(it.foodsId) }}</b>
          <span v-if="it.hot" class="badge bg-danger ms-1">热门</span>
          <div class="text-muted">
            {{ formatNum(it.price) }} 银币 · 剩 {{ formatNum(it.left) }} · 限购 {{ it.bought }}/{{ it.limit }}
          </div>
        </div>
        <input
          v-model.number="qty[it.id]"
          :data-testid="`qty-${it.id}`"
          type="number"
          min="1"
          :max="it.limit"
          class="form-control form-control-sm"
          style="width: 72px"
        />
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`buy-${it.id}`"
          :disabled="busy || it.left <= 0 || it.bought >= it.limit"
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
