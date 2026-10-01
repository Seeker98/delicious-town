<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { MailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useMailStore } from '../stores/mail';
import { useToastStore } from '../stores/toast';
import { rewardSummary } from '../utils/reward';

/** 邮箱（子项目 6A）：领取附件、一键全领、删除；兑换码输入框在 6A-2 放到 top 插槽 */
const catalog = useCatalogStore();
const toast = useToastStore();
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
    if (mine === seq) toast.push(errorMessage(e, '读取邮箱失败'), 'danger');
  }
}
onMounted(() => void load());

const hasItems = (m: MailDto) => m.items !== null && Object.keys(m.items).length > 0;
const claimable = (m: MailDto) => hasItems(m) && !m.claimed;
const levelLow = (m: MailDto) => m.minLevel !== null && level.value < m.minLevel;
const anyClaimable = computed(() => items.value.some((m) => claimable(m) && !levelLow(m)));
const daysLeft = (m: MailDto) =>
  Math.max(0, Math.ceil((new Date(m.expiresAt).getTime() - Date.now()) / 86_400_000));
const sentAt = (m: MailDto) =>
  new Date(m.createdAt).toLocaleString('zh-CN', {
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
const claim = (m: MailDto) => run(() => endpoints.mailClaim(m.id), '领取失败');
const remove = (m: MailDto) => run(() => endpoints.mailDelete(m.id), '删除失败');
const claimAll = () =>
  run(async () => {
    const r = await endpoints.mailClaimAll();
    notice.value = r.failed > 0 ? `领了 ${r.claimed} 封，还有 ${r.failed} 封没领成，稍后再试` : '';
  }, '领取失败');
</script>

<template>
  <div class="dt-page-title">
    <h5>邮箱</h5>
    <button
      class="btn btn-sm btn-primary"
      :disabled="busy || !anyClaimable"
      data-testid="mail-claim-all"
      @click="claimAll"
    >
      一键领取
    </button>
  </div>
  <slot name="top" />
  <div v-if="notice" class="alert alert-warning py-1 small" role="status">{{ notice }}</div>
  <div v-if="loaded && items.length === 0" class="dt-empty">没有邮件</div>
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
        {{ m.title }}
      </button>
      <button
        v-if="claimable(m)"
        class="btn btn-sm btn-success"
        :disabled="busy || levelLow(m)"
        :data-testid="`mail-claim-${m.id}`"
        @click="claim(m)"
      >
        领取
      </button>
      <button
        v-else
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy"
        :data-testid="`mail-delete-${m.id}`"
        @click="remove(m)"
      >
        删除
      </button>
    </div>
    <div class="dt-meta">
      {{ sentAt(m) }} · 还剩 {{ daysLeft(m) }} 天
      <span v-if="claimable(m) && levelLow(m)" class="text-danger">· 需 {{ m.minLevel }} 级</span>
      <span v-if="m.claimed">· 已领取</span>
    </div>
    <div v-if="hasItems(m)" class="dt-meta">附件：{{ rewardSummary(m.items!, catalog) }}</div>
    <div v-if="open === m.id" class="mt-1 dt-mail-body" :data-testid="`mail-body-${m.id}`">{{ m.body }}</div>
  </div>
</template>

<style scoped>
.dt-mail-body {
  white-space: pre-wrap;
}
</style>
