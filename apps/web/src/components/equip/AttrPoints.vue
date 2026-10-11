<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { endpoints } from '../../api/endpoints';
import DtStepper from '../DtStepper.vue';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';
import { ATTR_NAMES } from '../../utils/labels';

/**
 * 加点（问题记录：从餐厅信息挪到厨具页）；加完通知父页面刷新属性表。
 * 界面改版 P7：放进底部面板，一项一行；预览写加完以后的合计（含厨具，父页面传 totals）
 */
const props = defineProps<{ totals?: Partial<Record<'cook' | 'cutting' | 'fire', number>> }>();
const emit = defineEmits<{ done: [] }>();
const store = useRestaurantStore();
const toast = useToastStore();
const t = useT();
/** 每格加几点：步进器默认 0（界面改版 P3；原来留空是因为看不出是哪一项，现在每格上方写了名字） */
const add = reactive<Record<'cook' | 'cutting' | 'fire', number>>({ cook: 0, cutting: 0, fire: 0 });
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
      if (num(add[k]) > cap(k)) add[k] = cap(k);
    },
  );
/** “全加”：剩下的点都填进这一格 */
const fillAll = (k: Field) => {
  add[k] = num(add[k]) + remain.value;
};
/** 加点前的数值（有合计用合计，没有用加点数），和加完后的预览 */
const base = (k: Field) => props.totals?.[k] ?? store.rest?.attrs[k] ?? 0;
const preview = (k: Field) => {
  const n = num(add[k]);
  return n > 0 ? `${base(k)} → ${base(k) + n}` : String(base(k));
};
const clear = () => {
  add.cook = add.cutting = add.fire = 0;
};

async function allocate() {
  busy.value = true;
  try {
    await endpoints.allocate(points());
    add.cook = add.cutting = add.fire = 0;
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
  <div class="dt-points" data-testid="attr-points-body">
    <div class="dt-points-head">
      <span class="dt-meta">{{ t.equip.points.note }}</span>
      <b data-testid="attr-left">{{ t.equip.points.left(remain) }}</b>
    </div>
    <div v-for="f in FIELDS" :key="f" class="dt-points-row">
      <span class="dt-points-name" :data-testid="`label-${f}`">{{ ATTR_NAMES[f] }}</span>
      <span class="dt-points-val" :data-testid="`preview-${f}`">{{ preview(f) }}</span>
      <DtStepper v-model="add[f]" :min="0" :max="cap(f)" :testid="`add-${f}`" :disabled="busy" />
      <button
        type="button"
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || remain === 0"
        :data-testid="`all-${f}`"
        @click="fillAll(f)"
      >
        {{ t.equip.points.all }}
      </button>
    </div>
    <div class="dt-sheet-pair mt-3">
      <button type="button" class="btn btn-light" :disabled="busy || sum === 0" @click="clear">
        {{ t.equip.points.clear }}
      </button>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="allocate"
        :disabled="busy || sum <= 0 || sum > left"
        @click="allocate"
      >
        {{ t.equip.points.allocate(sum) }}
      </button>
    </div>
  </div>
</template>
