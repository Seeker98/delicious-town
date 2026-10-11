<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DuelInfoDto, DuelResultDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import DtSheet from '../DtSheet.vue';
import DuelResult from './DuelResult.vue';
import DuelRules from './DuelRules.vue';

/** 好友餐厅操作块里的一格（界面改版 P10）：名字、今天还能几次或为什么不能比；结果和规则从下面弹出 */
const props = defineProps<{ restId: number }>();
const toast = useToastStore();
const t = useT();
const info = ref<DuelInfoDto | null>(null);
const last = ref<DuelResultDto | null>(null);
const busy = ref(false);
/** 切磋结果从下面弹出（界面改版 P9，和厨塔一样） */
const resultOpen = ref(false);
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
    resultOpen.value = true;
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
  <button
    v-if="!disabled"
    type="button"
    :class="['dt-do', { 'is-off': !!block }]"
    data-testid="act-duel"
    :disabled="busy || !info || !!block"
    @click="duel"
  >
    <span class="dt-do-title">{{ t.tower.friend.tile }}</span>
    <span class="dt-do-sub" :data-testid="block ? 'duel-block' : 'duel-left'">{{
      block || (info ? t.tower.friend.leftN(info.left) : '')
    }}</span>
  </button>
  <DtSheet :open="resultOpen && !!last" :title="t.tower.duel.resultTitle" @close="resultOpen = false">
    <DuelResult v-if="last" :result="last" />
    <!-- 切磋过一次再给规则（问题记录 396） -->
    <DuelRules v-if="last" class="mt-2" :judge-count="last.judgeCount" :weights="last.weights" />
    <template #actions>
      <button type="button" class="btn btn-light dt-btn-block" @click="resultOpen = false">
        {{ t.tower.duel.ok }}
      </button>
    </template>
  </DtSheet>
</template>
