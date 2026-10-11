<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import AuthField from '../components/auth/AuthField.vue';
import AuthScene from '../components/auth/AuthScene.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';

/** 重设密码（界面改版 P11）：矮版头图 + 表单卡；改好以后同一张卡换成结果（绿圈对号 + 去登录） */
const route = useRoute();
const password = ref('');
const password2 = ref('');
const done = ref(false);
const error = ref('');
const busy = ref(false);
const t = useT();
const pwErr = computed(() => (password.value && password.value.length < 6 ? t.value.auth.passwordMin : ''));
const pw2Err = computed(() =>
  password2.value && password.value !== password2.value ? t.value.auth.passwordMismatch : '',
);

async function submit() {
  if (pwErr.value || pw2Err.value) return;
  busy.value = true;
  error.value = '';
  try {
    const token = typeof route.query.token === 'string' ? route.query.token : '';
    await endpoints.resetPassword({ token, password: password.value });
    done.value = true;
  } catch (e) {
    error.value = errorMessage(e, t.value.auth.resetFailed);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthScene short />
  <section class="dt-auth-card">
    <div v-if="done" class="dt-auth-result" data-testid="reset-done">
      <span class="dt-auth-ring is-ok" aria-hidden="true">✓</span>
      <b>{{ t.auth.resetDoneTitle }}</b>
      <span>{{ t.auth.resetDone }}</span>
      <RouterLink to="/login" class="btn btn-primary dt-btn-block dt-auth-submit">{{
        t.auth.goLogin
      }}</RouterLink>
    </div>
    <template v-else>
      <div v-if="error" class="dt-auth-error" role="alert">{{ error }}</div>
      <h2 class="dt-auth-title">{{ t.auth.resetTitle }}</h2>
      <form @submit.prevent="submit">
        <AuthField
          v-model="password"
          :label="t.auth.newPassword"
          type="password"
          autocomplete="new-password"
          :placeholder="t.account.pwRange"
          :error="pwErr"
          required
        />
        <AuthField
          v-model="password2"
          :label="t.auth.newPassword2"
          type="password"
          autocomplete="new-password"
          :placeholder="t.auth.again"
          :error="pw2Err"
          required
        />
        <button class="btn btn-primary dt-btn-block dt-auth-submit" :disabled="busy">
          {{ t.common.confirm }}
        </button>
      </form>
      <p class="dt-auth-links is-center">
        <RouterLink to="/login" class="dt-go">{{ t.auth.goLogin }}</RouterLink>
      </p>
    </template>
  </section>
</template>
