<script setup lang="ts">
import { ref } from 'vue';
import { useT } from '../composables/useT';
import { readThemePref, setThemePref, type ThemePref } from '../utils/theme';

/** 外观：跟随系统 / 浅色 / 深色（界面改版 P1）；只存在本机，改了立刻生效 */
const t = useT();
const pref = ref<ThemePref>(readThemePref());
function pick(e: Event) {
  pref.value = (e.target as HTMLSelectElement).value as ThemePref;
  setThemePref(pref.value);
}
</script>

<template>
  <select
    class="form-select form-select-sm w-auto"
    :value="pref"
    :aria-label="t.common.appearance"
    data-testid="theme-select"
    @change="pick"
  >
    <option value="system">{{ t.common.themeSystem }}</option>
    <option value="light">{{ t.common.themeLight }}</option>
    <option value="dark">{{ t.common.themeDark }}</option>
  </select>
</template>
