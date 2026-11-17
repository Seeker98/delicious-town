<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { CLIENT_BUILD } from '../api/antibot';
import { useT } from '../composables/useT';
import {
  MIN_GAP_MS,
  POLL_MS,
  TYPING_GRACE_MS,
  fetchLatestBuild,
  isOutdated,
  markReloadFor,
  recentlyReloadedFor,
  typingDraft,
  versionCheckEnabled,
} from '../utils/versionCheck';
import { whenWritesIdle } from '../utils/writesInFlight';

/**
 * 旧版本提醒（用户 2026-11-17 定：每次发版都强制刷新）：定时读线上版本号，和自己的不同就弹不能关的框，
 * 只有“刷新”按钮。正在输入框里写东西时最多推迟 3 分钟再弹；点刷新先等写请求返回（最多 10 秒）。
 * 登录页、后台也挂（App.vue 里不看是否在游戏里）
 */
const props = withDefaults(
  defineProps<{
    enabled?: boolean;
    mine?: string;
    fetchLatest?: () => Promise<string | null>;
    reload?: () => void;
  }>(),
  {
    enabled: () => versionCheckEnabled(CLIENT_BUILD, import.meta.env.PROD),
    mine: CLIENT_BUILD,
    fetchLatest: () => fetchLatestBuild(),
    // 函数类型的 prop：默认值就是这个函数本身（不是工厂）
    reload: () => location.reload(),
  },
);

/** 写请求最多等多久就刷新 */
const WRITE_WAIT_MS = 10_000;
/** 正在打字时隔多久再看一次能不能弹 */
const TYPING_RETRY_MS = 5_000;

const t = useT();
const show = ref(false);
const reloading = ref(false);
const btn = ref<HTMLButtonElement | null>(null);
let latest: string | null = null;
let lastCheck = 0;
let typingSince: number | null = null;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

async function check(force = false) {
  if (show.value) return;
  const now = Date.now();
  if (!force && now - lastCheck < MIN_GAP_MS) return;
  lastCheck = now;
  const b = await props.fetchLatest();
  if (show.value || !isOutdated(b, props.mine) || recentlyReloadedFor(b!)) return;
  latest = b;
  tryShow();
}

function tryShow() {
  retryTimer = undefined;
  const now = Date.now();
  if (typingDraft()) {
    typingSince ??= now;
    if (now - typingSince < TYPING_GRACE_MS) {
      retryTimer = setTimeout(tryShow, TYPING_RETRY_MS);
      return;
    }
  }
  show.value = true;
  void nextTick(() => btn.value?.focus());
}

async function refresh() {
  if (reloading.value) return;
  reloading.value = true;
  await whenWritesIdle(WRITE_WAIT_MS);
  if (latest) markReloadFor(latest);
  props.reload();
}

const onVisible = () => {
  if (document.visibilityState === 'visible') void check();
};
const onOnline = () => void check();
/** 从浏览器的往返缓存恢复（后退回来）：页面可能放了很久 */
const onPageShow = (e: PageTransitionEvent) => {
  if (e.persisted) void check();
};

onMounted(() => {
  if (!props.enabled) return;
  pollTimer = setInterval(() => void check(true), POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('pageshow', onPageShow);
});

onBeforeUnmount(() => {
  clearInterval(pollTimer);
  clearTimeout(retryTimer);
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('pageshow', onPageShow);
});

defineExpose({ check });
</script>

<template>
  <template v-if="show">
    <div
      class="modal d-block dt-version-gate"
      tabindex="-1"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dt-version-title"
      aria-describedby="dt-version-body"
      data-testid="version-gate"
    >
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h6 id="dt-version-title" class="modal-title">
              <i class="bi bi-arrow-repeat me-1"></i>{{ t.nav.versionStale.title }}
            </h6>
          </div>
          <div id="dt-version-body" class="modal-body small">{{ t.nav.versionStale.body }}</div>
          <div class="modal-footer py-2">
            <button
              ref="btn"
              type="button"
              class="btn btn-sm btn-primary"
              :aria-busy="reloading || undefined"
              :disabled="reloading"
              data-testid="version-refresh"
              @click="refresh"
            >
              {{ reloading ? t.nav.versionStale.refreshing : t.nav.versionStale.refresh }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop show dt-version-backdrop"></div>
  </template>
</template>

<style scoped>
/* 盖在公告、随机事件、确认面板上面：不刷新就不能继续玩 */
.dt-version-gate {
  z-index: 1095;
}
.dt-version-backdrop {
  z-index: 1094;
}
</style>
