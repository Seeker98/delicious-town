<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { ArtName } from '../../art/generated/names';
import { useT } from '../../composables/useT';
import DtArt from '../DtArt.vue';

/**
 * 资料库列表的一行（界面改版 P11）：左边 44px 图，名字后面按等级规则标角标（1 级不标，2 级绿、3 级以上紫），
 * 再跟一个灰色小标签（食谱的推荐等级）；下面一行灰字（插槽 sub 可以放琥珀色的“稀有”）。整行可点，右边 ›
 */
defineProps<{
  to: string;
  art: ArtName;
  name: string;
  level?: number;
  tag?: string;
  sub?: string;
  testid?: string;
}>();
const t = useT();
</script>

<template>
  <RouterLink :to="to" class="dt-row is-link dt-wiki-row" :data-testid="testid">
    <span class="dt-wiki-art"><DtArt :name="art" :size="30" /></span>
    <span class="dt-row-main">
      <span class="dt-row-title is-strong"
        >{{ name
        }}<span v-if="level && level >= 2" :class="['dt-tag', 'dt-lv', level >= 3 ? 'is-t3' : 'is-t2']">{{
          t.wiki.level(level)
        }}</span
        ><span v-if="tag" class="dt-tag dt-tag-mute">{{ tag }}</span></span
      >
      <span v-if="sub || $slots.sub" class="dt-row-sub"
        ><slot name="sub">{{ sub }}</slot></span
      >
    </span>
  </RouterLink>
</template>
