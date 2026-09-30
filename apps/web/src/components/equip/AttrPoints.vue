<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';

/** 加点（问题记录：从餐厅信息挪到厨具页）；加完通知父页面刷新属性表 */
const emit = defineEmits<{ done: [] }>();
const store = useRestaurantStore();
const toast = useToastStore();
const add = reactive({ cook: 0, cutting: 0, fire: 0 });
const busy = ref(false);
const left = computed(() => store.rest?.attrLeft ?? 0);
/** 清空的输入框（v-model.number 给空串）按 0 算 */
const num = (x: unknown) => Math.max(0, Math.floor(Number(x) || 0));
const points = () => ({ cook: num(add.cook), cutting: num(add.cutting), fire: num(add.fire) });
const sum = computed(() => {
  const p = points();
  return p.cook + p.cutting + p.fire;
});
const FIELDS = [
  { key: 'cook', label: '厨艺' },
  { key: 'cutting', label: '刀工' },
  { key: 'fire', label: '火候' },
] as const;

async function allocate() {
  busy.value = true;
  try {
    await endpoints.allocate(points());
    add.cook = add.cutting = add.fire = 0;
    await store.refresh();
    emit('done');
  } catch (e) {
    toast.push(errorMessage(e, '加点失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => store.refresh().catch(() => undefined));
</script>

<template>
  <div v-if="left > 0" class="border rounded p-2 mb-2 small">
    <b data-testid="attr-left">剩余点数 {{ left }}</b>
    <div class="row g-1 mt-1">
      <div v-for="f in FIELDS" :key="f.key" class="col-4">
        <input
          v-model.number="add[f.key]"
          type="number"
          min="0"
          class="form-control form-control-sm"
          :placeholder="f.label"
          :data-testid="`add-${f.key}`"
        />
      </div>
      <div class="col-12">
        <button
          class="btn btn-sm btn-primary w-100"
          data-testid="allocate"
          :disabled="busy || sum <= 0 || sum > left"
          @click="allocate"
        >
          加点（{{ sum }}）
        </button>
      </div>
    </div>
  </div>
</template>
