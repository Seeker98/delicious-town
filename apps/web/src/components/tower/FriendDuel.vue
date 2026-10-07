<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DuelInfoDto, DuelResultDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import DuelResult from './DuelResult.vue';
import DuelRules from './DuelRules.vue';

const props = defineProps<{ restId: number }>();
const toast = useToastStore();
const t = useT();
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
    toast.push(errorMessage(e, t.value.tower.friend.loadFailed), 'danger');
  }
}
const block = computed(() => {
  const i = info.value;
  if (!i) return '';
  if (i.left <= 0) return t.value.tower.friend.noMore;
  if (i.strength < i.duelStrength) return t.value.tower.noStrength(i.duelStrength);
  return '';
});
async function duel() {
  if (busy.value || !info.value || block.value) return;
  busy.value = true;
  try {
    last.value = await endpoints.friendDuel(props.restId);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.tower.friend.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div v-if="!disabled" data-testid="friend-duel">
    <button
      class="btn btn-sm btn-outline-primary"
      data-testid="act-duel"
      :disabled="busy || !info || !!block"
      @click="duel"
    >
      {{ t.tower.friend.btn }}{{ info ? t.tower.friend.left(info.left) : '' }}
    </button>
    <span v-if="block" class="small text-danger ms-1" data-testid="duel-block">{{ block }}</span>
    <DuelResult v-if="last" :result="last" />
    <!-- 切磋过一次再给规则（问题记录 396），平时只是好友店里的一个按钮 -->
    <DuelRules v-if="last" class="mt-1" :judge-count="last.judgeCount" :weights="last.weights" />
  </div>
</template>
