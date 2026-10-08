<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { GAME_TIME_ZONE, ROUND_MS } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { activeLocale } from '../i18n';
import { useServerClock } from '../utils/serverClock';
import { setServerOffset } from '../utils/serverNow';

/**
 * 顶栏的当前时间（问题记录 348）：按服务器时间走（本机时钟不准也对），北京时间；
 * 点开写日期和下一轮结算倒计时（每 4 分钟一轮，按整点对齐）
 */
const t = useT();
const server = ref<string | null>(null);
const { now } = useServerClock(() => server.value ?? new Date().toISOString());
const open = ref(false);
const root = ref<HTMLElement | null>(null);
/** 点开后点别处（包括底部导航去别的页面）、按 Esc 就收起（问题记录 358） */
function onDown(e: Event) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false;
}
watch(open, (v) => {
  if (v) {
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
  } else {
    document.removeEventListener('pointerdown', onDown);
    document.removeEventListener('keydown', onKey);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDown);
  document.removeEventListener('keydown', onKey);
});
/** 拿到服务器时间（或读失败）之前不显示，免得先闪一下本机时间 */
const ready = ref(false);

onMounted(async () => {
  try {
    server.value = (await endpoints.serverTime()).now;
    setServerOffset(server.value);
  } catch {
    // 读不到就按本机时间
  }
  ready.value = true;
});

const fmt = (o: Intl.DateTimeFormatOptions) =>
  new Date(now.value).toLocaleString(activeLocale(), { timeZone: GAME_TIME_ZONE, ...o });
const time = computed(() => fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
const date = computed(() => fmt({ month: 'long', day: 'numeric', weekday: 'short' }));
const nextRound = computed(() => {
  const s = Math.ceil((ROUND_MS - (now.value % ROUND_MS)) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});
</script>

<template>
  <!-- 外层一直在：顶栏靠它把邮箱推到右边 -->
  <span ref="root" class="position-relative">
    <template v-if="ready">
      <button
        type="button"
        class="btn btn-link btn-sm p-0 text-reset text-decoration-none small"
        :title="t.site.clockTitle"
        data-testid="clock"
        :aria-expanded="open"
        @click="open = !open"
      >
        {{ time }}
      </button>
      <span v-if="open" class="dt-clock-detail shadow-sm" data-testid="clock-detail">
        {{ date }}<br />{{ t.site.nextRound(nextRound) }}
      </span>
    </template>
  </span>
</template>
