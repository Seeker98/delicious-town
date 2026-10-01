<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { ShardDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const shards = ref<ShardDto[]>([]);
const loaded = ref(false);
const error = ref('');
const notice = ref('');
const session = useSessionStore();
const router = useRouter();

onMounted(async () => {
  try {
    shards.value = await endpoints.listShards();
  } catch (e) {
    error.value = errorMessage(e, '获取区服失败');
  } finally {
    loaded.value = true;
  }
});

async function choose(s: ShardDto) {
  error.value = '';
  try {
    const r = await endpoints.selectShard(s.id);
    if (session.me) session.me = { ...session.me, shardId: r.shardId, restaurantId: r.restaurantId };
    await router.push({ name: r.restaurantId ? 'home' : 'create-restaurant' });
  } catch (e) {
    error.value = errorMessage(e, '进入区服失败');
  }
}

async function resend() {
  try {
    await endpoints.sendVerifyEmail();
    notice.value = '验证邮件已发送，请查收';
  } catch (e) {
    error.value = errorMessage(e, '发送失败');
  }
}

async function logout() {
  await session.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div>
    <div v-if="session.me && !session.me.emailVerified" class="alert alert-warning py-1 small">
      邮箱还没有验证，验证后才能和好友互动。
      <button type="button" class="btn btn-link btn-sm p-0 align-baseline" @click="resend">
        重发验证邮件
      </button>
    </div>
    <div v-if="notice" class="alert alert-success py-1 small">{{ notice }}</div>
    <div v-if="error" class="alert alert-danger py-1 small">{{ error }}</div>
    <h6 class="my-2">选择区服</h6>
    <div class="list-group">
      <button
        v-for="s in shards"
        :key="s.id"
        type="button"
        class="list-group-item list-group-item-action d-flex justify-content-between"
        :disabled="s.status !== 'open'"
        @click="choose(s)"
      >
        <span>{{ s.name }}</span>
        <small class="text-muted">{{
          s.status !== 'open' ? '已关闭' : s.hasRestaurant ? '已开店' : '新开'
        }}</small>
      </button>
    </div>
    <p v-if="loaded && shards.length === 0 && !error" class="text-muted small mt-2">暂时没有开放的区服</p>
    <div class="d-flex gap-3 align-items-center mt-3 small">
      <RouterLink to="/account">我的账号</RouterLink>
      <RouterLink to="/guide">游玩指引</RouterLink>
      <button type="button" class="btn btn-outline-secondary btn-sm ms-auto" @click="logout">退出登录</button>
    </div>
  </div>
</template>
