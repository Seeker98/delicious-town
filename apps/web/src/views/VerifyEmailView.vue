<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const route = useRoute();
const session = useSessionStore();
const state = ref<'pending' | 'ok' | 'error'>('pending');
const error = ref('');
const t = useT();

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : '';
  try {
    await endpoints.verifyEmail(token);
    state.value = 'ok';
    if (session.me) session.me = { ...session.me, emailVerified: true };
  } catch (e) {
    state.value = 'error';
    error.value = errorMessage(e, t.value.auth.verifyFailed);
  }
});
</script>

<template>
  <div class="card">
    <div class="card-body text-center">
      <p v-if="state === 'pending'">{{ t.auth.verifying }}</p>
      <p v-else-if="state === 'ok'" class="text-success">{{ t.auth.verifyOk }}</p>
      <p v-else class="text-danger">{{ error }}</p>
      <RouterLink to="/shards">{{ t.auth.enterTown }}</RouterLink>
    </div>
  </div>
</template>
