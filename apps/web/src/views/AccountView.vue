<script setup lang="ts">
import LangSelect from '../components/LangSelect.vue';
import { gameDate } from '../utils/format';
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { AccountProfileDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';

/** 我的账号（问题记录 178）：只要求登录，不要求选区服 */
const session = useSessionStore();
const router = useRouter();
const p = ref<AccountProfileDto | null>(null);
const msg = ref<{ ok: boolean; text: string } | null>(null);
const oldPw = ref('');
const newPw = ref('');
const newPw2 = ref('');
const busy = ref(false);
const t = useT();
const restStore = useRestaurantStore();

onMounted(async () => {
  try {
    p.value = await endpoints.accountProfile();
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, t.value.account.loadFailed) };
  }
});

async function resend() {
  try {
    await endpoints.sendVerifyEmail();
    msg.value = { ok: true, text: t.value.account.verifySent };
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, t.value.account.sendFailed) };
  }
}
async function enter(shardId: number) {
  try {
    await session.enterShard(shardId);
    await router.push({ name: 'home' });
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, t.value.account.enterFailed) };
  }
}
async function change() {
  if (newPw.value !== newPw2.value) {
    msg.value = { ok: false, text: t.value.account.pwMismatch };
    return;
  }
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await endpoints.changePassword({ oldPassword: oldPw.value, newPassword: newPw.value });
    oldPw.value = newPw.value = newPw2.value = '';
    if (r.relogin) {
      // 密码已改，但本机没换上新会话（backlog 账号）：提示后去登录页
      useToastStore().push(t.value.account.pwRelogin, 'info');
      session.me = null;
      await router.replace('/login');
      return;
    }
    msg.value = { ok: true, text: t.value.account.pwChanged };
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, t.value.account.changeFailed) };
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
  <div class="dt-page-title">
    <h5>{{ t.account.title }}</h5>
  </div>
  <div v-if="msg" :class="['alert', 'py-1', 'small', msg.ok ? 'alert-success' : 'alert-danger']">
    {{ msg.text }}
  </div>
  <template v-if="p">
    <h6 class="dt-section">{{ t.account.section }}</h6>
    <!-- 两列：左边标签、右边内容，每行等高、垂直居中（问题记录 300：以前各行高度、对齐不一） -->
    <dl class="dt-kv small mb-3" data-testid="acc-info">
      <dt>{{ t.common.language }}</dt>
      <dd data-testid="acc-lang"><LangSelect /></dd>
      <dt>{{ t.account.username }}</dt>
      <dd>
        <b>{{ p.username }}</b
        ><span v-if="t.account.role[p.role]" class="badge bg-secondary ms-1">{{
          t.account.role[p.role]
        }}</span>
      </dd>
      <dt>{{ t.account.registered }}</dt>
      <dd>{{ gameDate(p.createdAt) }}</dd>
      <dt>{{ t.account.email }}</dt>
      <dd>
        {{ p.email }}
        <span v-if="p.emailVerified" class="text-success">{{ t.account.verified }}</span>
        <template v-else>
          <span class="text-danger">{{ t.account.unverified }}</span>
          <button type="button" class="dt-link-btn text-wrap ms-1" data-testid="acc-resend" @click="resend">
            {{ t.account.resend }}
          </button>
        </template>
      </dd>
      <!-- 邀请是区服功能：当前区服关了就不显示（#189 遗留：这里是唯一入口） -->
      <template v-if="restStore.featureOn('invite')">
        <dt>{{ t.account.inviteCode }}</dt>
        <dd>
          <RouterLink to="/invite" class="dt-go text-wrap">{{
            p.inviteCode ?? t.account.makeInvite
          }}</RouterLink>
        </dd>
      </template>
    </dl>

    <h6 class="dt-section">{{ t.account.myRests }}</h6>
    <div v-if="p.rests.length === 0" class="small text-muted mb-3">{{ t.account.noRest }}</div>
    <div
      v-for="r in p.rests"
      :key="r.shardId"
      :class="['dt-item', { 'opacity-50': !r.shardOpen }]"
      :data-testid="`acc-rest-${r.shardId}`"
    >
      <div class="dt-item-main">
        <div>{{ r.shardName }} · {{ r.name }}</div>
        <div class="dt-meta">
          {{ t.account.level(r.level) }}<span v-if="!r.shardOpen">{{ t.account.shardClosed }}</span>
        </div>
      </div>
      <div class="dt-item-actions">
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          :disabled="!r.shardOpen"
          @click="enter(r.shardId)"
        >
          {{ t.account.enter }}
        </button>
      </div>
    </div>

    <h6 class="dt-section mt-3">{{ t.account.changePw }}</h6>
    <div class="d-grid gap-1 mb-3" style="max-width: 20rem">
      <input
        v-model="oldPw"
        type="password"
        class="form-control form-control-sm"
        :placeholder="t.account.oldPw"
        autocomplete="current-password"
        data-testid="acc-old"
      />
      <input
        v-model="newPw"
        type="password"
        class="form-control form-control-sm"
        :placeholder="t.account.newPw"
        autocomplete="new-password"
        data-testid="acc-new"
      />
      <input
        v-model="newPw2"
        type="password"
        class="form-control form-control-sm"
        :placeholder="t.account.newPw2"
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
        {{ t.account.changePw }}
      </button>
    </div>
  </template>
  <div class="d-flex gap-2">
    <RouterLink to="/shards" class="btn btn-sm btn-outline-secondary">{{ t.account.switchShard }}</RouterLink>
    <button type="button" class="btn btn-sm btn-outline-danger" @click="logout">
      {{ t.account.logout }}
    </button>
  </div>
</template>
