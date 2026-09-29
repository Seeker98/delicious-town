<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';

const route = useRoute();
const password = ref('');
const password2 = ref('');
const done = ref(false);
const error = ref('');
const busy = ref(false);
const localError = computed(() => {
  if (password.value && password.value.length < 6) return '密码至少 6 位';
  if (password2.value && password.value !== password2.value) return '两次输入的密码不一致';
  return '';
});

async function submit() {
  if (localError.value) return;
  busy.value = true;
  error.value = '';
  try {
    const token = typeof route.query.token === 'string' ? route.query.token : '';
    await endpoints.resetPassword({ token, password: password.value });
    done.value = true;
  } catch (e) {
    error.value = errorMessage(e, '重置失败');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">设置新密码</h5>
      <p v-if="done" class="text-success">密码已重置，所有设备都已退出登录。</p>
      <form v-else @submit.prevent="submit">
        <input
          v-model="password"
          type="password"
          class="form-control mb-2"
          placeholder="新密码"
          autocomplete="new-password"
          required
        />
        <input
          v-model="password2"
          type="password"
          class="form-control mb-2"
          placeholder="确认新密码"
          autocomplete="new-password"
          required
        />
        <div v-if="localError || error" class="alert alert-danger py-1">{{ localError || error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy">确定</button>
      </form>
      <div class="mt-2 small"><RouterLink to="/login">去登录</RouterLink></div>
    </div>
  </div>
</template>
