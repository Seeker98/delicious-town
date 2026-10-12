<script setup lang="ts">
import { adminShort } from '../../utils/gameInput';
import { computed, onMounted, ref, watch } from 'vue';
import type { AdminIconDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import AdmBox from './kit/AdmBox.vue';
import TitlePicker from './TitlePicker.vue';
import { useConfirmStore } from '../../stores/confirm';

/** 玩家页的个性图标：直接发（不发邮件、玩家没有通知）、收回；能发定制称号、能限时（问题记录 539） */
const props = defineProps<{ restId: number }>();
type Picked = { key: string; title: string; days?: number; until?: string };
const icons = ref<AdminIconDto[]>([]);
const pick = ref<Picked>({ key: '', title: '' });
const pickerKey = ref(0);
const error = ref('');
const busy = ref(false);
const confirm = useConfirmStore();
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
  if (!ready.value) return;
  if (
    !(await confirm.ask({
      title: `给餐厅 #${props.restId} 发放图标「${p.title || p.key}」？`,
      body: '直接发到店里, 不发邮件, 玩家没有通知。',
      ok: '发放',
    }))
  )
    return;
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
async function revoke(i: AdminIconDto) {
  if (
    !(await confirm.ask({
      title: `收回「${i.title}」？`,
      body: '收回后店里不再显示这个图标。',
      ok: '收回',
      danger: true,
    }))
  )
    return;
  return run(() => adminApi.revokeIcon(props.restId, i.id));
}

onMounted(load);
watch(() => props.restId, load);
</script>

<template>
  <AdmBox title="个性图标" :sub="`${icons.length} 个`">
    <div v-if="error" class="dt-adm-bad dt-adm-small">{{ error }}</div>
    <div class="dt-adm-line">
      <span v-for="i in icons" :key="i.id" class="dt-adm-line dt-adm-icon">
        <span class="dt-adm-chip is-w"
          >{{ i.title }}<template v-if="i.shown"> · 展示中</template
          ><span v-if="i.expiresAt" :data-testid="`icon-expires-${i.id}`">
            · 限时到 {{ adminShort(i.expiresAt) }}</span
          ></span
        >
        <button type="button" class="dt-adm-btn is-t is-sm" :disabled="busy" @click="revoke(i)">收回</button>
      </span>
      <span v-if="icons.length === 0" class="dt-adm-mu">还没有</span>
    </div>
    <div class="dt-adm-line dt-adm-mt dt-adm-icon-pick">
      <TitlePicker :key="pickerKey" v-model="pick" testid="icon" class="dt-adm-grow" />
      <button
        type="button"
        class="dt-adm-btn is-sp"
        data-testid="icon-grant"
        :disabled="busy || !ready"
        @click="grant"
      >
        发放
      </button>
    </div>
  </AdmBox>
</template>
