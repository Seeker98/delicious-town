<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import AuthField from '../auth/AuthField.vue';
import DtSheet from '../DtSheet.vue';

/**
 * 修改密码面板（界面改版 P11：原来在账号页里直接摆表单）：旧密码、新密码、再输一次；
 * 改好后其他设备下线，面板关掉、顶上出提示；本机没换上新会话就去登录页
 */
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const t = useT();
const router = useRouter();
const session = useSessionStore();
const toast = useToastStore();
const oldPw = ref('');
const newPw = ref('');
const newPw2 = ref('');
const busy = ref(false);
const error = ref('');

watch(
  () => props.open,
  (v) => {
    if (v) oldPw.value = newPw.value = newPw2.value = error.value = '';
  },
);
const shortErr = computed(() => (newPw.value && newPw.value.length < 6 ? t.value.auth.passwordMin : ''));
const mismatch = computed(() =>
  newPw2.value && newPw2.value !== newPw.value ? t.value.account.pwMismatch : '',
);
const ready = computed(
  () => Boolean(oldPw.value) && newPw.value.length >= 6 && newPw.value === newPw2.value && !busy.value,
);

async function submit() {
  if (!ready.value) return;
  busy.value = true;
  error.value = '';
  try {
    const r = await endpoints.changePassword({ oldPassword: oldPw.value, newPassword: newPw.value });
    emit('close');
    if (r.relogin) {
      // 密码已改，但本机没换上新会话（backlog 账号）：提示后去登录页
      toast.push(t.value.account.pwRelogin, 'info');
      session.me = null;
      await router.replace('/login');
      return;
    }
    toast.push(t.value.account.pwChanged, 'success');
  } catch (e) {
    error.value = errorMessage(e, t.value.account.changeFailed);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <DtSheet :open="open" :title="t.account.changePw" @close="emit('close')">
    <form id="dt-pw-form" @submit.prevent="submit">
      <AuthField
        v-model="oldPw"
        :label="t.account.oldPw"
        type="password"
        autocomplete="current-password"
        :error="error"
        testid="acc-old"
      />
      <AuthField
        v-model="newPw"
        :label="t.account.newPw"
        type="password"
        autocomplete="new-password"
        :placeholder="t.account.pwRange"
        :hint="t.account.pwRange"
        :error="shortErr"
        testid="acc-new"
      />
      <AuthField
        v-model="newPw2"
        :label="t.account.newPw2"
        type="password"
        autocomplete="new-password"
        :placeholder="t.auth.again"
        :error="mismatch"
        testid="acc-new2"
      />
    </form>
    <p class="dt-detail-note">{{ t.account.pwNote }}</p>
    <template #actions>
      <div class="dt-sheet-pair">
        <button type="button" class="btn btn-light" @click="emit('close')">{{ t.common.cancel }}</button>
        <button
          type="submit"
          form="dt-pw-form"
          class="btn btn-primary"
          :disabled="!ready"
          data-testid="acc-change"
        >
          {{ t.account.changePwBtn }}
        </button>
      </div>
    </template>
  </DtSheet>
</template>
