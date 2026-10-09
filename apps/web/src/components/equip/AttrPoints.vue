<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';
import { ATTR_NAMES } from '../../utils/labels';

/** 加点（问题记录：从餐厅信息挪到厨具页）；加完通知父页面刷新属性表 */
const emit = defineEmits<{ done: [] }>();
const store = useRestaurantStore();
const toast = useToastStore();
const t = useT();
/** 输入框默认留空（问题记录：显示 0 时看不出是哪一项） */
const add = reactive<Record<'cook' | 'cutting' | 'fire', number | ''>>({ cook: '', cutting: '', fire: '' });
const busy = ref(false);
const left = computed(() => store.rest?.attrLeft ?? 0);
/** 清空的输入框（v-model.number 给空串）按 0 算 */
const num = (x: unknown) => Math.max(0, Math.floor(Number(x) || 0));
const points = () => ({ cook: num(add.cook), cutting: num(add.cutting), fire: num(add.fire) });
const sum = computed(() => {
  const p = points();
  return p.cook + p.cutting + p.fire;
});
const FIELDS = ['cook', 'cutting', 'fire'] as const;
type Field = (typeof FIELDS)[number];
/** 还没分出去的点数（问题记录 557：跟着输入减少） */
const remain = computed(() => Math.max(0, left.value - sum.value));
/** 这一格最多能填几点：剩余点数减去另外两格 */
const cap = (k: Field) =>
  Math.max(0, left.value - FIELDS.filter((x) => x !== k).reduce((s, x) => s + num(add[x]), 0));
// 填多了自动退回这一格最多能填的数（原来只是按钮变灰，不说为什么）；只退回刚改的那一格，不动已经填好的
for (const k of FIELDS)
  watch(
    () => add[k],
    () => {
      if (add[k] !== '' && num(add[k]) > cap(k)) add[k] = cap(k);
    },
  );
/** “全加”：剩下的点都填进这一格 */
const fillAll = (k: Field) => {
  add[k] = num(add[k]) + remain.value;
};
/** 加点前的数值，和加完后的预览 */
const base = (k: Field) => store.rest?.attrs[k] ?? 0;
const preview = (k: Field) => {
  const n = num(add[k]);
  return n > 0 ? `${base(k)} → ${base(k) + n}` : String(base(k));
};

async function allocate() {
  busy.value = true;
  try {
    await endpoints.allocate(points());
    add.cook = add.cutting = add.fire = '';
    await store.refresh();
    emit('done');
  } catch (e) {
    toast.push(errorMessage(e, t.value.equip.points.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => store.refresh().catch(() => undefined));
</script>

<template>
  <!-- 锚点：餐厅信息页“有 N 点可加”、主线“分配属性点”直接落到这里（530 遗留） -->
  <div v-if="left > 0" id="attr-points" class="border rounded p-2 mb-2 small">
    <b data-testid="attr-left">{{ t.equip.points.left(remain) }}</b>
    <div class="row g-1 mt-1">
      <div v-for="f in FIELDS" :key="f" class="col-4">
        <div class="fw-bold" :data-testid="`label-${f}`">{{ ATTR_NAMES[f] }}</div>
        <input
          v-model.number="add[f]"
          type="number"
          min="0"
          :max="cap(f)"
          class="form-control form-control-sm"
          placeholder="0"
          :data-testid="`add-${f}`"
        />
        <!-- “全加”放在预览那一行右边：放在名字旁边会和右边一列的名字挨在一起（问题记录 557） -->
        <div class="d-flex justify-content-between align-items-baseline">
          <span class="text-muted" style="font-size: 11px" :data-testid="`preview-${f}`">{{
            preview(f)
          }}</span>
          <button
            type="button"
            class="dt-link-btn"
            :disabled="remain === 0"
            :data-testid="`all-${f}`"
            @click="fillAll(f)"
          >
            {{ t.equip.points.all }}
          </button>
        </div>
      </div>
      <div class="col-12">
        <button
          class="btn btn-sm btn-primary w-100"
          data-testid="allocate"
          :disabled="busy || sum <= 0 || sum > left"
          @click="allocate"
        >
          {{ t.equip.points.allocate(sum) }}
        </button>
      </div>
    </div>
  </div>
</template>
