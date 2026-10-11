<script setup lang="ts">
import { LOCALE_NAMES, LOCALES, type Locale } from '@dt/shared';
import { useLangPick } from '../../composables/useLangPick';
import { useT } from '../../composables/useT';
import { useLocaleStore } from '../../stores/locale';
import DtSheet from '../DtSheet.vue';
import PickRow from '../PickRow.vue';

/**
 * 语言面板（界面改版 P11：登录页的语言胶囊、账号页的“语言”行）：一行一种语言，用那种语言自己的写法，
 * 下面小字用现在的语言再写一遍；点一行马上切换并关掉面板
 */
defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const t = useT();
const locale = useLocaleStore();
const pickLang = useLangPick();

async function pick(l: Locale) {
  if (l === locale.locale) {
    emit('close');
    return;
  }
  if (await pickLang(l)) emit('close');
}
</script>

<template>
  <DtSheet :open="open" :title="t.common.language" @close="emit('close')">
    <div class="dt-card dt-rows-card" role="radiogroup" :aria-label="t.common.language">
      <PickRow
        v-for="l in LOCALES"
        :key="l"
        :on="l === locale.locale"
        :title="LOCALE_NAMES[l]"
        :sub="t.common.langNames[l] === LOCALE_NAMES[l] ? '' : t.common.langNames[l]"
        :testid="`lang-${l}`"
        @pick="pick(l)"
      />
    </div>
  </DtSheet>
</template>
