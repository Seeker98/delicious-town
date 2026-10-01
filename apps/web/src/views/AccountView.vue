<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { AccountProfileDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

/** 我的账号（问题记录 178）：只要求登录，不要求选区服 */
const session = useSessionStore();
const router = useRouter();
const p = ref<AccountProfileDto | null>(null);
const msg = ref<{ ok: boolean; text: string } | null>(null);
const oldPw = ref('');
const newPw = ref('');
const newPw2 = ref('');
const busy = ref(false);
const ROLE: Record<string, string> = { mod: '协管', admin: '管理员' };

onMounted(async () => {
  try {
    p.value = await endpoints.accountProfile();
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, '读取账号信息失败') };
  }
});

async function resend() {
  try {
    await endpoints.sendVerifyEmail();
    msg.value = { ok: true, text: '验证邮件已发送，请查收' };
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, '发送失败') };
  }
}
async function enter(shardId: number) {
  try {
    const r = await endpoints.selectShard(shardId);
    if (session.me) session.me = { ...session.me, shardId: r.shardId, restaurantId: r.restaurantId };
    await router.push({ name: 'home' });
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, '进入区服失败') };
  }
}
async function change() {
  if (newPw.value !== newPw2.value) {
    msg.value = { ok: false, text: '两次输入的新密码不一样' };
    return;
  }
  if (busy.value) return;
  busy.value = true;
  try {
    await endpoints.changePassword({ oldPassword: oldPw.value, newPassword: newPw.value });
    oldPw.value = newPw.value = newPw2.value = '';
    msg.value = { ok: true, text: '密码已修改，其他设备已下线' };
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, '修改失败') };
  } finally {
    busy.value = false;
  }
}
async function logout() {
  await session.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div class="dt-page-title"><h5>我的账号</h5></div>
  <div v-if="msg" :class="['alert', 'py-1', 'small', msg.ok ? 'alert-success' : 'alert-danger']">
    {{ msg.text }}
  </div>
  <template v-if="p">
    <h6 class="dt-section">账号</h6>
    <div class="small mb-3">
      <div>
        用户名 <b>{{ p.username }}</b
        ><span v-if="ROLE[p.role]" class="badge bg-secondary ms-1">{{ ROLE[p.role] }}</span>
      </div>
      <div>注册于 {{ new Date(p.createdAt).toLocaleDateString('zh-CN') }}</div>
      <div>
        邮箱 {{ p.email }}
        <span v-if="p.emailVerified" class="text-success">已验证</span>
        <template v-else>
          <span class="text-danger">未验证</span>
          <button
            type="button"
            class="btn btn-link btn-sm p-0 align-baseline ms-1"
            data-testid="acc-resend"
            @click="resend"
          >
            重发验证邮件
          </button>
        </template>
      </div>
      <div>
        邀请码
        <RouterLink to="/invite">{{ p.inviteCode ?? '去邀请页生成' }}</RouterLink>
      </div>
    </div>

    <h6 class="dt-section">我的店</h6>
    <div v-if="p.rests.length === 0" class="small text-muted mb-3">还没有开店</div>
    <div
      v-for="r in p.rests"
      :key="r.shardId"
      :class="['dt-item', { 'opacity-50': !r.shardOpen }]"
      :data-testid="`acc-rest-${r.shardId}`"
    >
      <div class="dt-item-main">
        <div>{{ r.shardName }} · {{ r.name }}</div>
        <div class="dt-meta">等级 {{ r.level }}<span v-if="!r.shardOpen"> · 区服已关闭</span></div>
      </div>
      <div class="dt-item-actions">
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          :disabled="!r.shardOpen"
          @click="enter(r.shardId)"
        >
          进入
        </button>
      </div>
    </div>

    <h6 class="dt-section mt-3">修改密码</h6>
    <div class="d-grid gap-1 mb-3" style="max-width: 20rem">
      <input
        v-model="oldPw"
        type="password"
        class="form-control form-control-sm"
        placeholder="旧密码"
        autocomplete="current-password"
        data-testid="acc-old"
      />
      <input
        v-model="newPw"
        type="password"
        class="form-control form-control-sm"
        placeholder="新密码（6~64 位）"
        autocomplete="new-password"
        data-testid="acc-new"
      />
      <input
        v-model="newPw2"
        type="password"
        class="form-control form-control-sm"
        placeholder="再输一次新密码"
        autocomplete="new-password"
        data-testid="acc-new2"
      />
      <button
        type="button"
        class="btn btn-sm btn-primary"
        :disabled="busy || !oldPw || newPw.length < 6"
        data-testid="acc-change"
        @click="change"
      >
        修改密码
      </button>
    </div>
  </template>
  <div class="d-flex gap-2">
    <RouterLink to="/shards" class="btn btn-sm btn-outline-secondary">切换区服</RouterLink>
    <button type="button" class="btn btn-sm btn-outline-danger" @click="logout">退出登录</button>
  </div>
</template>
