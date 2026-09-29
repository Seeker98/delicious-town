<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { USERNAME_RE } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import TurnstileBox from '../components/TurnstileBox.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const form = ref({ username: '', password: '', password2: '', email: '', inviteCode: '' });
const captchaToken = ref('');
const turnstile = ref<InstanceType<typeof TurnstileBox> | null>(null);
const error = ref('');
const busy = ref(false);
const router = useRouter();
const session = useSessionStore();

const localError = computed(() => {
  const f = form.value;
  if (f.username && !USERNAME_RE.test(f.username))
    return '用户名为 2~9 个字，只能用中文、字母、数字、下划线和减号';
  if (f.password && f.password.length < 6) return '密码至少 6 位';
  if (f.password2 && f.password !== f.password2) return '两次输入的密码不一致';
  return '';
});

async function submit() {
  if (localError.value) return;
  busy.value = true;
  error.value = '';
  try {
    session.me = await endpoints.register({
      username: form.value.username,
      password: form.value.password,
      email: form.value.email,
      inviteCode: form.value.inviteCode || undefined,
      captchaToken: captchaToken.value,
    });
    await router.replace({ name: 'shards' });
  } catch (e) {
    error.value = errorMessage(e, '注册失败');
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
      <h5 class="card-title">注册美味小镇</h5>
      <form @submit.prevent="submit">
        <input
          v-model.trim="form.username"
          class="form-control mb-2"
          placeholder="用户名"
          autocomplete="username"
          required
        />
        <input
          v-model="form.password"
          type="password"
          class="form-control mb-2"
          placeholder="密码"
          autocomplete="new-password"
          required
        />
        <input
          v-model="form.password2"
          type="password"
          class="form-control mb-2"
          placeholder="确认密码"
          autocomplete="new-password"
          required
        />
        <input
          v-model.trim="form.email"
          type="email"
          class="form-control mb-2"
          placeholder="邮箱"
          autocomplete="email"
          required
        />
        <input v-model.trim="form.inviteCode" class="form-control mb-2" placeholder="邀请码（可不填）" />
        <TurnstileBox ref="turnstile" @token="captchaToken = $event" />
        <div v-if="localError || error" class="alert alert-danger py-1 my-2">{{ localError || error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy || !captchaToken">注册</button>
      </form>
      <div class="mt-2 small"><RouterLink to="/login">已有账号？去登录</RouterLink></div>
    </div>
  </div>
</template>
