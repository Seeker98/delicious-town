<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import AuthScene from '../components/auth/AuthScene.vue';
import { useT } from '../composables/useT';
import { useSessionStore } from '../stores/session';

/** 验证邮箱（界面改版 P11）：只有一张结果卡，成功是绿圈对号、失败是红圈叹号，下面“进入小镇” */
const route = useRoute();
const session = useSessionStore();
const state = ref<'pending' | 'ok' | 'error'>('pending');
const t = useT();

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : '';
  try {
    await endpoints.verifyEmail(token);
    state.value = 'ok';
    if (session.me) session.me = { ...session.me, emailVerified: true };
  } catch {
    state.value = 'error';
  }
});
</script>

<template>
  <AuthScene short />
  <section class="dt-auth-card">
    <div class="dt-auth-result" role="status" :data-testid="`verify-${state}`">
      <template v-if="state === 'pending'">
        <span class="dt-auth-ring" aria-hidden="true">…</span>
        <b>{{ t.auth.verifying }}</b>
      </template>
      <template v-else-if="state === 'ok'">
        <span class="dt-auth-ring is-ok" aria-hidden="true">✓</span>
        <b>{{ t.auth.verifyOk }}</b>
        <span>{{ t.auth.verifyOkSub }}</span>
      </template>
      <template v-else>
        <span class="dt-auth-ring is-bad" aria-hidden="true">!</span>
        <b>{{ t.auth.verifyFailedTitle }}</b>
        <span>{{ t.auth.verifyFailedSub }}</span>
      </template>
      <RouterLink
        to="/shards"
        :class="['btn', 'dt-btn-block', 'dt-auth-submit', state === 'ok' ? 'btn-primary' : 'btn-light']"
        >{{ t.auth.enterTown }}</RouterLink
      >
    </div>
  </section>
</template>
