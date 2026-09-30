<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { AdminIconDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';

const props = defineProps<{ restId: number }>();
const catalog = useCatalogStore();
const icons = ref<AdminIconDto[]>([]);
const key = ref('');
const error = ref('');
const busy = ref(false);
const options = computed(() =>
  (catalog.looks?.icons ?? []).filter((i) => !icons.value.some((x) => x.key === i.key)),
);

async function load() {
  try {
    icons.value = await adminApi.icons(props.restId);
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, '读取图标失败');
  }
}

async function run(fn: () => Promise<AdminIconDto[]>) {
  busy.value = true;
  try {
    icons.value = await fn();
    key.value = '';
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, '操作失败');
  } finally {
    busy.value = false;
  }
}

function grant() {
  if (!key.value || !window.confirm(`给餐厅 #${props.restId} 发放图标「${key.value}」？`)) return;
  return run(() => adminApi.grantIcon(props.restId, key.value));
}
function revoke(i: AdminIconDto) {
  if (!window.confirm(`收回「${i.title}」？`)) return;
  return run(() => adminApi.revokeIcon(props.restId, i.id));
}

onMounted(async () => {
  await catalog.load().catch(() => undefined);
  await load();
});
watch(() => props.restId, load);
</script>

<template>
  <div class="border rounded p-2 mb-2">
    <h6 class="mb-1">个性图标</h6>
    <div v-if="error" class="text-danger small">{{ error }}</div>
    <div class="mb-1">
      <span v-for="i in icons" :key="i.id" class="badge bg-warning text-dark me-1">
        {{ i.title }}<span v-if="i.shown">（展示中）</span>
        <button class="btn btn-link btn-sm p-0 ms-1" :disabled="busy" @click="revoke(i)">收回</button>
      </span>
      <span v-if="icons.length === 0" class="small text-muted">没有</span>
    </div>
    <div class="d-flex gap-1">
      <select v-model="key" class="form-select form-select-sm" data-testid="icon-select">
        <option value="">选择图标</option>
        <option v-for="o in options" :key="o.key" :value="o.key">{{ o.title }}（{{ o.key }}）</option>
      </select>
      <button
        class="btn btn-sm btn-primary text-nowrap"
        data-testid="icon-grant"
        :disabled="busy || !key"
        @click="grant"
      >
        发放
      </button>
    </div>
  </div>
</template>
