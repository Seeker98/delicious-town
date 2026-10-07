<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AcquireRestDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { acquireReason, errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { sellerGets } from '../../utils/acquire';
import { formatNum, formatPct } from '../../utils/format';
import { remainText } from '../../utils/remain';

/** 对方餐厅页的收购卡片（设计 §1.5）：身价、老板、挂牌，能收购、能买下时带按钮，不能时写原因 */
const props = defineProps<{ restId: number }>();
const t = useT();
const toast = useToastStore();
const r = ref<AcquireRestDto | null>(null);
/** 卡片上的原因：封号、关联账号都用同一句笼统的话，不让人从好友页看出谁被封、谁和自己共用设备（终审 Minor 3） */
const reasonText = (block: string) => acquireReason(block);
const busy = ref(false);

async function load() {
  try {
    r.value = await endpoints.acquireRest(props.restId);
  } catch {
    // 读不到（区服关了收购、店不在本区服）就不显示卡片
    r.value = null;
  }
}

async function buy(way: 'acquire' | 'listed') {
  const x = r.value;
  if (!x || busy.value) return;
  const cost = way === 'acquire' ? x.price : (x.listed?.price ?? x.price);
  const got = sellerGets(cost, x.taxRate);
  const a = t.value.acquire;
  const ask = way === 'acquire' ? a.confirmAcquire : a.confirmListed;
  const coin = formatNum;
  if (!window.confirm(ask(x.name, coin(cost), x.owner?.name ?? x.name, coin(got), coin(cost - got)))) return;
  busy.value = true;
  try {
    await endpoints.acquireBuy(x.restId, way, cost);
    toast.push(a.bought(x.name));
  } catch (e) {
    toast.push(errorMessage(e, a.failed), 'danger');
  } finally {
    busy.value = false;
    await load();
  }
}
onMounted(load);
</script>

<template>
  <div v-if="r" class="border rounded p-2 mb-2 small" data-testid="acquire-card">
    <div class="fw-bold">{{ t.acquire.cardTitle }}</div>
    <!-- 还没有身价（不到 2 星）：服务端照样估了个下限价，不写，免得和“还没有身价”打架 -->
    <div v-if="r.acquireBlock !== 'no_state'">
      {{ t.acquire.price(formatNum(r.price)) }} · {{ t.acquire.heat(formatNum(Number(r.heat.toFixed(2)))) }}
    </div>
    <div class="text-muted">{{ r.owner ? t.acquire.owner(r.owner.name) : t.acquire.free }}</div>
    <div v-if="r.listed">
      {{
        t.acquire.listed(
          formatPct(r.listed.rate, { digits: 0 }),
          formatNum(r.listed.price),
          remainText(r.listed.until),
        )
      }}
    </div>
    <div v-if="r.protectedUntil" class="text-muted">
      {{ t.acquire.protectedLeft(remainText(r.protectedUntil)) }}
    </div>
    <div class="d-flex flex-wrap align-items-center gap-1 mt-1">
      <button
        v-if="r.acquireBlock === null"
        class="btn btn-sm btn-primary"
        :disabled="busy"
        data-testid="card-acquire"
        @click="buy('acquire')"
      >
        {{ t.acquire.acquire }}
      </button>
      <!-- 被封号的店不写原因（审查 Minor 3；终审：只有封号用笼统说法，反而认得出来） -->
      <span
        v-else-if="r.acquireBlock !== 'self' && r.acquireBlock !== 'banned'"
        class="text-muted"
        data-testid="card-block"
        >{{ reasonText(r.acquireBlock) }}</span
      >
      <button
        v-if="r.listed && r.listedBlock === null"
        class="btn btn-sm btn-outline-primary"
        :disabled="busy"
        data-testid="card-listed"
        @click="buy('listed')"
      >
        {{ t.acquire.buyListed }}
      </button>
    </div>
  </div>
</template>
