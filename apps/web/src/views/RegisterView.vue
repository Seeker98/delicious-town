<script setup lang="ts">
import { useLocaleStore } from '../stores/locale';
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { USERNAME_RE } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import AuthField from '../components/auth/AuthField.vue';
import AuthScene from '../components/auth/AuthScene.vue';
import TurnstileBox from '../components/TurnstileBox.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

/**
 * 注册（界面改版 P11）：矮版小镇门口头图 + 表单卡。哪一格不对就在那一格下面写红字、框变红，不在顶上统一报错；
 * 服务端的错（用户名被占用、人机验证失败）写在卡片顶上。
 * 邀请链接 /register?invite=XXXX 带来的码自动填上（子项目 6A-2）
 */
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

const userErr = computed(() => {
  const u = form.value.username.trim();
  return u && !USERNAME_RE.test(u) ? t.value.auth.usernameRule : '';
});
const pwErr = computed(() =>
  form.value.password && form.value.password.length < 6 ? t.value.auth.passwordMin : '',
);
const pw2Err = computed(() =>
  form.value.password2 && form.value.password !== form.value.password2 ? t.value.auth.passwordMismatch : '',
);

async function submit() {
  if (userErr.value || pwErr.value || pw2Err.value) return;
  busy.value = true;
  error.value = '';
  try {
    const me = await endpoints.register({
      username: form.value.username.trim(),
      password: form.value.password,
      email: form.value.email.trim(),
      inviteCode: form.value.inviteCode.trim() || undefined,
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
  <AuthScene short />
  <section class="dt-auth-card">
    <div v-if="error" class="dt-auth-error" role="alert">{{ error }}</div>
    <h2 class="dt-auth-title">{{ t.auth.registerTitle }}</h2>
    <p class="dt-auth-sub">{{ t.auth.registerSub }}</p>
    <form @submit.prevent="submit">
      <AuthField
        v-model="form.username"
        :label="t.auth.username"
        autocomplete="username"
        :error="userErr"
        required
      />
      <AuthField
        v-model="form.password"
        :label="t.auth.password"
        type="password"
        autocomplete="new-password"
        :placeholder="t.account.pwRange"
        :error="pwErr"
        required
      />
      <AuthField
        v-model="form.password2"
        :label="t.auth.password2"
        type="password"
        autocomplete="new-password"
        :placeholder="t.auth.again"
        :error="pw2Err"
        required
      />
      <AuthField
        v-model="form.email"
        :label="t.auth.email"
        type="email"
        autocomplete="email"
        :placeholder="t.auth.emailPh"
        :hint="t.auth.emailHint"
        required
      />
      <AuthField
        v-model="form.inviteCode"
        :label="t.auth.inviteLabel"
        :optional="t.auth.optional"
        :hint="t.auth.inviteHint"
      />
      <TurnstileBox ref="turnstile" class="mt-3" @token="captchaToken = $event" />
      <button class="btn btn-primary dt-btn-block dt-auth-submit" :disabled="busy || !captchaToken">
        {{ t.auth.register }}
      </button>
    </form>
    <p class="dt-auth-links is-center">
      {{ t.auth.haveAccount }} <RouterLink to="/login" class="dt-go">{{ t.auth.goLogin }}</RouterLink>
    </p>
  </section>
</template>
