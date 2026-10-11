<script setup lang="ts">
import type { ArtName } from '../../art/generated/names';
import DtArt from '../DtArt.vue';

/**
 * 资料库的词条（界面改版 P11 报刊风）：一张米色纸卡，顶上大图 + 宋体名字，名字下面一行写分类（插槽 kick），双线分隔；
 * 下面是资料表（.dt-entry-dl）和各节（.dt-entry-h 宋体小标题 + 细线）
 */
defineProps<{ art: ArtName; name: string; kick?: string }>();
</script>

<template>
  <article class="dt-paper dt-entry" data-testid="wiki-entry">
    <header class="dt-entry-head">
      <span class="dt-entry-art"><DtArt :name="art" :size="56" /></span>
      <span class="dt-min0">
        <h2 class="dt-entry-name">{{ name }}</h2>
        <span class="dt-entry-kick"
          ><slot name="kick">{{ kick }}</slot></span
        >
      </span>
    </header>
    <slot />
  </article>
</template>
