<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { MailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { activeLocale } from '../i18n';
import RedeemBox from '../components/RedeemBox.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useMailStore } from '../stores/mail';
import { useToastStore } from '../stores/toast';
import { rewardSummary } from '../utils/reward';
import { mailBody, mailTitle } from '../utils/serverText';

/** 邮箱（子项目 6A）：领取附件、一键全领、删除；顶部是兑换码输入框（6A-2） */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const mailStore = useMailStore();
const items = ref<MailDto[]>([]);
const loaded = ref(false);
const open = ref<number | null>(null);
const busy = ref(false);
/** 一键领取有没领成的，写在页面上（不用弹出提示，免得一闪而过） */
const notice = ref('');
/** 当前等级用邮箱接口给的，刷新页面直接进邮箱、或者刚领了经验后都是准的（终审 I1） */
const level = ref(0);

let seq = 0;
async function load() {
  const mine = ++seq;
  try {
    const r = await endpoints.mail();
    if (mine !== seq) return;
    items.value = r.items;
    level.value = r.level;
    loaded.value = true;
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, t.value.mail.loadFailed), 'danger');
  }
}
onMounted(() => void load());

const hasItems = (m: MailDto) => m.items !== null && Object.keys(m.items).length > 0;
const claimable = (m: MailDto) => hasItems(m) && !m.claimed && !m.broken;
const levelLow = (m: MailDto) => m.minLevel !== null && level.value < m.minLevel;
const anyClaimable = computed(() => items.value.some((m) => claimable(m) && !levelLow(m)));
const daysLeft = (m: MailDto) =>
  Math.max(0, Math.ceil((new Date(m.expiresAt).getTime() - Date.now()) / 86_400_000));
const sentAt = (m: MailDto) =>
  new Date(m.createdAt).toLocaleString(activeLocale(), {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

async function run(fn: () => Promise<unknown>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
    await load();
    void mailStore.refresh({ force: true });
  }
}

async function toggle(m: MailDto) {
  open.value = open.value === m.id ? null : m.id;
  if (open.value === m.id && !m.read) {
    m.read = true;
    try {
      await endpoints.mailRead(m.id);
      void mailStore.refresh({ force: true });
    } catch {
      // 标记已读失败不影响看信
    }
  }
}
const claim = (m: MailDto) => run(() => endpoints.mailClaim(m.id), t.value.mail.claimFailed);
const remove = (m: MailDto) => run(() => endpoints.mailDelete(m.id), t.value.mail.deleteFailed);
const claimAll = () =>
  run(async () => {
    const r = await endpoints.mailClaimAll();
    notice.value = r.failed > 0 ? t.value.mail.claimAllPartial(r.claimed, r.failed) : '';
  }, t.value.mail.claimFailed);
</script>

<template>
  <div class="dt-page-title">
    <h5>{{ t.mail.title }}</h5>
    <button
      class="btn btn-sm btn-primary"
      :disabled="busy || !anyClaimable"
      data-testid="mail-claim-all"
      @click="claimAll"
    >
      {{ t.mail.claimAll }}
    </button>
  </div>
  <RedeemBox @redeemed="load" />
  <div v-if="notice" class="alert alert-warning py-1 small" role="status">{{ notice }}</div>
  <div v-if="loaded && items.length === 0" class="dt-empty">{{ t.mail.empty }}</div>
  <div v-for="m in items" :key="m.id" class="dt-card small mb-2" :data-testid="`mail-${m.id}`">
    <div class="d-flex align-items-center gap-2">
      <button
        type="button"
        class="btn btn-link p-0 text-reset text-start flex-fill text-decoration-none"
        :class="{ 'fw-bold': !m.read }"
        :aria-expanded="open === m.id"
        :data-testid="`mail-title-${m.id}`"
        @click="toggle(m)"
      >
        {{ mailTitle(m) }}
      </button>
      <button
        v-if="claimable(m)"
        class="btn btn-sm btn-primary"
        :disabled="busy || levelLow(m)"
        :data-testid="`mail-claim-${m.id}`"
        @click="claim(m)"
      >
        {{ t.mail.claim }}
      </button>
      <button
        v-else
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy"
        :data-testid="`mail-delete-${m.id}`"
        @click="remove(m)"
      >
        {{ t.mail.delete }}
      </button>
    </div>
    <div class="dt-meta">
      {{ sentAt(m) }}{{ t.mail.daysLeft(daysLeft(m)) }}
      <span v-if="claimable(m) && levelLow(m)" class="text-danger">{{
        t.mail.needLevel(m.minLevel ?? 0)
      }}</span>
      <span v-if="m.claimed">{{ t.mail.claimed }}</span>
      <span v-else-if="m.broken" class="text-danger">{{ t.mail.broken }}</span>
    </div>
    <div v-if="hasItems(m)" class="dt-meta">{{ t.mail.items(rewardSummary(m.items!, catalog)) }}</div>
    <div v-if="open === m.id" class="mt-1 dt-mail-body" :data-testid="`mail-body-${m.id}`">
      {{ mailBody(m) }}
    </div>
  </div>
</template>

<style scoped>
.dt-mail-body {
  white-space: pre-wrap;
}
</style>
