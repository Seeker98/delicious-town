<script setup lang="ts">
import { ref } from 'vue';
import type { CoopDef } from '@dt/shared';
import { rowKeys } from '../../../utils/activityForm';
import RewardItemsEditor from '../RewardItemsEditor.vue';
import RuleRows from './RuleRows.vue';

/** 全服合力编辑器（148-3 设计 §8.3）：贡献规则、里程碑、名次段 */
const props = defineProps<{ modelValue: CoopDef; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [CoopDef] }>();
type Def = CoopDef;
const patch = (p: Partial<Def>) => emit('update:modelValue', { ...props.modelValue, ...p });
const num = (e: Event) => Number((e.target as HTMLInputElement).value);
/** 行的稳定 key（终审 I1）：删掉中间一行时，下面的奖励编辑器不错位 */
const msKeys = ref(rowKeys(props.modelValue.milestones.length));
const rankKeys = ref(rowKeys(props.modelValue.ranks.length));
const setMs = (i: number, p: Partial<Def['milestones'][number]>) =>
  patch({ milestones: props.modelValue.milestones.map((m, j) => (j === i ? { ...m, ...p } : m)) });
const setRank = (i: number, p: Partial<Def['ranks'][number]>) =>
  patch({ ranks: props.modelValue.ranks.map((r, j) => (j === i ? { ...r, ...p } : r)) });
function addMs() {
  msKeys.value = [...msKeys.value, ...rowKeys(1)];
  const last = props.modelValue.milestones.at(-1)?.target ?? 0;
  patch({
    milestones: [
      ...props.modelValue.milestones,
      { target: last + 1000, minContribution: 0, award: {} as never },
    ],
  });
}
function removeMs(i: number) {
  msKeys.value = msKeys.value.filter((_, j) => j !== i);
  patch({ milestones: props.modelValue.milestones.filter((_, j) => j !== i) });
}
function addRank() {
  rankKeys.value = [...rankKeys.value, ...rowKeys(1)];
  const next = (props.modelValue.ranks.at(-1)?.to ?? 0) + 1;
  patch({ ranks: [...props.modelValue.ranks, { from: next, to: next, award: {} as never }] });
}
function removeRank(i: number) {
  rankKeys.value = rankKeys.value.filter((_, j) => j !== i);
  patch({ ranks: props.modelValue.ranks.filter((_, j) => j !== i) });
}
const errsUnder = (prefix: string) => Object.entries(props.errors).filter(([k]) => k.startsWith(prefix));
</script>

<template>
  <div class="small fw-bold">贡献规则</div>
  <RuleRows :model-value="modelValue.rules" :errors="errors" @update:model-value="patch({ rules: $event })" />

  <div class="small fw-bold">里程碑（全服总分达到目标、个人贡献达到门槛才能领）</div>
  <div
    v-for="(m, i) in modelValue.milestones"
    :key="msKeys[i]"
    class="border-bottom py-2"
    :data-testid="`ms-row-${i}`"
  >
    <div class="d-flex flex-wrap gap-2 align-items-center">
      全服
      <input
        type="number"
        min="1"
        class="form-control form-control-sm"
        style="width: 8rem"
        :value="m.target"
        :data-testid="`ms-target-${i}`"
        @input="setMs(i, { target: num($event) })"
      />
      分，个人至少
      <input
        type="number"
        min="0"
        class="form-control form-control-sm"
        style="width: 6rem"
        :value="m.minContribution"
        :data-testid="`ms-min-${i}`"
        @input="setMs(i, { minContribution: num($event) })"
      />
      分
      <button
        type="button"
        class="btn btn-sm btn-link text-danger"
        :disabled="modelValue.milestones.length <= 1"
        :data-testid="`ms-del-${i}`"
        @click="removeMs(i)"
      >
        删除
      </button>
    </div>
    <RewardItemsEditor
      :model-value="m.award"
      :hats="true"
      presets
      :id-prefix="`ms${i}`"
      @update:model-value="setMs(i, { award: $event })"
    />
    <span
      v-for="[k, msg] in errsUnder(`def.milestones.${i}.`)"
      :key="k"
      class="text-danger small"
      :data-testid="`err-${k}`"
      >{{ msg }}</span
    >
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary my-2"
    data-testid="ms-add"
    :disabled="modelValue.milestones.length >= 10"
    @click="addMs"
  >
    加一个里程碑
  </button>

  <div class="small fw-bold">贡献榜名次奖励（活动结束后发邮件，可以不设）</div>
  <div
    v-for="(r, i) in modelValue.ranks"
    :key="rankKeys[i]"
    class="border-bottom py-2"
    :data-testid="`rank-row-${i}`"
  >
    <div class="d-flex flex-wrap gap-2 align-items-center">
      第
      <input
        type="number"
        min="1"
        max="100"
        class="form-control form-control-sm"
        style="width: 5rem"
        :value="r.from"
        :data-testid="`rank-from-${i}`"
        @input="setRank(i, { from: num($event) })"
      />
      ~
      <input
        type="number"
        min="1"
        max="100"
        class="form-control form-control-sm"
        style="width: 5rem"
        :value="r.to"
        :data-testid="`rank-to-${i}`"
        @input="setRank(i, { to: num($event) })"
      />
      名
      <button
        type="button"
        class="btn btn-sm btn-link text-danger"
        :data-testid="`rank-del-${i}`"
        @click="removeRank(i)"
      >
        删除
      </button>
    </div>
    <RewardItemsEditor
      :model-value="r.award"
      :hats="true"
      presets
      :id-prefix="`rk${i}`"
      @update:model-value="setRank(i, { award: $event })"
    />
    <span
      v-for="[k, msg] in errsUnder(`def.ranks.${i}.`)"
      :key="k"
      class="text-danger small"
      :data-testid="`err-${k}`"
      >{{ msg }}</span
    >
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary my-2"
    data-testid="rank-add"
    :disabled="modelValue.ranks.length >= 10"
    @click="addRank"
  >
    加一个名次段
  </button>
</template>
