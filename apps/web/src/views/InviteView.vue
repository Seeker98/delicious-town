<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { InviteDto, InviteStatus } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

/** 邀请好友（子项目 6A-2）：邀请码、带码的注册链接、本月已计人数、被邀请人进度 */
const toast = useToastStore();
const data = ref<InviteDto | null>(null);

onMounted(async () => {
  try {
    data.value = await endpoints.invite();
  } catch (e) {
    toast.push(errorMessage(e, '读取邀请信息失败'), 'danger');
  }
});

const link = computed(() => (data.value ? `${location.origin}/register?invite=${data.value.code}` : ''));

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.push('已复制', 'success');
  } catch {
    toast.push('复制失败，请手动选中复制', 'danger');
  }
}

function stageText(level: number, s: InviteStatus | null): string | null {
  if (s === 'sent') return `${level} 级奖励已发`;
  if (s === 'pending') return `${level} 级奖励待发（你在该区开店后补发）`;
  if (s === 'capped') return `${level} 级奖励超出本月上限`;
  return null;
}
</script>

<template>
  <div class="dt-page-title"><h5>邀请好友</h5></div>
  <template v-if="data">
    <div class="dt-card small mb-2">
      <div class="d-flex align-items-center gap-2 mb-1">
        <span>我的邀请码</span>
        <span class="fw-bold font-monospace" data-testid="invite-code">{{ data.code }}</span>
        <button type="button" class="btn btn-sm btn-outline-primary" @click="copy(data.code)">复制</button>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="text-break flex-fill" data-testid="invite-link">{{ link }}</span>
        <button type="button" class="btn btn-sm btn-outline-primary text-nowrap" @click="copy(link)">
          复制链接
        </button>
      </div>
    </div>
    <div class="dt-card small mb-2">
      <div class="mb-1">
        好友开店得新手礼包；好友验证邮箱后到 10 级、30 级，你各得一份奖励；每月最多计
        {{ data.monthlyCap }} 人。
      </div>
      <div class="fw-bold">本月已计 {{ data.monthCount }} / {{ data.monthlyCap }}</div>
    </div>
    <div v-if="data.invitees.length === 0" class="dt-empty">还没有邀请到好友</div>
    <div v-for="(f, i) in data.invitees" :key="i" class="dt-card small mb-2">
      <div v-if="f.restName">
        <span class="fw-bold">{{ f.restName }}</span>
        <span class="dt-meta"> · {{ f.shardName }} · {{ f.level }} 级</span>
      </div>
      <div v-else class="dt-meta">还没开店</div>
      <div class="dt-meta">
        <span v-if="!f.verified" class="text-danger me-2">还没验证邮箱</span>
        <span v-if="stageText(10, f.lv10)" class="me-2">{{ stageText(10, f.lv10) }}</span>
        <span v-if="stageText(30, f.lv30)">{{ stageText(30, f.lv30) }}</span>
      </div>
    </div>
  </template>
</template>
