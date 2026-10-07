<script setup lang="ts">
import { useLocaleStore } from '../stores/locale';
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { USERNAME_RE } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import TurnstileBox from '../components/TurnstileBox.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

/** 邀请链接 /register?invite=XXXX 带来的码自动填上（子项目 6A-2） */
const route = useRoute();
const form = ref({
  username: '',
  password: '',
  password2: '',
  email: '',
  inviteCode: typeof route.query.invite === 'string' ? route.query.invite : '',
});
const captchaToken = ref('');
const turnstile = ref<InstanceType<typeof TurnstileBox> | null>(null);
const error = ref('');
const busy = ref(false);
const router = useRouter();
const session = useSessionStore();
const locale = useLocaleStore();
const t = useT();

const localError = computed(() => {
  const f = form.value;
  if (f.username && !USERNAME_RE.test(f.username)) return t.value.auth.usernameRule;
  if (f.password && f.password.length < 6) return t.value.auth.passwordMin;
  if (f.password2 && f.password !== f.password2) return t.value.auth.passwordMismatch;
  return '';
});

async function submit() {
  if (localError.value) return;
  busy.value = true;
  error.value = '';
  try {
    const me = await endpoints.register({
      username: form.value.username,
      password: form.value.password,
      email: form.value.email,
      inviteCode: form.value.inviteCode || undefined,
      captchaToken: captchaToken.value,
      // 注册时带上当前界面语言（问题记录 272）
      lang: locale.locale,
    });
    await session.applyMe(me);
    await router.replace({ name: 'shards' });
  } catch (e) {
    error.value = errorMessage(e, t.value.auth.registerFailed);
    // 人机验证令牌只能用一次，失败后作废并重新出题
    captchaToken.value = '';
    turnstile.value?.reset();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">{{ t.auth.registerTitle }}</h5>
      <form @submit.prevent="submit">
        <input
          v-model.trim="form.username"
          class="form-control mb-2"
          :placeholder="t.auth.username"
          autocomplete="username"
          required
        />
        <input
          v-model="form.password"
          type="password"
          class="form-control mb-2"
          :placeholder="t.auth.password"
          autocomplete="new-password"
          required
        />
        <input
          v-model="form.password2"
          type="password"
          class="form-control mb-2"
          :placeholder="t.auth.password2"
          autocomplete="new-password"
          required
        />
        <input
          v-model.trim="form.email"
          type="email"
          class="form-control mb-2"
          :placeholder="t.auth.email"
          autocomplete="email"
          required
        />
        <input v-model.trim="form.inviteCode" class="form-control mb-2" :placeholder="t.auth.inviteCode" />
        <TurnstileBox ref="turnstile" @token="captchaToken = $event" />
        <div v-if="localError || error" class="alert alert-danger py-1 my-2">{{ localError || error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy || !captchaToken">{{ t.auth.register }}</button>
      </form>
      <div class="mt-2 small">
        <RouterLink to="/login" class="dt-go">{{ t.auth.toLogin }}</RouterLink>
      </div>
    </div>
  </div>
</template>
