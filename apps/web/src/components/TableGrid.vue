<script setup lang="ts">
import { computed, ref } from 'vue';
import { PAYING_CUSTOMERS, type TableDto } from '@dt/shared';
import { useT } from '../composables/useT';
import { useCatalogStore } from '../stores/catalog';
import { tableDish } from '../utils/tableOrder';
import { CUSTOMER_NAMES, CUSTOMER_SHORT } from '../utils/labels';
import DtArt from './DtArt.vue';

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
/** 这一层的汇总（界面改版 P7）：几桌、几桌在吃、几桌挑剔顾客走了、几只蟑螂、几桌白食，没有的不写 */
const summary = computed(() => {
  const s = t.value.friends.tables;
  const list = shown.value;
  const eating = list.filter((x) => PAYING_CUSTOMERS.includes(x.customer)).length;
  const roach = list.filter((x) => x.customer === 3).length;
  const free = list.filter((x) => x.customer === 9).length;
  const left = list.filter((x) => x.customer === -2).length;
  return [
    s.count(floor.value, list.length),
    eating > 0 ? s.eating(eating) : '',
    left > 0 ? s.left(left) : '',
    roach > 0 ? s.roach(roach) : '',
    free > 0 ? s.free(free) : '',
  ]
    .filter(Boolean)
    .join(' · ');
});
</script>

<template>
  <!-- 楼层是筛选胶囊，多时换行（问题记录 314；界面改版 P3：原来是一排按钮）；有蟑螂的楼层带红色小标签（P7） -->
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
      }}<span v-if="roaches.get(f)" class="dt-tag dt-tag-danger ms-1" :data-testid="`floor-roach-${f}`">{{
        t.friends.roaches(roaches.get(f)!)
      }}</span>
    </button>
  </div>
  <p class="dt-table-sum" data-testid="floor-summary">{{ summary }}</p>
  <!-- 餐桌格子（界面改版 P7）：4 列，左上角桌号，中间点的菜，下面顾客类型小标签；蟑螂浅红底、白食浅黄底、空桌虚线 -->
  <div class="dt-table-grid">
    <button
      v-for="x in shown"
      :key="x.no"
      type="button"
      :class="[
        'dt-table-cell',
        {
          'is-roach': x.customer === 3,
          'is-freeloader': x.customer === 9,
          'is-empty': x.customer === 0,
          'is-left': x.customer === -2,
          'is-picked': selected === x.no,
        },
      ]"
      aria-haspopup="dialog"
      :data-testid="`table-${x.no}`"
      @click="emit('pick', x)"
    >
      <span class="dt-table-no">{{ x.no }}</span>
      <template v-if="x.customer === 3">
        <DtArt name="fac-bug" :size="26" />
        <span class="dt-table-main">{{ CUSTOMER_NAMES['3'] }}</span>
      </template>
      <template v-else-if="x.customer === 9">
        <span class="dt-table-main">{{ CUSTOMER_NAMES['9'] }}</span>
        <span class="dt-table-who">{{ x.freeloaderName ?? t.rest.floor.friend }}</span>
      </template>
      <span v-else-if="x.customer === 0" class="dt-table-who">{{ CUSTOMER_NAMES['0'] }}</span>
      <template v-else>
        <!-- 这桌点的菜：挑剔顾客、蟹老板写点的菜，普通顾客、章鱼哥写吃的特色菜（问题记录 559）；挑剔顾客走了的菜名划掉、红标签（挑剔顾客调整） -->
        <span v-if="dishes.get(x.no)" class="dt-table-main" :data-testid="`table-dish-${x.no}`">{{
          dishes.get(x.no)
        }}</span>
        <span
          v-if="dishes.get(x.no)"
          :class="['dt-tag', x.customer === -2 ? 'dt-tag-danger' : 'dt-tag-mute']"
          >{{ CUSTOMER_SHORT[String(x.customer)] ?? CUSTOMER_NAMES[String(x.customer)] }}</span
        >
        <span v-else class="dt-table-main">{{ CUSTOMER_NAMES[String(x.customer)] }}</span>
      </template>
    </button>
  </div>
</template>
