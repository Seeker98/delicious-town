<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { ShardDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtArt from '../components/DtArt.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import { useSessionStore } from '../stores/session';
import { useShardsStore } from '../stores/shards';
import { useToastStore } from '../stores/toast';
import { gameDate } from '../utils/format';
import { restAva } from '../utils/restAva';

/**
 * 切换区服（界面改版 P11）：一个区服一张卡——区服名、状态小标签（现在在这 / 新开 / 已关闭）、开服第几天；
 * 下面一块写我在这个服的店（头像、店名、等级、街道和星级），点整张卡进店；没开店的写“还没在这里开店”。
 * 关闭的区服整卡灰掉、点不动。最下面是账号和设置、退出登录
 */
const shards = ref<ShardDto[]>([]);
const loaded = ref(false);
const error = ref('');
const session = useSessionStore();
const shardsStore = useShardsStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const confirm = useConfirmStore();
const router = useRouter();
const t = useT();
/** 开服 30 天内算新开 */
const FRESH_DAYS = 30;

onMounted(async () => {
  void catalog.load().catch(() => undefined);
  try {
    shards.value = await shardsStore.refresh();
  } catch (e) {
    error.value = errorMessage(e, t.value.account.shards.loadFailed);
  } finally {
    loaded.value = true;
  }
});

/** 开服第几天（开服当天算第 1 天） */
const dayOf = (s: ShardDto) =>
  Math.max(1, Math.floor((Date.now() - Date.parse(s.openedAt)) / 86_400_000) + 1);
function tagOf(s: ShardDto): { text: string; cls: string } | null {
  if (s.status !== 'open') return { text: t.value.account.shards.closed, cls: 'dt-tag-mute' };
  if (s.id === session.me?.shardId) return { text: t.value.account.shards.here, cls: 'dt-tag-primary' };
  if (dayOf(s) <= FRESH_DAYS) return { text: t.value.account.shards.fresh, cls: 'dt-tag-ok' };
  return null;
}
const subOf = (s: ShardDto) =>
  s.status === 'open'
    ? t.value.account.shards.openDay(dayOf(s), gameDate(s.openedAt))
    : t.value.account.shards.closedSince(gameDate(s.openedAt));

async function choose(s: ShardDto) {
  if (s.status !== 'open') return;
  error.value = '';
  try {
    const r = await session.enterShard(s.id);
    await router.push({ name: r.restaurantId ? 'home' : 'create-restaurant' });
  } catch (e) {
    error.value = errorMessage(e, t.value.account.enterFailed);
  }
}

async function resend() {
  try {
    await endpoints.sendVerifyEmail();
    toast.push(t.value.account.verifySent, 'success');
  } catch (e) {
    toast.push(errorMessage(e, t.value.account.sendFailed), 'danger');
  }
}

async function logout() {
  if (!(await confirm.ask({ title: t.value.account.logoutAsk, ok: t.value.account.logout, danger: true })))
    return;
  await session.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div v-if="session.me && !session.me.emailVerified" class="dt-warn-bar" data-testid="unverified-bar">
    <span>{{ t.account.shards.unverified }}</span>
    <button type="button" class="dt-warn-bar-btn" @click="resend">{{ t.account.resendShort }}</button>
  </div>
  <div v-if="error" class="dt-auth-error" role="alert">{{ error }}</div>
  <button
    v-for="s in shards"
    :key="s.id"
    type="button"
    :class="['dt-shard', { 'is-here': s.id === session.me?.shardId, 'is-off': s.status !== 'open' }]"
    :disabled="s.status !== 'open'"
    :data-testid="`shard-${s.id}`"
    @click="choose(s)"
  >
    <span class="dt-shard-top">
      <DtArt name="town-globe" :size="28" />
      <b class="dt-shard-name">{{ s.name }}</b>
      <span v-if="tagOf(s)" :class="['dt-tag', tagOf(s)!.cls]">{{ tagOf(s)!.text }}</span>
    </span>
    <span class="dt-shard-sub">{{ subOf(s) }}</span>
    <span v-if="s.rest" class="dt-shard-me">
      <span class="dt-shard-ava"
        ><DtArt :name="restAva(s.rest.id, s.rest.avatar, catalog.avatarArt)" :size="44"
      /></span>
      <span class="dt-row-main">
        <span class="dt-row-title is-strong"
          >{{ s.rest.name }}<span class="dt-tag dt-lv is-t3">{{ t.wiki.level(s.rest.level) }}</span></span
        >
        <span class="dt-row-sub">{{
          t.account.shards.restSub(catalog.streetName(s.rest.streetId), s.rest.starLevel)
        }}</span>
      </span>
      <span v-if="s.status === 'open'" class="dt-shard-chev" aria-hidden="true">›</span>
    </span>
    <span v-else class="dt-shard-me">
      <span class="dt-shard-ava is-plain"><DtArt name="town-shop" :size="36" /></span>
      <span class="dt-row-main">
        <span class="dt-row-title is-strong">{{ t.account.shards.noRest }}</span>
        <span class="dt-row-sub">{{
          dayOf(s) <= FRESH_DAYS ? t.account.shards.noRestFresh : t.account.shards.noRestSub
        }}</span>
      </span>
      <span v-if="s.status === 'open'" class="dt-shard-go">{{ t.account.shards.goOpen }}</span>
    </span>
  </button>
  <p v-if="loaded && shards.length === 0 && !error" class="dt-muted mt-2">{{ t.account.shards.none }}</p>
  <div class="dt-card dt-rows-card dt-shard-foot">
    <RouterLink to="/account" class="dt-row is-link dt-set-row" data-testid="shards-account">
      <span class="dt-row-ico dt-set-ic"><DtArt name="set-user" :size="20" /></span>
      <span class="dt-row-main"
        ><span class="dt-row-title">{{ t.nav.me.settings }}</span></span
      >
    </RouterLink>
    <button type="button" class="dt-row dt-set-row dt-row-danger" data-testid="shards-logout" @click="logout">
      <span class="dt-row-ico dt-set-ic"><DtArt name="set-logout" :size="20" /></span>
      <span class="dt-row-main"
        ><span class="dt-row-title">{{ t.account.logout }}</span></span
      >
    </button>
  </div>
</template>
