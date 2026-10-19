<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import AuthField from '../auth/AuthField.vue';
import DtSheet from '../DtSheet.vue';

/**
 * 改邮箱面板（2026-10-19：注册时邮箱写错、收不到验证邮件的人一直卡着）：新邮箱、登录密码；
 * 只有还没验证的邮箱才有入口。改好后服务端往新邮箱发验证邮件，面板关掉、顶上出提示
 */
const props = defineProps<{ open: boolean; current: string }>();
const emit = defineEmits<{ close: []; changed: [email: string] }>();
const t = useT();
const session = useSessionStore();
const toast = useToastStore();
const email = ref('');
const pw = ref('');
const busy = ref(false);
const error = ref('');

watch(
  () => props.open,
  (v) => {
    if (v) email.value = pw.value = error.value = '';
  },
);
const ready = computed(() => /\S+@\S+\.\S+/.test(email.value.trim()) && Boolean(pw.value) && !busy.value);

async function submit() {
  if (!ready.value) return;
  busy.value = true;
  error.value = '';
  try {
    const r = await endpoints.changeEmail({ email: email.value.trim(), password: pw.value });
    if (session.me) session.me = { ...session.me, email: r.email };
    emit('changed', r.email);
    emit('close');
    if (r.mailSent) toast.push(t.value.account.emailChanged(r.email), 'success');
    else toast.push(t.value.account.emailChangedNoMail(r.email), 'info');
  } catch (e) {
    error.value = errorMessage(e, t.value.account.changeFailed);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <DtSheet :open="open" :title="t.account.changeEmail" @close="emit('close')">
    <form id="dt-email-form" @submit.prevent="submit">
      <AuthField
        v-model="email"
        :label="t.account.newEmail"
        type="email"
        autocomplete="email"
        :hint="t.account.emailNow(current)"
        testid="acc-new-email"
      />
      <AuthField
        v-model="pw"
        :label="t.account.loginPw"
        type="password"
        autocomplete="current-password"
        :error="error"
        testid="acc-email-pw"
      />
    </form>
    <p class="dt-detail-note">{{ t.account.emailNote }}</p>
    <template #actions>
      <div class="dt-sheet-pair">
        <button type="button" class="btn btn-light" @click="emit('close')">{{ t.common.cancel }}</button>
        <button
          type="submit"
          form="dt-email-form"
          class="btn btn-primary"
          :disabled="!ready"
          data-testid="acc-email-save"
        >
          {{ t.account.changeEmailBtn }}
        </button>
      </div>
    </template>
  </DtSheet>
</template>
