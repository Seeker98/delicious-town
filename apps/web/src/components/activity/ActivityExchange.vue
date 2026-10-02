<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { ActivityDto, ExchangeDef } from '@dt/shared';
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
const times = reactive<Record<number, number>>({});
const bal = (i: number) => props.a.counters[`m${i}`] ?? 0;
const done = (i: number) => props.a.counters[`x${i}`] ?? 0;
const pct = (p: number) => `${Math.round(p * 10000) / 100}%`;
const affordable = computed(() =>
  props.a.def.shop.map((s, i) => {
    const n = times[i] ?? 1;
    return props.open && done(i) + n <= s.limit && s.cost.every((c) => bal(c.currency) >= c.num * n);
  }),
);
</script>

<template>
  <div class="mb-2" :data-testid="`balance-${a.id}`">
    <span v-for="(c, i) in a.def.currencies" :key="i" class="badge text-bg-warning me-1"
      >{{ c.name }} {{ bal(i) }}</span
    >
  </div>
  <div class="small text-muted mb-2">
    <div v-for="(r, i) in a.def.drops" :key="i">
      {{ actionName(r.key) }} {{ pct(r.chance) }} 掉 {{ a.def.currencies[r.currency]?.name }} ×{{
        r.num
      }}
      （今天 {{ a.today[`d${i}`] ?? 0 }}/{{ r.dailyCap }}）
    </div>
  </div>
  <div
    v-for="(s, i) in a.def.shop"
    :key="i"
    class="d-flex flex-wrap align-items-center gap-2 border-bottom py-1"
  >
    <span class="flex-fill small">
      {{ s.cost.map((c) => `${a.def.currencies[c.currency]?.name} ×${c.num}`).join(' + ') }}
      → {{ rewardSummary(s.award, catalog) }}
    </span>
    <span class="small text-muted">{{ done(i) }}/{{ s.limit }}</span>
    <input
      v-model.number="times[i]"
      type="number"
      min="1"
      class="form-control form-control-sm"
      style="width: 4rem"
      placeholder="1"
    />
    <button
      type="button"
      class="btn btn-sm btn-primary"
      :disabled="busy || !affordable[i]"
      :data-testid="`exchange-${a.id}-${i}`"
      @click="emit('exchange', i, times[i] ?? 1)"
    >
      兑换
    </button>
  </div>
</template>
