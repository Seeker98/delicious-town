<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { InviteDto, InviteStatus } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

/** 邀请好友（子项目 6A-2）：邀请码、带码的注册链接、本月已计人数、被邀请人进度 */
const toast = useToastStore();
const t = useT();
const data = ref<InviteDto | null>(null);

onMounted(async () => {
  try {
    data.value = await endpoints.invite();
  } catch (e) {
    toast.push(errorMessage(e, t.value.misc.invite.loadFailed), 'danger');
  }
});

const link = computed(() => (data.value ? `${location.origin}/register?invite=${data.value.code}` : ''));

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.push(t.value.misc.invite.copied, 'success');
  } catch {
    toast.push(t.value.misc.invite.copyFailed, 'danger');
  }
}

function stageText(level: number, s: InviteStatus | null): string | null {
  const st = t.value.misc.invite.stage;
  if (s === 'sent') return st.sent(level);
  if (s === 'pending') return st.pending(level);
  if (s === 'capped') return st.capped(level);
  return null;
}
</script>

<template>
  <div class="dt-page-title">
    <h5>{{ t.misc.invite.title }}</h5>
  </div>
  <template v-if="data">
    <div class="dt-card small mb-2">
      <div class="d-flex align-items-center gap-2 mb-1">
        <span>{{ t.misc.invite.myCode }}</span>
        <span class="fw-bold font-monospace" data-testid="invite-code">{{ data.code }}</span>
        <button type="button" class="btn btn-sm btn-outline-primary" @click="copy(data.code)">
          {{ t.misc.invite.copy }}
        </button>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="text-break flex-fill" data-testid="invite-link">{{ link }}</span>
        <button type="button" class="btn btn-sm btn-outline-primary text-nowrap" @click="copy(link)">
          {{ t.misc.invite.copyLink }}
        </button>
      </div>
    </div>
    <div class="dt-card small mb-2">
      <div class="mb-1">
        {{ t.misc.invite.rules(data.monthlyCap) }}
      </div>
      <div class="fw-bold">{{ t.misc.invite.month(data.monthCount, data.monthlyCap) }}</div>
    </div>
    <div v-if="data.invitees.length === 0" class="dt-empty">{{ t.misc.invite.empty }}</div>
    <div v-for="(f, i) in data.invitees" :key="i" class="dt-card small mb-2">
      <div v-if="f.restName">
        <span class="fw-bold">{{ f.restName }}</span>
        <span class="dt-meta"> · {{ f.shardName }} · {{ t.misc.invite.level(f.level ?? 0) }}</span>
      </div>
      <div v-else class="dt-meta">{{ t.misc.invite.noRest }}</div>
      <div class="dt-meta">
        <span v-if="!f.verified" class="text-danger me-2">{{ t.misc.invite.unverified }}</span>
        <span v-if="stageText(10, f.lv10)" class="me-2">{{ stageText(10, f.lv10) }}</span>
        <span v-if="stageText(30, f.lv30)">{{ stageText(30, f.lv30) }}</span>
      </div>
    </div>
  </template>
</template>
