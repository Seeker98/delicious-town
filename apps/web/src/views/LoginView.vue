<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
const router = useRouter();
const route = useRoute();
const session = useSessionStore();

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    session.me = await endpoints.login({ username: username.value, password: password.value });
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/shards';
    await router.replace(redirect);
  } catch (e) {
    error.value = errorMessage(e, '登录失败');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">登录美味小镇</h5>
      <form @submit.prevent="submit">
        <input
          v-model.trim="username"
          class="form-control mb-2"
          placeholder="用户名"
          autocomplete="username"
          required
        />
        <input
          v-model="password"
          type="password"
          class="form-control mb-2"
          placeholder="密码"
          autocomplete="current-password"
          required
        />
        <div v-if="error" class="alert alert-danger py-1">{{ error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy">登录</button>
      </form>
      <div class="d-flex justify-content-between mt-2 small">
        <RouterLink to="/register">注册新账号</RouterLink>
        <RouterLink to="/forgot-password">忘记密码</RouterLink>
      </div>
    </div>
  </div>
</template>
