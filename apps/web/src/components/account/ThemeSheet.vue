<script setup lang="ts">
import { ref } from 'vue';
import { useT } from '../../composables/useT';
import { readThemePref, setThemePref, type ThemePref } from '../../utils/theme';
import DtSheet from '../DtSheet.vue';
import PickRow from '../PickRow.vue';

/**
 * 外观面板（界面改版 P1 的跟随系统 / 浅色 / 深色；P11 从下拉框挪到面板）：只存在本机，点了立刻生效并关掉面板。
 * 每行右边画三格小色板，看得出是什么样子
 */
defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; picked: [pref: ThemePref] }>();
const t = useT();
const pref = ref<ThemePref>(readThemePref());
const PREFS: ThemePref[] = ['system', 'light', 'dark'];
const themeName = (p: ThemePref) =>
  p === 'system'
    ? t.value.common.themeSystem
    : p === 'light'
      ? t.value.common.themeLight
      : t.value.common.themeDark;

function pick(p: ThemePref) {
  pref.value = p;
  setThemePref(p);
  emit('picked', p);
  emit('close');
}
</script>

<template>
  <DtSheet :open="open" :title="t.common.appearance" @close="emit('close')">
    <div class="dt-card dt-rows-card" role="radiogroup" :aria-label="t.common.appearance">
      <PickRow
        v-for="p in PREFS"
        :key="p"
        :on="p === pref"
        :title="themeName(p)"
        :sub="t.account.themeSub[p]"
        :testid="`theme-${p}`"
        @pick="pick(p)"
      >
        <template #end
          ><span :class="['dt-theme-swatch', `is-${p}`]" aria-hidden="true"><i></i><i></i><i></i></span
        ></template>
      </PickRow>
    </div>
  </DtSheet>
</template>
