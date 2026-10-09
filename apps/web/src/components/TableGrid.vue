<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TableDto } from '@dt/shared';
import { useT } from '../composables/useT';
import { useCatalogStore } from '../stores/catalog';
import { tableDish } from '../utils/tableOrder';
import { CUSTOMER_NAMES } from '../utils/labels';

const props = defineProps<{ tables: TableDto[]; selected?: number | null }>();
const emit = defineEmits<{ pick: [table: TableDto] }>();
const floor = ref(1);
const t = useT();
const catalog = useCatalogStore();
/** 点菜、吃特色菜用的名字（问题记录 559） */
const dishNames = {
  cookbookName: (id: number) => catalog.data('cookbooks', id)?.name ?? `#${id}`,
  mcName: (id: number) => catalog.mcName(id),
};
const floors = computed(() => [...new Set(props.tables.map((t) => t.floor))].sort((a, b) => a - b));
const shown = computed(() => props.tables.filter((t) => t.floor === floor.value));
/** 每层几只蟑螂（问题记录 561：有蟑螂的楼层在按钮上标出来） */
const roaches = computed(() => {
  const m = new Map<number, number>();
  for (const x of props.tables) if (x.customer === 3) m.set(x.floor, (m.get(x.floor) ?? 0) + 1);
  return m;
});

function label(x: TableDto): string {
  if (x.customer === 9) return t.value.friends.tables.freeloader(x.freeloaderName ?? null);
  return CUSTOMER_NAMES[String(x.customer)] ?? '';
}
</script>

<template>
  <!-- 一排独立按钮，楼层多时换行（问题记录 314：按钮组超出手机屏幕） -->
  <div v-if="floors.length > 1" class="d-flex flex-wrap gap-1 mb-2" data-testid="floor-tabs">
    <button
      v-for="f in floors"
      :key="f"
      :class="['btn btn-sm', f === floor ? 'btn-primary' : 'btn-outline-primary']"
      @click="floor = f"
    >
      {{ t.friends.tables.floor(f)
      }}<span
        v-if="roaches.get(f)"
        :class="['ms-1', { 'text-danger': f !== floor }]"
        :title="t.friends.roaches(roaches.get(f)!)"
        :data-testid="`floor-roach-${f}`"
        ><i class="bi bi-bug" aria-hidden="true"></i>{{ roaches.get(f) }}</span
      >
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
        <!-- 这桌点的菜：挑剔顾客、蟹老板写点的菜，普通顾客、章鱼哥写吃的特色菜（问题记录 559） -->
        <div
          v-if="tableDish(x.last, dishNames)"
          class="text-muted dt-clamp1"
          :data-testid="`table-dish-${x.no}`"
        >
          {{ tableDish(x.last, dishNames) }}
        </div>
      </button>
    </div>
  </div>
</template>
