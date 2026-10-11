<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useT } from '../composables/useT';
import { useConfirmStore } from '../stores/confirm';
import DtSheet from './DtSheet.vue';

/** 确认面板（界面改版 P3）：App 里挂一次，显示 useConfirmStore().ask 的当前请求 */
const store = useConfirmStore();
const t = useT();
onMounted(() => store.hosts++);
onBeforeUnmount(() => {
  store.hosts--;
  if (store.current) store.answer(false);
});
</script>

<template>
  <DtSheet :open="store.current !== null" :title="store.current?.title ?? ''" @close="store.answer(false)">
    <p v-if="store.current?.body" class="dt-sheet-text">{{ store.current.body }}</p>
    <template #actions>
      <button
        type="button"
        class="btn btn-outline-secondary"
        data-testid="confirm-cancel"
        @click="store.answer(false)"
      >
        {{ t.common.cancel }}
      </button>
      <button
        type="button"
        :class="['btn', store.current?.danger ? 'btn-outline-danger' : 'btn-primary']"
        data-testid="confirm-ok"
        @click="store.answer(true)"
      >
        {{ store.current?.ok ?? t.common.confirm }}
      </button>
    </template>
  </DtSheet>
</template>
