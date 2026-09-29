<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { OilNeedDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import NeedChecks from '../components/NeedChecks.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const toast = useToastStore();
const need = ref<OilNeedDto | null>(null);
const busy = ref(false);

async function load() {
  need.value = await endpoints.oilNeed();
}
async function expand() {
  busy.value = true;
  try {
    await endpoints.oilExpand();
    toast.push('油壶扩容成功');
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '扩容失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取失败'), 'danger')));
</script>

<template>
  <div v-if="need">
    <h5>油壶扩容（当前 {{ need.oilLevel }} 级，上限 {{ formatNum(need.oilMax) }}）</h5>
    <template v-if="need.nextLevel">
      <p class="small">扩容到 {{ need.nextLevel }} 级后上限 {{ formatNum(need.nextOilMax ?? 0) }}</p>
      <NeedChecks :checks="need.checks" />
    </template>
    <p v-else class="small text-muted">已经是最高级</p>
    <button class="btn btn-primary w-100" :disabled="busy || !need.ok" @click="expand">扩容</button>
  </div>
</template>
