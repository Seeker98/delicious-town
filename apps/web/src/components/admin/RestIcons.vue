<script setup lang="ts">
import { adminTime } from '../../utils/gameInput';
import { computed, onMounted, ref, watch } from 'vue';
import type { AdminIconDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import TitlePicker from './TitlePicker.vue';

/** 玩家页的个性图标：直接发（不发邮件、玩家没有通知）、收回；能发定制称号、能限时（问题记录 539） */
const props = defineProps<{ restId: number }>();
type Picked = { key: string; title: string; days?: number; until?: string };
const icons = ref<AdminIconDto[]>([]);
const pick = ref<Picked>({ key: '', title: '' });
const pickerKey = ref(0);
const error = ref('');
const busy = ref(false);
/** 选了限时却没填完（天数 0、时间空串）时不能发 */
const ready = computed(
  () =>
    Boolean(pick.value.key) &&
    (pick.value.days === undefined || (pick.value.days >= 1 && pick.value.days <= 3650)) &&
    pick.value.until !== '',
);

async function load() {
  try {
    icons.value = await adminApi.icons(props.restId);
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, '读取图标失败');
  }
}

async function run(fn: () => Promise<AdminIconDto[]>) {
  busy.value = true;
  try {
    icons.value = await fn();
    error.value = '';
    return true;
  } catch (e) {
    error.value = errorMessage(e, '操作失败');
    return false;
  } finally {
    busy.value = false;
  }
}

async function grant() {
  const p = pick.value;
  if (!ready.value || !window.confirm(`给餐厅 #${props.restId} 发放图标「${p.title || p.key}」？`)) return;
  const b = {
    key: p.key,
    ...(p.days !== undefined ? { days: p.days } : {}),
    ...(p.until !== undefined ? { until: p.until } : {}),
  };
  if (await run(() => adminApi.grantIcon(props.restId, b))) {
    pick.value = { key: '', title: '' };
    pickerKey.value++;
  }
}
function revoke(i: AdminIconDto) {
  if (!window.confirm(`收回「${i.title}」？`)) return;
  return run(() => adminApi.revokeIcon(props.restId, i.id));
}

onMounted(load);
watch(() => props.restId, load);
</script>

<template>
  <div class="border rounded p-2 mb-2">
    <h6 class="mb-1">个性图标</h6>
    <div v-if="error" class="text-danger small">{{ error }}</div>
    <div class="mb-1">
      <span v-for="i in icons" :key="i.id" class="badge bg-warning text-dark me-1">
        {{ i.title }}<span v-if="i.shown">（展示中）</span
        ><span v-if="i.expiresAt" :data-testid="`icon-expires-${i.id}`"
          >（限时，{{ adminTime(i.expiresAt) }} 到期）</span
        >
        <button class="btn btn-link btn-sm p-0 ms-1" :disabled="busy" @click="revoke(i)">收回</button>
      </span>
      <span v-if="icons.length === 0" class="small text-muted">没有</span>
    </div>
    <div class="d-flex gap-1 align-items-start">
      <TitlePicker :key="pickerKey" v-model="pick" testid="icon" class="flex-fill" />
      <button
        class="btn btn-sm btn-primary text-nowrap"
        data-testid="icon-grant"
        :disabled="busy || !ready"
        @click="grant"
      >
        发放
      </button>
    </div>
  </div>
</template>
