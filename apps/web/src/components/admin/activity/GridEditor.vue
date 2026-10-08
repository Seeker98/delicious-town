<script setup lang="ts">
import { ref, watch } from 'vue';
import { ACTIVITY_ACTIONS, type GridDef } from '@dt/shared';
import { errUnder, newGoal } from '../../../utils/activityForm';
import RewardItemsEditor from '../RewardItemsEditor.vue';
import GoalRow from './GoalRow.vue';

const props = defineProps<{ modelValue: GridDef; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [GridDef] }>();
const picked = ref(0);
const patch = (p: Partial<GridDef>) => emit('update:modelValue', { ...props.modelValue, ...p });
function resize(size: 3 | 4) {
  const n = size * size;
  const cells = props.modelValue.cells.slice(0, n);
  while (cells.length < n) cells.push(newGoal());
  picked.value = 0;
  patch({ size, cells });
}
const cellErr = (i: number) => Object.keys(props.errors).some((k) => k.startsWith(`def.cells.${i}.`));
/** 保存出错时，当前格子没错就跳到第一个出错的格子（backlog 148-1），否则错误藏在没选中的格子里 */
watch(
  () => props.errors,
  () => {
    if (cellErr(picked.value)) return;
    const first = props.modelValue.cells.findIndex((_, i) => cellErr(i));
    if (first >= 0) picked.value = first;
  },
);
</script>

<template>
  <label class="form-label small">尺寸</label>
  <select
    class="form-select form-select-sm w-auto mb-2"
    data-testid="grid-size"
    :value="modelValue.size"
    @change="resize(Number(($event.target as HTMLSelectElement).value) as 3 | 4)"
  >
    <option :value="3">3×3</option>
    <option :value="4">4×4</option>
  </select>
  <div class="dt-grid-board" :style="{ gridTemplateColumns: `repeat(${modelValue.size}, 1fr)` }">
    <button
      v-for="(c, i) in modelValue.cells"
      :key="i"
      type="button"
      :class="['dt-grid-cell btn btn-sm', { 'border-primary': picked === i, 'border-danger': cellErr(i) }]"
      :data-testid="`grid-cell-${i}`"
      @click="picked = i"
    >
      {{ ACTIVITY_ACTIONS[c.key] ?? c.key }} × {{ c.target }}
    </button>
  </div>
  <div class="small text-muted">第 {{ picked + 1 }} 格</div>
  <GoalRow
    :key="picked"
    :goal="modelValue.cells[picked]!"
    :path="`def.cells.${picked}`"
    :errors="errors"
    :id-prefix="`cell${picked}`"
    @update:goal="patch({ cells: modelValue.cells.map((x, j) => (j === picked ? $event : x)) })"
  />
  <div class="mt-2 small">每条线（横、竖、对角）的奖励</div>
  <RewardItemsEditor
    :model-value="modelValue.lineAward"
    :hats="true"
    presets
    id-prefix="line"
    @update:model-value="patch({ lineAward: $event })"
  />
  <div v-if="errUnder(errors, 'def.lineAward')" class="text-danger small" data-testid="err-def.lineAward">
    {{ errUnder(errors, 'def.lineAward') }}
  </div>
  <div class="mt-2 small">全部完成的奖励</div>
  <RewardItemsEditor
    :model-value="modelValue.fullAward"
    :hats="true"
    presets
    id-prefix="full"
    @update:model-value="patch({ fullAward: $event })"
  />
  <div v-if="errUnder(errors, 'def.fullAward')" class="text-danger small" data-testid="err-def.fullAward">
    {{ errUnder(errors, 'def.fullAward') }}
  </div>
</template>
