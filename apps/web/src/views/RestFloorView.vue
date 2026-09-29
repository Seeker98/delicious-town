<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { TableDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { formatNum } from '../utils/format';
import { CUSTOMER_NAMES } from '../utils/labels';

const tables = ref<TableDto[]>([]);
const floor = ref(1);
const error = ref('');
const floors = computed(() => [...new Set(tables.value.map((t) => t.floor))].sort((a, b) => a - b));
const shown = computed(() => tables.value.filter((t) => t.floor === floor.value));

onMounted(async () => {
  try {
    tables.value = await endpoints.floor();
  } catch (e) {
    error.value = errorMessage(e, '读取餐桌失败');
  }
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div class="btn-group btn-group-sm mb-2">
    <button
      v-for="f in floors"
      :key="f"
      :class="['btn', f === floor ? 'btn-primary' : 'btn-outline-primary']"
      @click="floor = f"
    >
      {{ f }} 楼
    </button>
  </div>
  <div class="row g-1">
    <div v-for="t in shown" :key="t.no" class="col-3">
      <div class="border rounded p-1 small text-center" :data-testid="`table-${t.no}`">
        <div class="fw-bold">{{ t.no }}</div>
        <div>{{ CUSTOMER_NAMES[String(t.customer)] ?? '' }}</div>
        <div v-if="t.last && t.last.type !== 0" class="text-muted">
          {{ formatNum(Math.floor(t.last.coin)) }} 银 / {{ formatNum(Math.floor(t.last.exp)) }} 经
        </div>
      </div>
    </div>
  </div>
</template>
