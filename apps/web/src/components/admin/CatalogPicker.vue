<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useCatalogStore } from '../../stores/catalog';
import { matchText } from '../../utils/match';

/**
 * 后台选道具 / 食材（问题记录 270）：打字按名字或 id 开头搜，下拉里显示名字、类型（食材显示等级）和 id，
 * 点选或 ↑↓ 回车选中。直接填纯数字 id 也照样生效
 */
const props = defineProps<{ kind: 'goods' | 'foods'; modelValue: number | ''; testid: string }>();
const emit = defineEmits<{ 'update:modelValue': [number | ''] }>();
const catalog = useCatalogStore();

/** 道具类型名，和配置里的 GOODS_TYPE 对应 */
const GOODS_TYPE: Record<number, string> = {
  0: '消耗品',
  1: '道具',
  2: '礼包',
  3: '设施',
  4: '厨具',
  5: '宝石',
  8: '残片',
  9: '勋章',
  10: '纪念品',
};
const MAX = 20;

const nameOf = (id: number | '') =>
  id === '' ? '' : props.kind === 'goods' ? catalog.goodsName(id) : catalog.foodName(id);
const text = ref(nameOf(props.modelValue));
const open = ref(false);
const active = ref(0);

watch(
  () => props.modelValue,
  (v) => {
    if (!open.value) text.value = nameOf(v);
  },
);

type Opt = { id: number; label: string };
const options = computed<Opt[]>(() => {
  const q = text.value.trim();
  if (!open.value || !q) return [];
  const out: Opt[] = [];
  const all =
    props.kind === 'goods'
      ? [...catalog.goodsMap.values()].map((g) => ({
          id: g.id,
          name: g.name,
          extra: GOODS_TYPE[g.type] ?? `类型 ${g.type}`,
        }))
      : [...catalog.foodsMap.values()].map((f) => ({ id: f.id, name: f.name, extra: `${f.level} 级` }));
  for (const x of all) {
    // 不区分大小写（问题记录 316）
    if (matchText(x.name, q) || String(x.id).startsWith(q))
      out.push({ id: x.id, label: `${x.name} · ${x.extra} · #${x.id}` });
    if (out.length >= MAX) break;
  }
  return out;
});

function onInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value;
  open.value = true;
  active.value = 0;
  const q = text.value.trim();
  if (q === '') emit('update:modelValue', '');
  else if (/^\d+$/.test(q)) emit('update:modelValue', Number(q));
}
function choose(o: Opt) {
  emit('update:modelValue', o.id);
  text.value = nameOf(o.id);
  open.value = false;
}
function onKey(e: KeyboardEvent) {
  const n = options.value.length;
  if (e.key === 'ArrowDown' && n > 0) {
    active.value = (active.value + 1) % n;
    e.preventDefault();
  } else if (e.key === 'ArrowUp' && n > 0) {
    active.value = (active.value - 1 + n) % n;
    e.preventDefault();
  } else if (e.key === 'Enter' && n > 0) {
    choose(options.value[active.value]!);
    e.preventDefault();
  } else if (e.key === 'Escape') open.value = false;
}
/** 失焦：没选下拉项时，框里恢复成当前选中项的名字 */
function onBlur() {
  open.value = false;
  text.value = nameOf(props.modelValue);
}
</script>

<template>
  <div class="position-relative">
    <input
      :value="text"
      class="form-control form-control-sm"
      :placeholder="kind === 'goods' ? '搜道具名或 id' : '搜食材名或 id'"
      autocomplete="off"
      :data-testid="testid"
      @input="onInput"
      @keydown="onKey"
      @focus="open = true"
      @blur="onBlur"
    />
    <ul
      v-if="options.length > 0"
      class="list-group position-absolute w-100 shadow-sm small"
      style="z-index: 10; max-height: 16rem; overflow-y: auto; min-width: 16rem"
    >
      <!-- mousedown 而不是 click：在输入框失焦之前选中 -->
      <li
        v-for="(o, i) in options"
        :key="o.id"
        :class="['list-group-item list-group-item-action py-1', i === active ? 'active' : '']"
        role="option"
        :data-testid="`${testid}-opt-${o.id}`"
        @mousedown.prevent="choose(o)"
      >
        {{ o.label }}
      </li>
    </ul>
  </div>
</template>
