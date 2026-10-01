<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AnnouncementDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';

/** 重要公告弹窗（子项目 6A）：进游戏时逐条弹出没看过的重要公告，关一条记一条已看 */
const queue = ref<AnnouncementDto[]>([]);
const current = computed(() => queue.value[0] ?? null);

onMounted(async () => {
  try {
    const r = await endpoints.announcements();
    queue.value = r.items.filter((a) => a.important && !a.seen);
  } catch {
    // 读取失败就不弹，不影响进游戏
  }
});

async function close() {
  const a = current.value;
  if (!a) return;
  try {
    await endpoints.announcementSeen(a.id);
  } catch {
    // 记已看失败也出队，免得卡在弹窗上；下次进游戏会再弹一次
  }
  queue.value = queue.value.slice(1);
}
</script>

<template>
  <template v-if="current">
    <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" data-testid="announce-popup">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h6 class="modal-title"><i class="bi bi-megaphone me-1"></i>{{ current.title }}</h6>
          </div>
          <div class="modal-body small dt-announce-body">{{ current.body }}</div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-sm btn-primary" data-testid="announce-close" @click="close">
              知道了
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop show"></div>
  </template>
</template>

<style scoped>
.dt-announce-body {
  white-space: pre-wrap;
}
</style>
