<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AnnouncementDto } from '@dt/shared';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import AnnounceBanner from '../components/AnnounceBanner.vue';
import AuthField from '../components/auth/AuthField.vue';
import AuthScene from '../components/auth/AuthScene.vue';
import DtArt from '../components/DtArt.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

/**
 * 登录（界面改版 P11）：小镇门口头图，表单卡往上压进头图；字段上面写标签，密码框能显示密码。
 * 没登录也能看的两页（游戏资料、游玩指引）做成两个胶囊放卡片下面
 */
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
    await session.applyMe(
      await endpoints.login({ username: username.value.trim(), password: password.value }),
    );
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
  <AuthScene />
  <section class="dt-auth-card">
    <div v-if="error" class="dt-auth-error" role="alert">{{ error }}</div>
    <AnnounceBanner :items="announcements" />
    <h2 class="dt-auth-title">{{ t.auth.welcome }}</h2>
    <p class="dt-auth-sub">{{ t.auth.loginSub }}</p>
    <form @submit.prevent="submit">
      <AuthField v-model="username" :label="t.auth.username" autocomplete="username" required />
      <AuthField
        v-model="password"
        :label="t.auth.password"
        type="password"
        autocomplete="current-password"
        required
      />
      <button class="btn btn-primary dt-btn-block dt-auth-submit" :disabled="busy">{{ t.auth.login }}</button>
    </form>
    <div class="dt-auth-links">
      <RouterLink to="/register" class="dt-go">{{ t.auth.toRegister }}</RouterLink>
      <RouterLink to="/forgot-password" class="dt-go">{{ t.auth.forgot }}</RouterLink>
    </div>
  </section>
  <!-- 不用登录也能看的两页（问题记录 142） -->
  <nav class="dt-auth-pills" :aria-label="t.auth.openPages">
    <RouterLink to="/wiki" class="dt-auth-pill" data-testid="login-wiki"
      ><DtArt name="wiki-books" :size="18" />{{ t.auth.wiki }}</RouterLink
    >
    <RouterLink to="/guide" class="dt-auth-pill" data-testid="login-guide"
      ><DtArt name="wiki-guide" :size="18" />{{ t.guide.title }}</RouterLink
    >
  </nav>
</template>
