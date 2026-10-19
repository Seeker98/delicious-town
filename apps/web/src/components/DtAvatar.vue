<script setup lang="ts">
import { computed, useId } from 'vue';
import type { ArtName } from '../art/generated/names';
import { useCatalogStore } from '../stores/catalog';
import DtArt from './DtArt.vue';

/**
 * 头像（成就 PR③ 样稿 ①）：戴了头像框时头像往里缩一圈，外面画一层 SVG 环；不戴时就是原来的图。
 * 框宽是尺寸的 1/12（最少 2.5）；40 以上才画点缀（木纹、铆钉、宝石、四角星），小尺寸只有一圈渐变。
 * 环画在方框里的内切圆上，外层容器原来的圆角、overflow:hidden 都裁不到它
 */
const props = defineProps<{ art: ArtName; size: number; frame?: number | null; label?: string }>();
const catalog = useCatalogStore();
const uid = useId();

const tone = computed(() => catalog.frameTone(props.frame ?? null));
const w = computed(() => Math.max(2.5, props.size / 12));
const c = computed(() => props.size / 2);
const r = computed(() => c.value - w.value / 2);
const face = computed(() => Math.round(props.size - (w.value + 1) * 2));
const grad = computed(() => `dt-ava-g-${uid}`);
/** 渐变色：彩框四色，其余是 主色 → 深色 → 主色 */
const stops = computed(() => {
  const t = tone.value;
  if (t === 'rainbow')
    return [
      'var(--dt-trophy-rainbow)',
      'var(--dt-frame-rainbow-3)',
      'var(--dt-trophy-rainbow-2)',
      'var(--dt-frame-rainbow-4)',
    ];
  const v = t === 'wood' || t === 'jade' ? `--dt-frame-${t}` : `--dt-trophy-${t}`;
  return [`var(${v})`, `var(${v}-2)`, `var(${v})`];
});
/** 左上一段高光 */
const shine = computed(() => {
  const k = r.value;
  return `M${c.value - k * 0.82} ${c.value - k * 0.57} A ${k} ${k} 0 0 1 ${c.value - k * 0.2} ${c.value - k * 0.98}`;
});
const big = computed(() => props.size >= 40);
/** 木纹：环上六道短刻痕 */
const grain = computed(() =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const k = r.value;
    const d = w.value / 3;
    return `M${c.value + Math.cos(a) * (k - d)} ${c.value + Math.sin(a) * (k - d)}L${c.value + Math.cos(a + 0.18) * (k + d)} ${c.value + Math.sin(a + 0.18) * (k + d)}`;
  }).join(''),
);
/** 顶上的宝石（金、翡翠是菱形，彩是四角星） */
const gem = computed(() => {
  const x = c.value;
  const y = c.value - r.value;
  const s = w.value * 1.25;
  if (tone.value === 'rainbow') {
    const q = s * 0.32;
    return `M${x} ${y - s}L${x + q} ${y - q}L${x + s} ${y}L${x + q} ${y + q}L${x} ${y + s}L${x - q} ${y + q}L${x - s} ${y}L${x - q} ${y - q}Z`;
  }
  return `M${x} ${y - s}L${x + s * 0.8} ${y}L${x} ${y + s}L${x - s * 0.8} ${y}Z`;
});
</script>

<template>
  <DtArt v-if="!tone" :name="art" :size="size" :label="label" />
  <span
    v-else
    :class="['dt-ava-framed', `is-${tone}`]"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :role="label ? 'img' : undefined"
    :aria-label="label"
  >
    <span class="dt-ava-face"><DtArt :name="art" :size="face" /></span>
    <svg class="dt-ava-ring" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient :id="grad" x1="0" y1="0" x2="1" y2="1">
          <stop v-for="(s, i) in stops" :key="i" :offset="i / (stops.length - 1)" :stop-color="s" />
        </linearGradient>
      </defs>
      <circle :cx="c" :cy="c" :r="r" fill="none" :stroke="`url(#${grad})`" :stroke-width="w" />
      <path
        :d="shine"
        fill="none"
        stroke="var(--dt-trophy-shine)"
        :stroke-width="Math.max(1, w / 3)"
        stroke-linecap="round"
      />
      <template v-if="big">
        <path
          v-if="tone === 'wood'"
          :d="grain"
          stroke="var(--dt-frame-grain)"
          stroke-width="1"
          stroke-linecap="round"
        />
        <template v-else-if="tone === 'bronze' || tone === 'silver'">
          <circle
            v-for="x in [c - r, c + r]"
            :key="x"
            :cx="x"
            :cy="c"
            :r="w * 0.42"
            :fill="`var(--dt-trophy-${tone}-2)`"
          />
        </template>
        <path
          v-else
          :d="gem"
          :fill="
            tone === 'rainbow'
              ? 'var(--dt-trophy-rainbow-2)'
              : tone === 'gold'
                ? 'var(--dt-frame-jade)'
                : 'var(--dt-trophy-gold)'
          "
          stroke="var(--dt-surface)"
          stroke-width="1"
        />
      </template>
    </svg>
  </span>
</template>
