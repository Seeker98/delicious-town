<script setup lang="ts">
defineProps<{
  path: string;
  kind: 'number' | 'boolean' | 'json';
  def: unknown;
  value: unknown;
  effective: unknown;
  overridden: boolean;
  readOnly: boolean;
  error: boolean;
  /** 数值说明（问题记录 126） */
  doc?: string;
}>();
// 事件不叫 input：和原生 input 事件同名会在打字时多触发一次
const emit = defineEmits<{ edit: [e: Event]; reset: [] }>();
const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
/** JSON 值按格式化后的行数调高（问题记录 152），最少 2 行、最多 16 行 */
const rowsOf = (v: unknown) =>
  // 最多 16 行：赛厨权重这类三十多行的 JSON 原来 8 行太挤（backlog 396）
  Math.min(16, Math.max(2, (typeof v === 'string' ? v : JSON.stringify(v, null, 1)).split('\n').length));
</script>

<template>
  <div
    class="row g-1 align-items-center small border-bottom py-1"
    :class="{ 'bg-warning-subtle': overridden }"
  >
    <div class="col-12 col-md-4 text-break">
      <code>{{ path }}</code>
      <div v-if="doc" class="text-muted" :data-testid="`doc-${path}`">{{ doc }}</div>
    </div>
    <!-- JSON 值（数组、对象）的输入框占整行（问题记录 152） -->
    <div :class="kind === 'json' ? 'col-12' : 'col-5 col-md-3'">
      <input
        v-if="kind === 'number'"
        type="number"
        step="any"
        class="form-control form-control-sm"
        :class="{ 'is-invalid': error }"
        :value="value"
        :disabled="readOnly"
        :data-testid="`setting-${path}`"
        @change="emit('edit', $event)"
      />
      <input
        v-else-if="kind === 'boolean'"
        type="checkbox"
        class="form-check-input"
        :checked="value === true"
        :disabled="readOnly"
        :data-testid="`setting-${path}`"
        @change="emit('edit', $event)"
      />
      <textarea
        v-else
        :rows="rowsOf(value)"
        class="form-control form-control-sm font-monospace"
        :class="{ 'is-invalid': error }"
        :value="show(value)"
        :disabled="readOnly"
        :data-testid="`setting-${path}`"
        @change="emit('edit', $event)"
      ></textarea>
    </div>
    <div :class="[kind === 'json' ? 'col-10' : 'col-5 col-md-4', 'text-muted', 'text-break']">
      默认 {{ show(def) }} · 生效 <span :data-testid="`effective-${path}`">{{ show(effective) }}</span>
    </div>
    <div class="col-2 col-md-1 text-end">
      <button
        v-if="overridden && !readOnly"
        class="btn btn-link btn-sm p-0"
        :data-testid="`reset-${path}`"
        @click="emit('reset')"
      >
        恢复默认
      </button>
    </div>
  </div>
</template>
