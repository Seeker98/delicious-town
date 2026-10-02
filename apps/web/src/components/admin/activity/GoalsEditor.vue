<script setup lang="ts">
import { ref } from 'vue';
import type { GoalsDef } from '@dt/shared';
import { newGoal, rowKeys, signinTemplate } from '../../../utils/activityForm';
import GoalRow from './GoalRow.vue';

const props = defineProps<{ modelValue: GoalsDef; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [GoalsDef] }>();
const set = (goals: GoalsDef['goals']) => emit('update:modelValue', { goals });
const keys = ref(rowKeys(props.modelValue.goals.length));
function template() {
  const t = signinTemplate();
  keys.value = rowKeys(t.goals.length);
  emit('update:modelValue', t);
}
function remove(i: number) {
  keys.value = keys.value.filter((_, j) => j !== i);
  set(props.modelValue.goals.filter((_, j) => j !== i));
}
function add() {
  keys.value = [...keys.value, ...rowKeys(1)];
  set([...props.modelValue.goals, newGoal()]);
}
</script>

<template>
  <button
    type="button"
    class="btn btn-sm btn-outline-secondary mb-2"
    data-testid="ac-signin-template"
    @click="template"
  >
    签到模板
  </button>
  <div
    v-for="(g, i) in modelValue.goals"
    :key="keys[i]"
    class="border-bottom py-2"
    :data-testid="`goal-row-${i}`"
  >
    <GoalRow
      :goal="g"
      :path="`def.goals.${i}`"
      :errors="errors"
      :id-prefix="`goal${i}`"
      @update:goal="set(props.modelValue.goals.map((x, j) => (j === i ? $event : x)))"
    />
    <button
      type="button"
      class="btn btn-sm btn-link text-danger p-0"
      :disabled="modelValue.goals.length <= 1"
      :data-testid="`goal-del-${i}`"
      @click="remove(i)"
    >
      删除这行
    </button>
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary mt-2"
    :disabled="modelValue.goals.length >= 20"
    @click="add"
  >
    加一行
  </button>
</template>
