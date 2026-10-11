<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';
import DtArt from '../DtArt.vue';
import DtSheet from '../DtSheet.vue';

/** 改名面板（界面改版 P10：原来是协会里单独一页）：输入框带字数、规则一行、现在的名字；改完关面板 */
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; done: [] }>();
const t = useT();
const toast = useToastStore();
const restaurant = useRestaurantStore();
const MAX = 9;
const name = ref('');
const busy = ref(false);
const len = computed(() => [...name.value.trim()].length);
watch(
  () => props.open,
  (v) => {
    if (v) name.value = '';
  },
);

async function submit() {
  if (busy.value || len.value === 0) return;
  busy.value = true;
  try {
    const r = await endpoints.rename(name.value.trim());
    toast.push(t.value.society.rename.done(r.name));
    void restaurant.refresh().catch(() => undefined);
    emit('done');
  } catch (e) {
    toast.push(errorMessage(e, t.value.society.rename.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <DtSheet :open="open" :title="t.society.rename.title" @close="emit('close')">
    <div class="dt-detail-head">
      <span class="dt-detail-art"><DtArt name="goods-card" :size="52" /></span>
      <div class="dt-detail-info">
        <div>{{ t.society.rename.cost }}</div>
        <div v-if="restaurant.rest" class="dt-detail-sub">
          {{ t.society.rename.nowName(restaurant.rest.name) }}
        </div>
      </div>
    </div>
    <form id="dt-rename-form" class="mt-3" @submit.prevent="submit">
      <label class="dt-field" :class="{ 'is-over': len > MAX }">
        <span class="visually-hidden">{{ t.society.rename.placeholder }}</span>
        <input
          v-model="name"
          class="dt-field-input"
          :placeholder="t.society.rename.placeholder"
          maxlength="32"
          data-testid="rename-input"
        />
        <span class="dt-field-count" data-testid="rename-count">{{ len }} / {{ MAX }}</span>
      </label>
    </form>
    <p class="dt-detail-note">{{ t.society.rename.rule }}</p>
    <template #actions>
      <div class="dt-sheet-pair">
        <button type="button" class="btn btn-light" @click="emit('close')">{{ t.common.cancel }}</button>
        <button
          type="submit"
          form="dt-rename-form"
          class="btn btn-primary"
          :disabled="busy || len === 0 || len > MAX"
          data-testid="rename-ok"
        >
          {{ t.society.rename.btn }}
        </button>
      </div>
    </template>
  </DtSheet>
</template>
