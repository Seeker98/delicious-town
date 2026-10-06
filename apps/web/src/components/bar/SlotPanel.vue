<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, SlotResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const last = ref<SlotResultDto | null>(null);
const exNum = ref(1);

const slot = computed(() => props.data.slot);
function awardName(id: number): string {
  const a = slot.value.pool.find((x) => x.id === id);
  if (!a || a.kind === 'empty' || a.itemId === null) return t.value.bar.slot.empty;
  return a.kind === 'foods' ? catalog.foodName(a.itemId) : catalog.goodsName(a.itemId);
}
/** 抽 times 次的限制原因；空串表示能抽 */
function blockOf(times: number): string {
  if (!slot.value.emailVerified) return t.value.bar.slot.needEmail;
  if (props.data.krabCoins < times) return t.value.bar.slot.noKrab(props.data.krabCoins);
  return '';
}
const block1 = computed(() => blockOf(1));
const block10 = computed(() => blockOf(10));
const blockText = computed(() => block1.value || (block10.value ? t.value.bar.slot.ten(block10.value) : ''));
const spinsText = computed(() =>
  (last.value?.spins ?? []).map((s, i) =>
    t.value.bar.slot.spinLine(i + 1, s.map((id) => awardName(id)).join(' / ')),
  ),
);
const rewardText = computed(() => {
  const rs = last.value?.rewards ?? [];
  const s = t.value.bar.slot;
  return rs.length === 0
    ? s.nothing
    : s.got(rs.map((r) => t.value.common.qty(awardName(r.awardId), r.num)).join(t.value.events.sep));
});
const statTotal = computed(() => slot.value.stats.reduce((s, x) => s + x.num, 0));
const exMax = computed(() => Math.min(99, Math.floor(props.data.tickets / props.data.krabCoinTickets)));
const exN = computed(() => Math.max(1, Math.min(exNum.value || 1, exMax.value)));
const exBlock = computed(() =>
  exMax.value < 1 ? t.value.bar.slot.noTickets(props.data.krabCoinTickets) : '',
);

async function spin(times: number) {
  if (busy.value || blockOf(times)) return;
  busy.value = true;
  try {
    last.value = await endpoints.barSlot(times);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.bar.slot.failed), 'danger');
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
    toast.push(errorMessage(e, t.value.bar.slot.exFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">
      {{ t.bar.slot.rule1 }}<b data-testid="floor-left">{{ slot.floorLeft }}</b
      >{{ t.bar.slot.rule2 }}<span v-if="slot.lamp">{{ t.bar.slot.lamp }}</span>
    </div>
    <div class="d-flex gap-2 mb-1">
      <button class="btn btn-primary" data-testid="slot-1" :disabled="busy || !!block1" @click="spin(1)">
        {{ t.bar.slot.spin1 }}
      </button>
      <button
        class="btn btn-outline-primary"
        data-testid="slot-10"
        :disabled="busy || !!block10"
        :title="block10"
        @click="spin(10)"
      >
        {{ t.bar.slot.spin10 }}
      </button>
    </div>
    <div v-if="blockText" class="text-danger mb-1" data-testid="slot-block">{{ blockText }}</div>
    <div v-if="last" class="mb-2" data-testid="slot-result">
      <div v-for="(line, i) in spinsText" :key="i">{{ line }}</div>
      <div>{{ rewardText }}</div>
    </div>

    <h6 class="mt-3">{{ t.bar.slot.exchange }}</h6>
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
        {{ t.bar.slot.exBtn(exN, exN * data.krabCoinTickets) }}
      </button>
    </div>
    <div v-if="exBlock" class="text-danger mb-1" data-testid="ex-block">{{ exBlock }}</div>

    <h6 class="mt-3">{{ t.bar.slot.pool }}</h6>
    <table class="table table-sm mb-2" data-testid="slot-pool">
      <tbody>
        <tr v-for="a in slot.pool" :key="a.id">
          <td>
            {{ awardName(a.id)
            }}<span v-if="a.rare" class="badge text-bg-warning ms-1">{{ t.bar.slot.rare }}</span>
          </td>
          <td class="text-end">{{ (a.rate * 100).toFixed(2) }}%</td>
        </tr>
      </tbody>
    </table>

    <h6>{{ t.bar.slot.stats }}</h6>
    <div data-testid="slot-stats">
      <span v-if="slot.stats.length === 0" class="text-muted">{{ t.bar.slot.noStats }}</span>
      <template v-else>
        {{ t.bar.slot.statTotal(statTotal)
        }}<span v-for="s in slot.stats" :key="s.awardId" class="me-2">{{
          t.bar.slot.statLine(awardName(s.awardId), s.num)
        }}</span>
      </template>
    </div>
  </div>
</template>
