<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TableDto } from '@dt/shared';
import { CUSTOMER_NAMES } from '../utils/labels';

const props = defineProps<{ tables: TableDto[]; selected?: number | null }>();
const emit = defineEmits<{ pick: [table: TableDto] }>();
const floor = ref(1);
const floors = computed(() => [...new Set(props.tables.map((t) => t.floor))].sort((a, b) => a - b));
const shown = computed(() => props.tables.filter((t) => t.floor === floor.value));

function label(t: TableDto): string {
  if (t.customer === 9) return `白食：${t.freeloaderName ?? '好友'}`;
  return CUSTOMER_NAMES[String(t.customer)] ?? '';
}
</script>

<template>
  <div v-if="floors.length > 1" class="btn-group btn-group-sm mb-2">
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
      <button
        type="button"
        :class="[
          'w-100 border rounded p-1 small text-center bg-transparent',
          { 'border-primary border-2': selected === t.no, 'text-danger': t.customer === 3 },
        ]"
        :data-testid="`table-${t.no}`"
        @click="emit('pick', t)"
      >
        <div class="fw-bold">{{ t.no }}</div>
        <div><i v-if="t.customer === 3" class="bi bi-bug me-1"></i>{{ label(t) }}</div>
      </button>
    </div>
  </div>
</template>
