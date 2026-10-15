<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { LOCALE_NAMES, type AccountProfileDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import LangSheet from '../components/account/LangSheet.vue';
import PasswordSheet from '../components/account/PasswordSheet.vue';
import ThemeSheet from '../components/account/ThemeSheet.vue';
import DtArt from '../components/DtArt.vue';
import { useAccountActions } from '../composables/useAccountActions';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useLocaleStore } from '../stores/locale';
import { useSessionStore } from '../stores/session';
import { useShardsStore } from '../stores/shards';
import { gameDate } from '../utils/format';
import { readThemePref, type ThemePref } from '../utils/theme';

/**
 * 账号和设置（问题记录 178；界面改版 P11）：顶上一张账号卡（用户名、角色、注册时间、几个区服有店），
 * 下面按“账号 / 偏好 / 区服”分组成设置行：邮箱（没验证时能重发）、修改密码、语言、外观点开都从底部弹面板；
 * 原来的“我的店”列表挪到切换区服页。只要求登录，不要求选区服
 */
const session = useSessionStore();
const locale = useLocaleStore();
const shards = useShardsStore();
const p = ref<AccountProfileDto | null>(null);
const loadError = ref('');
const sheet = ref<'lang' | 'theme' | 'pw' | null>(null);
const theme = ref<ThemePref>(readThemePref());
const t = useT();
const { resend, logout } = useAccountActions();

onMounted(async () => {
  void shards.load();
  try {
    p.value = await endpoints.accountProfile();
  } catch (e) {
    loadError.value = errorMessage(e, t.value.account.loadFailed);
  }
});

const themeName = computed(() =>
  theme.value === 'system'
    ? t.value.common.themeSystem
    : theme.value === 'light'
      ? t.value.common.themeLight
      : t.value.common.themeDark,
);
const shardName = computed(() => shards.nameOf(session.me?.shardId));
</script>

<template>
  <div v-if="loadError" class="dt-auth-error" role="alert">{{ loadError }}</div>
  <template v-if="p">
    <section class="dt-card dt-acct-card" data-testid="acc-info">
      <span class="dt-acct-ava"><DtArt name="set-user" :size="32" /></span>
      <div class="dt-min0">
        <div class="dt-acct-name">
          <span class="dt-clamp1">{{ p.username }}</span
          ><span v-if="t.account.role[p.role]" class="dt-tag dt-tag-primary">{{
            t.account.role[p.role]
          }}</span>
        </div>
        <div class="dt-meta">{{ t.account.cardSub(gameDate(p.createdAt), p.rests.length) }}</div>
      </div>
    </section>

    <h2 class="dt-group-title">{{ t.account.section }}</h2>
    <div class="dt-card dt-rows-card">
      <div class="dt-row dt-set-row" data-testid="acc-email">
        <span class="dt-row-ico dt-set-ic"><DtArt name="set-mail" :size="20" /></span>
        <span class="dt-row-main">
          <span class="dt-row-title">{{ t.account.email }}</span>
          <span class="dt-row-sub">{{ p.email }}</span>
        </span>
        <span v-if="p.emailVerified" class="dt-tag dt-tag-ok">{{ t.account.verified }}</span>
        <template v-else>
          <span class="dt-tag dt-tag-danger">{{ t.account.unverified }}</span>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            data-testid="acc-resend"
            @click="resend"
          >
            {{ t.account.resendBtn }}
          </button>
        </template>
      </div>
      <button type="button" class="dt-row is-link dt-set-row" data-testid="acc-pw" @click="sheet = 'pw'">
        <span class="dt-row-ico dt-set-ic"><DtArt name="set-key" :size="20" /></span>
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.account.changePw }}</span></span
        >
      </button>
    </div>

    <h2 class="dt-group-title">{{ t.account.prefs }}</h2>
    <div class="dt-card dt-rows-card">
      <button type="button" class="dt-row is-link dt-set-row" data-testid="acc-lang" @click="sheet = 'lang'">
        <span class="dt-row-ico dt-set-ic"><DtArt name="set-lang" :size="20" /></span>
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.common.language }}</span></span
        >
        <span class="dt-row-value">{{ LOCALE_NAMES[locale.locale] }}</span>
      </button>
      <button
        type="button"
        class="dt-row is-link dt-set-row"
        data-testid="acc-theme"
        @click="sheet = 'theme'"
      >
        <span class="dt-row-ico dt-set-ic"><DtArt name="set-theme" :size="20" /></span>
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.common.appearance }}</span></span
        >
        <span class="dt-row-value">{{ themeName }}</span>
      </button>
    </div>

    <h2 class="dt-group-title">{{ t.account.shardGroup }}</h2>
    <div class="dt-card dt-rows-card">
      <RouterLink to="/shards" class="dt-row is-link dt-set-row" data-testid="acc-shards">
        <span class="dt-row-ico dt-set-ic"><DtArt name="set-shard" :size="20" /></span>
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.account.switchShard }}</span></span
        >
        <span v-if="shardName" class="dt-row-value">{{ shardName }}</span>
      </RouterLink>
      <button type="button" class="dt-row dt-set-row dt-row-danger" data-testid="acc-logout" @click="logout">
        <span class="dt-row-ico dt-set-ic"><DtArt name="set-logout" :size="20" /></span>
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.account.logout }}</span></span
        >
      </button>
    </div>
  </template>
  <LangSheet :open="sheet === 'lang'" @close="sheet = null" />
  <ThemeSheet :open="sheet === 'theme'" @close="sheet = null" @picked="theme = $event" />
  <PasswordSheet :open="sheet === 'pw'" @close="sheet = null" />
</template>
