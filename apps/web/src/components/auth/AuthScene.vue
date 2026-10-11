<script setup lang="ts">
import { ref } from 'vue';
import { LOCALE_NAMES } from '@dt/shared';
import gateScene from '../../art/scene/gate.svg?url';
import newshopScene from '../../art/scene/newshop.svg?url';
import { useT } from '../../composables/useT';
import { useLocaleStore } from '../../stores/locale';
import LangSheet from '../account/LangSheet.vue';
import DtArt from '../DtArt.vue';

/**
 * 游戏外页面的头图（界面改版 P11）：登录页是 220px 的小镇门口，注册、找回密码、重设密码、验证邮箱用同一张的矮版；
 * 开店页是一间空店。左上写“美味小镇”，右上是语言胶囊（点开语言面板）；开店页右上换成现在的区服（插槽 chip）。
 * 这些页面没有顶栏（meta.bare），头图就是页头
 */
const props = defineProps<{ short?: boolean; scene?: 'gate' | 'newshop' }>();
const t = useT();
const locale = useLocaleStore();
const langOpen = ref(false);
const src = props.scene === 'newshop' ? newshopScene : gateScene;
</script>

<template>
  <div :class="['dt-auth-scene', `is-${scene ?? 'gate'}`, { 'is-short': short }]" data-testid="auth-scene">
    <img :src="src" alt="" class="dt-auth-scene-img" />
    <span v-if="scene !== 'newshop'" class="dt-auth-brand">{{ t.nav.appName }}</span>
    <slot name="chip">
      <button
        type="button"
        class="dt-auth-chip"
        :aria-label="t.common.language"
        data-testid="lang-chip"
        @click="langOpen = true"
      >
        <DtArt name="set-lang" :size="16" />{{ LOCALE_NAMES[locale.locale]
        }}<i class="bi bi-chevron-down" aria-hidden="true"></i>
      </button>
    </slot>
    <LangSheet :open="langOpen" @close="langOpen = false" />
  </div>
</template>
