<script setup lang="ts">
import { ACTIVITY_ACTIONS, type GoalsDef } from '@dt/shared';
import { errUnder } from '../../../utils/activityForm';
import RewardItemsEditor from '../RewardItemsEditor.vue';

type Goal = GoalsDef['goals'][number];
const props = defineProps<{ goal: Goal; path: string; errors: Record<string, string>; idPrefix: string }>();
const emit = defineEmits<{ 'update:goal': [Goal] }>();
const set = (patch: Partial<Goal>) => emit('update:goal', { ...props.goal, ...patch });
const err = (k: string) => props.errors[`${props.path}.${k}`];
/** 奖励里的道具 id 不存在时错误在更深的路径上（问题记录 270） */
const awardErr = () => errUnder(props.errors, `${props.path}.award`);
</script>

<template>
  <div class="d-flex flex-wrap gap-2 align-items-start">
    <div>
      <select
        class="form-select form-select-sm"
        :value="goal.key"
        @change="set({ key: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="(name, k) in ACTIVITY_ACTIONS" :key="k" :value="k">{{ name }}</option>
      </select>
      <div v-if="err('key')" class="text-danger small" :data-testid="`err-${path}.key`">{{ err('key') }}</div>
    </div>
    <div>
      <input
        type="number"
        min="1"
        class="form-control form-control-sm"
        style="width: 6rem"
        :value="goal.target"
        @input="set({ target: Number(($event.target as HTMLInputElement).value) })"
      />
      <div v-if="err('target')" class="text-danger small" :data-testid="`err-${path}.target`">
        {{ err('target') }}
      </div>
    </div>
    <div class="flex-fill">
      <RewardItemsEditor
        :model-value="goal.award"
        :hats="true"
        presets
        :id-prefix="idPrefix"
        @update:model-value="set({ award: $event })"
      />
      <div v-if="awardErr()" class="text-danger small" :data-testid="`err-${path}.award`">
        {{ awardErr() }}
      </div>
    </div>
  </div>
</template>
