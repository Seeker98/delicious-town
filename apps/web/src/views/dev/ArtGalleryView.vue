<script setup lang="ts">
import { computed, onMounted } from 'vue';
import DtArt from '../../components/DtArt.vue';
import RestaurantHero from '../../components/RestaurantHero.vue';
import { CONTENT_ART, UI_ART } from '../../art/generated/names';
import { useCatalogStore } from '../../stores/catalog';

/** 开发用图库（界面改版设计 §3.5）：浅色、深色并排看所有图形；生产构建不包含这个页面 */
const MODES = ['light', 'dark'] as const;
/** 头图按每扇门画一遍：编号来自目录（不写死） */
const catalog = useCatalogStore();
const DOORS = computed(() => (catalog.looks?.doors ?? []).map((d) => d.id));
onMounted(() => void catalog.load().catch(() => undefined));
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
      <!-- 头图（界面改版 P3）：每扇门叠上去看一遍 -->
      <h6 class="dt-section">{{ m }} · scene</h6>
      <RestaurantHero v-for="d in DOORS" :key="d" :door="d"
        ><b>#{{ d }}</b></RestaurantHero
      >
    </section>
  </div>
</template>
