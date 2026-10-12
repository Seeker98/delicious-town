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
/**
 * JSON 值按长度调高（问题记录 152）：框里显示的是一行的 JSON，按每行约 60 个字折行估算，最少 2 行、最多 16 行
 * （最多 16 行：赛厨权重这类长 JSON 原来 8 行太挤，backlog 396）
 */
const rowsOf = (v: unknown) => Math.min(16, Math.max(2, Math.ceil(show(v).length / 60)));
</script>

<template>
  <!-- 区服数值的一行（界面改版 P12）：字段名等宽紫字 + 说明，中间输入，右边默认和生效值；改过的整行浅紫底 -->
  <tr :class="{ 'is-hl': overridden }">
    <td>
      <span class="dt-adm-key">{{ path }}</span>
      <div v-if="doc" class="dt-adm-key-doc" :data-testid="`doc-${path}`">{{ doc }}</div>
    </td>
    <!-- JSON 值（数组、对象）的输入框占两格，默认和生效值写在下面（问题记录 152） -->
    <td
      :colspan="kind === 'json' ? 2 : undefined"
      :class="kind === 'json' ? 'dt-adm-set-json' : 'dt-adm-set-val'"
    >
      <input
        v-if="kind === 'number'"
        type="number"
        step="any"
        :class="['dt-adm-in', 'dt-adm-full', { 'is-bad': error }]"
        :value="value"
        :disabled="readOnly"
        :aria-invalid="error || undefined"
        :data-testid="`setting-${path}`"
        @change="emit('edit', $event)"
      />
      <input
        v-else-if="kind === 'boolean'"
        type="checkbox"
        :checked="value === true"
        :disabled="readOnly"
        :data-testid="`setting-${path}`"
        @change="emit('edit', $event)"
      />
      <textarea
        v-else
        :rows="rowsOf(value)"
        :class="['dt-adm-in', 'is-mono', 'dt-adm-full', { 'is-bad': error }]"
        :value="show(value)"
        :disabled="readOnly"
        :aria-invalid="error || undefined"
        :data-testid="`setting-${path}`"
        @change="emit('edit', $event)"
      ></textarea>
      <div v-if="kind === 'json'" class="dt-adm-help">
        默认 {{ show(def) }} · 生效 <span :data-testid="`effective-${path}`">{{ show(effective) }}</span>
      </div>
    </td>
    <td v-if="kind !== 'json'" class="dt-adm-mu dt-adm-set-def">
      默认 {{ show(def) }} · 生效 <span :data-testid="`effective-${path}`">{{ show(effective) }}</span>
    </td>
    <td class="acts">
      <button
        v-if="overridden && !readOnly"
        type="button"
        class="dt-adm-btn is-t is-sm"
        :data-testid="`reset-${path}`"
        @click="emit('reset')"
      >
        恢复默认
      </button>
    </td>
  </tr>
</template>
