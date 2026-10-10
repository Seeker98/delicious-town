<script setup lang="ts">
import DtArt from '../../components/DtArt.vue';
import { CONTENT_ART, UI_ART } from '../../art/generated/names';

/** 开发用图库（界面改版设计 §3.5）：浅色、深色并排看所有图形；生产构建不包含这个页面 */
const MODES = ['light', 'dark'] as const;
</script>

<template>
  <div class="dt-gallery">
    <section v-for="m in MODES" :key="m" :data-theme="m" :data-bs-theme="m" class="dt-gallery-pane">
      <h6 class="dt-section">{{ m }} · ui {{ UI_ART.length }}</h6>
      <div class="dt-gallery-grid">
        <figure v-for="n in UI_ART" :key="n" class="dt-gallery-item">
          <DtArt :name="n" :size="32" />
          <span class="dt-gallery-active"><DtArt :name="n" :size="32" /></span>
          <figcaption>{{ n }}</figcaption>
        </figure>
      </div>
      <h6 class="dt-section">{{ m }} · content {{ CONTENT_ART.length }}</h6>
      <div class="dt-gallery-grid">
        <figure v-for="n in CONTENT_ART" :key="n" class="dt-gallery-item">
          <span class="dt-gallery-tile"><DtArt :name="n" :size="36" /></span>
          <figcaption>{{ n }}</figcaption>
        </figure>
      </div>
    </section>
  </div>
</template>
