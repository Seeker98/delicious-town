<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DuelInfoDto, DuelResultDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import DuelResult from './DuelResult.vue';

const props = defineProps<{ restId: number }>();
const toast = useToastStore();
const info = ref<DuelInfoDto | null>(null);
const last = ref<DuelResultDto | null>(null);
const busy = ref(false);
/** 区服没开放厨塔：整块不显示 */
const disabled = ref(false);

async function load() {
  try {
    info.value = await endpoints.duelInfo(props.restId);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'FEATURE_DISABLED') {
      disabled.value = true;
      return;
    }
    toast.push(errorMessage(e, '读取切磋次数失败'), 'danger');
  }
}
const block = computed(() => {
  const i = info.value;
  if (!i) return '';
  if (i.left <= 0) return '今天和它切磋的次数用完了';
  if (i.strength < i.duelStrength) return `体力不够（要 ${i.duelStrength}）`;
  return '';
});
async function duel() {
  if (busy.value || !info.value || block.value) return;
  busy.value = true;
  try {
    last.value = await endpoints.friendDuel(props.restId);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '切磋失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div v-if="!disabled" data-testid="friend-duel">
    <button
      class="btn btn-sm btn-outline-success"
      data-testid="act-duel"
      :disabled="busy || !info || !!block"
      @click="duel"
    >
      切磋{{ info ? `（今天还能 ${info.left} 次）` : '' }}
    </button>
    <span v-if="block" class="small text-danger ms-1" data-testid="duel-block">{{ block }}</span>
    <DuelResult v-if="last" :result="last" />
  </div>
</template>
