<script setup lang="ts">
import LangSelect from '../components/LangSelect.vue';
import { onMounted, ref } from 'vue';
import type { AnnouncementDto } from '@dt/shared';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import AnnounceBanner from '../components/AnnounceBanner.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
const router = useRouter();
const route = useRoute();
const session = useSessionStore();
const t = useT();
/** 登录页显示全部区服的公告（停服维护通知，子项目 6A）；读失败就不显示 */
const announcements = ref<AnnouncementDto[]>([]);
onMounted(async () => {
  try {
    announcements.value = (await endpoints.publicAnnouncements()).items;
  } catch {
    announcements.value = [];
  }
});

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await session.applyMe(await endpoints.login({ username: username.value, password: password.value }));
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/shards';
    await router.replace(redirect);
  } catch (e) {
    error.value = errorMessage(e, t.value.auth.loginFailed);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AnnounceBanner :items="announcements" />
  <div class="card">
    <div class="card-body">
      <div class="d-flex align-items-center justify-content-between mb-2">
        <h5 class="card-title mb-0">{{ t.auth.loginTitle }}</h5>
        <LangSelect />
      </div>
      <form @submit.prevent="submit">
        <input
          v-model.trim="username"
          class="form-control mb-2"
          :placeholder="t.auth.username"
          autocomplete="username"
          required
        />
        <input
          v-model="password"
          type="password"
          class="form-control mb-2"
          :placeholder="t.auth.password"
          autocomplete="current-password"
          required
        />
        <div v-if="error" class="alert alert-danger py-1">{{ error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy">{{ t.auth.login }}</button>
      </form>
      <div class="d-flex justify-content-between mt-2 small">
        <RouterLink to="/register">{{ t.auth.toRegister }}</RouterLink>
        <RouterLink to="/forgot-password">{{ t.auth.forgot }}</RouterLink>
      </div>
    </div>
  </div>
</template>
