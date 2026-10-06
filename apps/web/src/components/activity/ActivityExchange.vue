<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { ActivityDto, ExchangeDef } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { actionName } from '../../utils/activity';
import { rewardSummary } from '../../utils/reward';

/** 兑换活动卡片（148-2）：余额、掉落、兑换表 */
const props = defineProps<{
  a: ActivityDto & { kind: 'exchange'; def: ExchangeDef };
  busy: boolean;
  open: boolean;
}>();
const emit = defineEmits<{ exchange: [index: number, times: number] }>();
const catalog = useCatalogStore();
const t = useT();
/** 一次最多兑换几次：和服务端接口的上限相同 */
const MAX_TIMES = 99;
// 输入框清空时 v-model.number 给的是空字符串
const times = reactive<Record<number, number | string>>({});
const bal = (i: number) => props.a.counters[`m${i}`] ?? 0;
const done = (i: number) => props.a.counters[`x${i}`] ?? 0;
const pct = (p: number) => `${Math.round(p * 10000) / 100}%`;
/** 输入框里的次数：没填过算 1；空、0、负数、小数、超过 99 都无效（终审 I1） */
function timesOf(i: number): number | null {
  const v = times[i] ?? 1;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_TIMES ? v : null;
}
const affordable = computed(() =>
  props.a.def.shop.map((s, i) => {
    const n = timesOf(i);
    return (
      n !== null && props.open && done(i) + n <= s.limit && s.cost.every((c) => bal(c.currency) >= c.num * n)
    );
  }),
);
const maxOf = (i: number) => Math.max(1, Math.min(MAX_TIMES, props.a.def.shop[i]!.limit - done(i)));
</script>

<template>
  <div class="mb-2" :data-testid="`balance-${a.id}`">
    <span v-for="(c, i) in a.def.currencies" :key="i" class="badge text-bg-warning me-1"
      >{{ c.name }} {{ bal(i) }}</span
    >
  </div>
  <div class="small text-muted mb-2">{{ t.activity.exchange.rule }}</div>
  <!-- 结束后（兑换期内）不再掉落，不显示今天的掉落计数（backlog 148-2） -->
  <div v-if="a.state === 'running'" class="small text-muted mb-2">
    <div v-for="(r, i) in a.def.drops" :key="i">
      {{
        t.activity.exchange.drop(
          actionName(r.key),
          pct(r.chance),
          a.def.currencies[r.currency]?.name ?? '',
          r.num,
          a.today[`d${i}`] ?? 0,
          r.dailyCap,
        )
      }}
    </div>
  </div>
  <div
    v-for="(s, i) in a.def.shop"
    :key="i"
    class="d-flex flex-wrap align-items-center gap-2 border-bottom py-1"
  >
    <span class="flex-fill small">
      {{ s.cost.map((c) => t.common.qty(a.def.currencies[c.currency]?.name ?? '', c.num)).join(' + ') }}
      → {{ rewardSummary(s.award, catalog) }}
    </span>
    <span class="small text-muted">{{ done(i) }}/{{ s.limit }}</span>
    <input
      v-model.number="times[i]"
      :data-testid="`times-${a.id}-${i}`"
      type="number"
      min="1"
      :max="maxOf(i)"
      class="form-control form-control-sm"
      style="width: 4rem"
      placeholder="1"
    />
    <button
      type="button"
      class="btn btn-sm btn-primary"
      :disabled="busy || !affordable[i]"
      :data-testid="`exchange-${a.id}-${i}`"
      @click="emit('exchange', i, timesOf(i)!)"
    >
      {{ t.activity.exchange.btn }}
    </button>
  </div>
</template>
