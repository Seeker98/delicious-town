<script setup lang="ts">
/**
 * 地方的场景头图（界面改版 P9，设计 §1.1 第 4 条）：整宽，酒吧首页 196px、神殿和厨塔 120px；
 * 左下角叠几枚数字胶囊（默认插槽放 .dt-place-chip）。图是固定色的内容图形，深色模式不变
 */
defineProps<{ src: string; place: 'bar' | 'temple' | 'tower' | 'society' | 'plaza'; tall?: boolean }>();
</script>

<template>
  <div :class="['dt-place-scene', `is-${place}`, { 'is-tall': tall }]" data-testid="place-scene">
    <img :src="src" alt="" class="dt-place-scene-img" />
    <div v-if="$slots.default" class="dt-place-chips"><slot /></div>
  </div>
</template>
