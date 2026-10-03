<script setup lang="ts">
import { ACTIVITY_ACTIONS, type PassDef } from '@dt/shared';
import { errsUnder } from '../../../utils/activityForm';

type Rule = PassDef['rules'][number];
/** 积分规则表（战令和全服合力共用，148-3）：行为、每次几分、每天上限 */
const props = defineProps<{ modelValue: Rule[]; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [Rule[]] }>();
const setRule = (i: number, p: Partial<Rule>) =>
  emit(
    'update:modelValue',
    props.modelValue.map((r, j) => (j === i ? { ...r, ...p } : r)),
  );
const num = (e: Event) => Number((e.target as HTMLInputElement).value);
</script>

<template>
  <div v-if="errors['def.rules']" class="text-danger small" data-testid="err-def.rules">
    {{ errors['def.rules'] }}
  </div>
  <template v-for="(r, i) in modelValue" :key="`r${i}`">
    <div class="d-flex gap-2 align-items-center py-1">
      <select
        class="form-select form-select-sm w-auto"
        :value="r.key"
        @change="setRule(i, { key: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="(name, k) in ACTIVITY_ACTIONS" :key="k" :value="k">{{ name }}</option>
      </select>
      每次
      <input
        type="number"
        min="1"
        class="form-control form-control-sm"
        style="width: 5rem"
        :value="r.points"
        :data-testid="`rule-points-${i}`"
        @input="setRule(i, { points: num($event) })"
      />
      分 每天最多
      <input
        type="number"
        min="1"
        class="form-control form-control-sm"
        style="width: 6rem"
        :value="r.dailyCap"
        @input="setRule(i, { dailyCap: num($event) })"
      />
      分
      <button
        type="button"
        class="btn btn-sm btn-link text-danger"
        :disabled="modelValue.length <= 1"
        @click="
          emit(
            'update:modelValue',
            modelValue.filter((_, j) => j !== i),
          )
        "
      >
        删除
      </button>
    </div>
    <div
      v-for="[k, m] in errsUnder(errors, `def.rules.${i}.`)"
      :key="k"
      class="text-danger small"
      :data-testid="`err-${k}`"
    >
      {{ m }}
    </div>
  </template>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary mb-3"
    :disabled="modelValue.length >= 20"
    @click="emit('update:modelValue', [...modelValue, { key: 'signin', points: 10, dailyCap: 10 }])"
  >
    加一条规则
  </button>
</template>
