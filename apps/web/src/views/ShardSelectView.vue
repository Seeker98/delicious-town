<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { ShardDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const shards = ref<ShardDto[]>([]);
const loaded = ref(false);
const error = ref('');
const notice = ref('');
const session = useSessionStore();
const router = useRouter();
const t = useT();

onMounted(async () => {
  try {
    shards.value = await endpoints.listShards();
  } catch (e) {
    error.value = errorMessage(e, t.value.account.shards.loadFailed);
  } finally {
    loaded.value = true;
  }
});

async function choose(s: ShardDto) {
  error.value = '';
  try {
    const r = await endpoints.selectShard(s.id);
    if (session.me)
      session.me = {
        ...session.me,
        shardId: r.shardId,
        restaurantId: r.restaurantId,
        npcRestId: r.npcRestId,
      };
    await router.push({ name: r.restaurantId ? 'home' : 'create-restaurant' });
  } catch (e) {
    error.value = errorMessage(e, t.value.account.enterFailed);
  }
}

async function resend() {
  try {
    await endpoints.sendVerifyEmail();
    notice.value = t.value.account.verifySent;
  } catch (e) {
    error.value = errorMessage(e, t.value.account.sendFailed);
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
      {{ t.account.shards.unverified }}
      <button type="button" class="dt-link-btn" @click="resend">
        {{ t.account.resend }}
      </button>
    </div>
    <div v-if="notice" class="alert alert-success py-1 small">{{ notice }}</div>
    <div v-if="error" class="alert alert-danger py-1 small">{{ error }}</div>
    <h6 class="my-2">{{ t.account.shards.title }}</h6>
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
          s.status !== 'open'
            ? t.account.shards.closed
            : s.hasRestaurant
              ? t.account.shards.hasRest
              : t.account.shards.fresh
        }}</small>
      </button>
    </div>
    <p v-if="loaded && shards.length === 0 && !error" class="text-muted small mt-2">
      {{ t.account.shards.none }}
    </p>
    <div class="d-flex gap-3 align-items-center mt-3 small">
      <RouterLink to="/account" class="dt-go">{{ t.nav.links.account }}</RouterLink>
      <RouterLink to="/guide" class="dt-go">{{ t.nav.links.guide }}</RouterLink>
      <button type="button" class="btn btn-outline-secondary btn-sm ms-auto" @click="logout">
        {{ t.account.logout }}
      </button>
    </div>
  </div>
</template>
