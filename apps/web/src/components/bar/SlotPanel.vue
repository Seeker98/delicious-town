<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, SlotResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const last = ref<SlotResultDto | null>(null);
const exNum = ref(1);

const slot = computed(() => props.data.slot);
function awardName(id: number): string {
  const a = slot.value.pool.find((x) => x.id === id);
  if (!a || a.kind === 'empty' || a.itemId === null) return '空';
  return a.kind === 'foods' ? catalog.foodName(a.itemId) : catalog.goodsName(a.itemId);
}
/** 抽 times 次的限制原因；空串表示能抽 */
function blockOf(times: number): string {
  if (!slot.value.emailVerified) return '老虎机要先验证邮箱';
  if (props.data.krabCoins < times) return `蟹币不够（每次 1 个，持有 ${props.data.krabCoins} 个）`;
  return '';
}
const block1 = computed(() => blockOf(1));
const block10 = computed(() => blockOf(10));
const blockText = computed(() => block1.value || (block10.value ? `抽 10 次：${block10.value}` : ''));
const spinsText = computed(() =>
  (last.value?.spins ?? []).map((s, i) => `第 ${i + 1} 次：${s.map((id) => awardName(id)).join(' / ')}`),
);
const rewardText = computed(() => {
  const rs = last.value?.rewards ?? [];
  return rs.length === 0
    ? '什么也没抽到'
    : `得到 ${rs.map((r) => `${awardName(r.awardId)}×${r.num}`).join('、')}`;
});
const statTotal = computed(() => slot.value.stats.reduce((s, x) => s + x.num, 0));
const exMax = computed(() => Math.min(99, Math.floor(props.data.tickets / props.data.krabCoinTickets)));
const exN = computed(() => Math.max(1, Math.min(exNum.value || 1, exMax.value)));
const exBlock = computed(() =>
  exMax.value < 1 ? `神秘礼券不够（${props.data.krabCoinTickets} 张换 1 个蟹币）` : '',
);

async function spin(times: number) {
  if (busy.value || blockOf(times)) return;
  busy.value = true;
  try {
    last.value = await endpoints.barSlot(times);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '老虎机失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
async function exchange() {
  if (busy.value || exBlock.value) return;
  busy.value = true;
  try {
    await endpoints.barExchange(exN.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '兑换失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">
      每次 1 个蟹币，开 3 格。最多再抽 <b data-testid="floor-left">{{ slot.floorLeft }}</b> 次必出稀有<span
        v-if="slot.lamp"
        >（有神灯：提前出保底的机会翻倍）</span
      >
    </div>
    <div class="d-flex gap-2 mb-1">
      <button class="btn btn-primary" data-testid="slot-1" :disabled="busy || !!block1" @click="spin(1)">
        抽 1 次
      </button>
      <button
        class="btn btn-outline-primary"
        data-testid="slot-10"
        :disabled="busy || !!block10"
        :title="block10"
        @click="spin(10)"
      >
        抽 10 次
      </button>
    </div>
    <div v-if="blockText" class="text-danger mb-1" data-testid="slot-block">{{ blockText }}</div>
    <div v-if="last" class="mb-2" data-testid="slot-result">
      <div v-for="(line, i) in spinsText" :key="i">{{ line }}</div>
      <div>{{ rewardText }}</div>
    </div>

    <h6 class="mt-3">礼券换蟹币</h6>
    <div class="d-flex gap-1 align-items-center mb-1">
      <input
        v-model.number="exNum"
        type="number"
        min="1"
        :max="Math.max(1, exMax)"
        class="form-control form-control-sm"
        style="width: 80px"
        data-testid="ex-num"
      />
      <button
        class="btn btn-sm btn-outline-success text-nowrap"
        data-testid="ex-go"
        :disabled="busy || !!exBlock"
        @click="exchange"
      >
        换 {{ exN }} 个（{{ exN * data.krabCoinTickets }} 张礼券）
      </button>
    </div>
    <div v-if="exBlock" class="text-danger mb-1" data-testid="ex-block">{{ exBlock }}</div>

    <h6 class="mt-3">奖池</h6>
    <table class="table table-sm mb-2" data-testid="slot-pool">
      <tbody>
        <tr v-for="a in slot.pool" :key="a.id">
          <td>{{ awardName(a.id) }}<span v-if="a.rare" class="badge text-bg-warning ms-1">稀有</span></td>
          <td class="text-end">{{ (a.rate * 100).toFixed(2) }}%</td>
        </tr>
      </tbody>
    </table>

    <h6>我的统计</h6>
    <div data-testid="slot-stats">
      <span v-if="slot.stats.length === 0" class="text-muted">还没抽过</span>
      <template v-else>
        共 {{ statTotal }} 格：<span v-for="s in slot.stats" :key="s.awardId" class="me-2"
          >{{ awardName(s.awardId) }} {{ s.num }} 格</span
        >
      </template>
    </div>
  </div>
</template>
