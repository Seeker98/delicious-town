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
const floors = computed(() => [...new Set(props.tables.map((t) => t.floor))].sort((a, b) => a - b));
const shown = computed(() => props.tables.filter((t) => t.floor === floor.value));
/** 每桌点的菜、吃的特色菜（问题记录 559），每桌只算一次 */
const dishes = computed(() => new Map(shown.value.map((x) => [x.no, tableDish(x.last, catalog)])));
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
  <!-- 楼层是筛选胶囊，多时换行（问题记录 314；界面改版 P3：原来是一排按钮） -->
  <div v-if="floors.length > 1" class="dt-pills" data-testid="floor-tabs">
    <button
      v-for="f in floors"
      :key="f"
      type="button"
      :class="{ active: f === floor }"
      :aria-pressed="f === floor"
      @click="floor = f"
    >
      {{ t.friends.tables.floor(f)
      }}<span
        v-if="roaches.get(f)"
        :class="['ms-1', { 'text-danger': f !== floor }]"
        :title="t.friends.roaches(roaches.get(f)!)"
        :data-testid="`floor-roach-${f}`"
        ><i class="bi bi-bug" aria-hidden="true"></i><span aria-hidden="true">{{ roaches.get(f) }}</span
        ><span class="visually-hidden">{{ t.friends.roaches(roaches.get(f)!) }}</span></span
      >
    </button>
  </div>
  <!-- 餐桌格子（界面改版 P3）：4 列，同一排一样高（问题记录 585），蟑螂、白食各有标记 -->
  <div class="dt-table-grid">
    <div v-for="x in shown" :key="x.no">
      <button
        type="button"
        :class="['dt-table-cell', { 'is-roach': x.customer === 3, 'is-freeloader': x.customer === 9 }]"
        :aria-pressed="selected === x.no"
        :data-testid="`table-${x.no}`"
        @click="emit('pick', x)"
      >
        <div class="fw-bold">{{ x.no }}</div>
        <div><i v-if="x.customer === 3" class="bi bi-bug me-1"></i>{{ label(x) }}</div>
        <!-- 这桌点的菜：挑剔顾客、蟹老板写点的菜，普通顾客、章鱼哥写吃的特色菜（问题记录 559） -->
        <div v-if="dishes.get(x.no)" class="text-muted dt-clamp1" :data-testid="`table-dish-${x.no}`">
          {{ dishes.get(x.no) }}
        </div>
      </button>
    </div>
  </div>
</template>
