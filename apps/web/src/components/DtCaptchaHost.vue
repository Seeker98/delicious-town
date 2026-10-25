<script setup lang="ts">
import { inject, onBeforeUnmount, watch } from 'vue';
import { routeLocationKey } from 'vue-router';
import { useT } from '../composables/useT';
import { useCaptchaStore } from '../stores/captcha';
import DtSheet from './DtSheet.vue';
import TurnstileBox from './TurnstileBox.vue';

/** 人机验证面板（防脚本 PR②）：App 里挂一次；拿到令牌后被拦的操作会自动重发 */
const store = useCaptchaStore();
const t = useT();
// 换了页面：按关掉处理，不在新页面上重发上一页的操作（照确认面板）
const route = inject(routeLocationKey, null);
watch(
  () => route?.fullPath,
  () => {
    if (store.open) store.answer(null);
  },
);
onBeforeUnmount(() => {
  if (store.open) store.answer(null);
});
</script>

<template>
  <DtSheet top :open="store.open" :title="t.common.captchaTitle" @close="store.answer(null)">
    <p class="dt-sheet-text">{{ t.common.captchaBody }}</p>
    <TurnstileBox v-if="store.open" @token="store.answer($event)" />
  </DtSheet>
</template>
