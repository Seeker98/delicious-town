<script setup lang="ts">
import { BOOSTS, boostDefOf, type BoostActivityDef } from '@dt/shared';
import { errsUnder } from '../../../utils/activityForm';

const props = defineProps<{ modelValue: BoostActivityDef; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [BoostActivityDef] }>();
type Item = BoostActivityDef['items'][number];
const set = (items: Item[]) => emit('update:modelValue', { items });
const setItem = (i: number, p: Partial<Item>) =>
  set(props.modelValue.items.map((x, j) => (j === i ? { ...x, ...p } : x)));
const range = (key: string) => {
  const d = boostDefOf(key);
  return d ? `${d.min}~${d.max}` : '';
};
const unused = () =>
  Object.keys(BOOSTS).find((k) => !props.modelValue.items.some((i) => i.key === k)) ?? 'exp';
</script>

<template>
  <div v-if="errors['def.items']" class="text-danger small">{{ errors['def.items'] }}</div>
  <div v-for="(it, i) in modelValue.items" :key="i" class="d-flex gap-2 align-items-center py-1">
    <select
      class="form-select form-select-sm w-auto"
      :value="it.key"
      :data-testid="`boost-key-${i}`"
      @change="setItem(i, { key: ($event.target as HTMLSelectElement).value, factor: 1 })"
    >
      <option v-for="(d, k) in BOOSTS" :key="k" :value="k">{{ d.label }}</option>
    </select>
    ×
    <input
      type="number"
      step="0.01"
      class="form-control form-control-sm"
      style="width: 6rem"
      :value="it.factor"
      :data-testid="`boost-factor-${i}`"
      @input="setItem(i, { factor: Number(($event.target as HTMLInputElement).value) })"
    />
    <span class="small text-muted" :data-testid="`boost-range-${i}`">{{ range(it.key) }}</span>
    <button
      type="button"
      class="btn btn-sm btn-link text-danger"
      :disabled="modelValue.items.length <= 1"
      @click="set(modelValue.items.filter((_, j) => j !== i))"
    >
      删除
    </button>
    <span
      v-for="[k, m] in errsUnder(errors, `def.items.${i}.`)"
      :key="k"
      class="text-danger small"
      :data-testid="`err-${k}`"
      >{{ m }}</span
    >
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary mt-1"
    data-testid="boost-add"
    :disabled="modelValue.items.length >= 10"
    @click="set([...modelValue.items, { key: unused(), factor: 1 }])"
  >
    加一项
  </button>
</template>
