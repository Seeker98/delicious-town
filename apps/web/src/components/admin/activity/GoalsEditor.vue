<script setup lang="ts">
import type { GoalsDef } from '@dt/shared';
import { newGoal, signinTemplate } from '../../../utils/activityForm';
import GoalRow from './GoalRow.vue';

const props = defineProps<{ modelValue: GoalsDef; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [GoalsDef] }>();
const set = (goals: GoalsDef['goals']) => emit('update:modelValue', { goals });
</script>

<template>
  <button
    type="button"
    class="btn btn-sm btn-outline-secondary mb-2"
    data-testid="ac-signin-template"
    @click="emit('update:modelValue', signinTemplate())"
  >
    签到模板
  </button>
  <div v-for="(g, i) in modelValue.goals" :key="i" class="border-bottom py-2" :data-testid="`goal-row-${i}`">
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
      @click="set(modelValue.goals.filter((_, j) => j !== i))"
    >
      删除这行
    </button>
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary mt-2"
    :disabled="modelValue.goals.length >= 20"
    @click="set([...modelValue.goals, newGoal()])"
  >
    加一行
  </button>
</template>
