<script setup lang="ts">
import { LOCALE_NAMES, LOCALES, type Locale } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { useLocaleStore } from '../stores/locale';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';

/** 语言选择（问题记录 272）：改了立刻生效；登录状态下同时存到账号 */
const locale = useLocaleStore();
const session = useSessionStore();
const toast = useToastStore();
const t = useT();

async function pick(e: Event) {
  const el = e.target as HTMLSelectElement;
  const l = el.value as Locale;
  const r = await locale.set(l);
  // stale：加载期间又选了别的语言，以那次为准
  if (r === 'stale') return;
  if (r === 'failed') {
    toast.push(t.value.common.langLoadFailed, 'danger');
    el.value = locale.locale;
    return;
  }
  if (session.me)
    // 存到账号失败要说一声：不然下次刷新会回到账号原来的语言（backlog 多语言）
    await endpoints.setLang(l).catch(() => toast.push(t.value.common.langSaveFailed, 'danger'));
  else locale.markPick();
}
</script>

<template>
  <select
    class="form-select form-select-sm w-auto"
    :value="locale.locale"
    :aria-label="t.common.language"
    data-testid="lang-select"
    @change="pick"
  >
    <option v-for="l in LOCALES" :key="l" :value="l">{{ LOCALE_NAMES[l] }}</option>
  </select>
</template>
