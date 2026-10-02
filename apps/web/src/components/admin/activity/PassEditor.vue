<script setup lang="ts">
import { ref } from 'vue';
import type { PassDef, RewardItems } from '@dt/shared';
import { rowKeys } from '../../../utils/activityForm';
import RewardItemsEditor from '../RewardItemsEditor.vue';
import RuleRows from './RuleRows.vue';

const props = defineProps<{ modelValue: PassDef; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [PassDef] }>();
const patch = (p: Partial<PassDef>) => emit('update:modelValue', { ...props.modelValue, ...p });
/** 档位的稳定 key（终审 I1）：删掉中间一档时，下面的奖励编辑器不错位 */
const levelKeys = ref(rowKeys(props.modelValue.levels.length));
function removeLevel(i: number) {
  levelKeys.value = levelKeys.value.filter((_, j) => j !== i);
  patch({ levels: props.modelValue.levels.filter((_, j) => j !== i) });
}
function addLevel() {
  levelKeys.value = [...levelKeys.value, ...rowKeys(1)];
  const last = props.modelValue.levels.at(-1)?.points ?? 0;
  patch({ levels: [...props.modelValue.levels, { points: last + 10, free: null, premium: null }] });
}
type Level = PassDef['levels'][number];
const setLevel = (i: number, p: Partial<Level>) =>
  patch({ levels: props.modelValue.levels.map((l, j) => (j === i ? { ...l, ...p } : l)) });
const orNull = (r: RewardItems) => (Object.keys(r).length === 0 ? null : r);
const err = (k: string) => props.errors[k];
const num = (e: Event) => Number((e.target as HTMLInputElement).value);
</script>

<template>
  <div class="small fw-bold">积分规则</div>
  <RuleRows :model-value="modelValue.rules" :errors="errors" @update:model-value="patch({ rules: $event })" />

  <div class="small fw-bold">档位（奖励可以留空，但普通和进阶不能都空）</div>
  <div
    v-for="(l, i) in modelValue.levels"
    :key="levelKeys[i]"
    class="border-bottom py-2"
    :data-testid="`level-row-${i}`"
  >
    <div class="d-flex gap-2 align-items-center">
      积分
      <input
        type="number"
        min="1"
        class="form-control form-control-sm"
        style="width: 7rem"
        :value="l.points"
        @input="setLevel(i, { points: num($event) })"
      />
      <button
        type="button"
        class="btn btn-sm btn-link text-danger"
        :disabled="modelValue.levels.length <= 1"
        :data-testid="`level-del-${i}`"
        @click="removeLevel(i)"
      >
        删除这档
      </button>
    </div>
    <div
      v-if="err(`def.levels.${i}.points`)"
      class="text-danger small"
      :data-testid="`err-def.levels.${i}.points`"
    >
      {{ err(`def.levels.${i}.points`) }}
    </div>
    <div v-if="err(`def.levels.${i}`)" class="text-danger small" :data-testid="`err-def.levels.${i}`">
      {{ err(`def.levels.${i}`) }}
    </div>
    <div class="small mt-1">普通</div>
    <RewardItemsEditor
      :model-value="l.free ?? {}"
      :hats="true"
      :id-prefix="`free${i}`"
      @update:model-value="setLevel(i, { free: orNull($event) })"
    />
    <div class="small mt-1">进阶</div>
    <RewardItemsEditor
      :model-value="l.premium ?? {}"
      :hats="true"
      :id-prefix="`prem${i}`"
      @update:model-value="setLevel(i, { premium: orNull($event) })"
    />
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary my-2"
    :disabled="modelValue.levels.length >= 50"
    @click="addLevel"
  >
    加一档
  </button>

  <div class="small fw-bold">解锁进阶的价格</div>
  <div class="d-flex gap-2 align-items-center">
    钻石
    <input
      type="number"
      min="0"
      class="form-control form-control-sm"
      style="width: 7rem"
      :value="modelValue.unlock.diamond ?? 0"
      @input="patch({ unlock: { ...modelValue.unlock, diamond: num($event) || undefined } })"
    />
  </div>
  <RewardItemsEditor
    :model-value="{ goods: modelValue.unlock.goods }"
    id-prefix="unlock"
    @update:model-value="
      patch({ unlock: { ...modelValue.unlock, goods: $event.goods?.length ? $event.goods : undefined } })
    "
  />
  <div v-if="err('def.unlock')" class="text-danger small" data-testid="err-def.unlock">
    {{ err('def.unlock') }}
  </div>
</template>
