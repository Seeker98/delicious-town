<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const route = useRoute();
const session = useSessionStore();
const state = ref<'pending' | 'ok' | 'error'>('pending');
const error = ref('');

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : '';
  try {
    await endpoints.verifyEmail(token);
    state.value = 'ok';
    if (session.me) session.me = { ...session.me, emailVerified: true };
  } catch (e) {
    state.value = 'error';
    error.value = errorMessage(e, '验证失败');
  }
});
</script>

<template>
  <div class="card">
    <div class="card-body text-center">
      <p v-if="state === 'pending'">正在验证……</p>
      <p v-else-if="state === 'ok'" class="text-success">邮箱验证成功！</p>
      <p v-else class="text-danger">{{ error }}</p>
      <RouterLink to="/shards">进入小镇</RouterLink>
    </div>
  </div>
</template>
