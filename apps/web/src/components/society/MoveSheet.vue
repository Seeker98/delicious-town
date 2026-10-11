<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { STREET_FOCUS } from '../../utils/labels';
import DtArt from '../DtArt.vue';
import DtSheet from '../DtSheet.vue';

/**
 * 搬家面板（界面改版 P10：原来是协会里单独一页）：选街道（原生下拉做成输入框样），
 * 选中后浅紫框写街道类型、加成和介绍（问题记录 284、380）；合计框写搬家卡和大约多少银币
 */
const props = defineProps<{ open: boolean; cost: number | null }>();
const emit = defineEmits<{ close: []; done: [] }>();
const t = useT();
const toast = useToastStore();
const catalog = useCatalogStore();
const restaurant = useRestaurantStore();
const target = ref<number | null>(null);
const busy = ref(false);
const rest = computed(() => restaurant.rest);
const here = computed(() =>
  rest.value ? catalog.streetName(rest.value.streetId, rest.value.streetName) : '',
);
const streets = computed(() => catalog.streets.filter((s) => s.id !== rest.value?.streetId));
const picked = computed(() => catalog.streets.find((s) => s.id === target.value) ?? null);
watch(
  () => props.open,
  (v) => {
    if (v) target.value = null;
  },
);

async function move() {
  if (target.value === null || busy.value) return;
  busy.value = true;
  try {
    await endpoints.move(target.value);
    toast.push(t.value.society.move.done(catalog.streetName(target.value)));
    await restaurant.refresh().catch(() => undefined);
    emit('done');
  } catch (e) {
    toast.push(errorMessage(e, t.value.society.move.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <DtSheet :open="open" :title="t.society.move.title" @close="emit('close')">
    <div class="dt-detail-head">
      <span class="dt-detail-art"><DtArt name="town-sign" :size="52" /></span>
      <div class="dt-detail-info">
        <div>{{ t.society.move.here(here) }}</div>
        <div class="dt-detail-sub">{{ t.society.move.medal }}</div>
      </div>
    </div>
    <label class="dt-field-label-top mt-3" for="dt-move-street">{{ t.society.move.where }}</label>
    <select
      id="dt-move-street"
      v-model="target"
      class="form-select dt-field-select"
      data-testid="move-street"
    >
      <option :value="null" disabled>{{ t.society.move.pick }}</option>
      <option v-for="s in streets" :key="s.id" :value="s.id">
        {{ t.society.move.option(s.name, s.cookName) }}
      </option>
    </select>
    <div v-if="picked" class="dt-move-pick" data-testid="move-picked">
      <div>
        <!-- 街道类型和为什么是这个加成（问题记录 380、378 方案 C） -->
        <span v-if="picked.focus" class="dt-tag dt-tag-primary me-1" data-testid="move-focus">{{
          STREET_FOCUS[picked.focus]
        }}</span>
        <b data-testid="move-bonus">{{ t.society.move.bonus(picked.desc) }}</b>
      </div>
      <div v-if="picked.theme" class="dt-move-theme" data-testid="move-theme">{{ picked.theme }}</div>
    </div>
    <dl class="dt-sum">
      <div>
        <dt>{{ t.society.move.card }}</dt>
        <dd>{{ t.society.move.cardNum }}</dd>
      </div>
      <div>
        <dt>{{ t.society.move.costLabel }}</dt>
        <dd data-testid="move-cost">{{ cost === null ? '—' : t.society.move.costValue(formatNum(cost)) }}</dd>
      </div>
    </dl>
    <p class="dt-detail-note">{{ t.society.move.permit }}</p>
    <template #actions>
      <div class="dt-sheet-pair">
        <button type="button" class="btn btn-light" @click="emit('close')">{{ t.common.cancel }}</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy || target === null"
          data-testid="move-ok"
          @click="move"
        >
          {{ t.society.move.btn }}
        </button>
      </div>
    </template>
  </DtSheet>
</template>
