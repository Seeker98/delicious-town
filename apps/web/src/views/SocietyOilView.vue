<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { OilNeedDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import NeedChecks from '../components/NeedChecks.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const toast = useToastStore();
const t = useT();
const need = ref<OilNeedDto | null>(null);
const busy = ref(false);

async function load() {
  need.value = await endpoints.oilNeed();
}
async function expand() {
  busy.value = true;
  try {
    await endpoints.oilExpand();
    toast.push(t.value.society.oil.done);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.society.oil.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.common.loadFailed), 'danger')));
</script>

<template>
  <div v-if="need">
    <h5>{{ t.society.oil.title(need.oilLevel, formatNum(need.oilMax)) }}</h5>
    <template v-if="need.nextLevel">
      <p class="small">{{ t.society.oil.next(need.nextLevel, formatNum(need.nextOilMax ?? 0)) }}</p>
      <NeedChecks :checks="need.checks" />
    </template>
    <p v-else class="small text-muted">{{ t.society.oil.maxed }}</p>
    <button class="btn btn-primary w-100" :disabled="busy || !need.ok" @click="expand">
      {{ t.society.oil.btn }}
    </button>
  </div>
</template>
