<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TableDto } from '@dt/shared';
import { useT } from '../composables/useT';
import { CUSTOMER_NAMES } from '../utils/labels';

const props = defineProps<{ tables: TableDto[]; selected?: number | null }>();
const emit = defineEmits<{ pick: [table: TableDto] }>();
const floor = ref(1);
const t = useT();
const floors = computed(() => [...new Set(props.tables.map((t) => t.floor))].sort((a, b) => a - b));
const shown = computed(() => props.tables.filter((t) => t.floor === floor.value));

function label(x: TableDto): string {
  if (x.customer === 9) return t.value.friends.tables.freeloader(x.freeloaderName ?? null);
  return CUSTOMER_NAMES[String(x.customer)] ?? '';
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
      {{ t.friends.tables.floor(f) }}
    </button>
  </div>
  <div class="row g-1">
    <div v-for="x in shown" :key="x.no" class="col-3">
      <button
        type="button"
        :class="[
          'w-100 border rounded p-1 small text-center bg-transparent',
          { 'border-primary border-2': selected === x.no, 'text-danger': x.customer === 3 },
        ]"
        :data-testid="`table-${x.no}`"
        @click="emit('pick', x)"
      >
        <div class="fw-bold">{{ x.no }}</div>
        <div><i v-if="x.customer === 3" class="bi bi-bug me-1"></i>{{ label(x) }}</div>
      </button>
    </div>
  </div>
</template>
