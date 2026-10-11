<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { CookbookProgressDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import DtSkeleton from '../DtSkeleton.vue';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { formatNum, formatPct } from '../../utils/format';

/** 食谱进度一览（问题记录：食谱页加进度一览，参考 data/食谱进度一览-alu.txt）：每格是这一品级及以上的道数 */
const t = useT();
const catalog = useCatalogStore();
const data = ref<CookbookProgressDto | null>(null);
const error = ref('');

const grades = computed(() => Array.from({ length: data.value?.maxGrade ?? 0 }, (_, i) => i + 1));
const total = computed(() => data.value?.streets.reduce((s, x) => s + x.total, 0) ?? 0);
const allRow = computed(() =>
  grades.value.map((g) => data.value?.streets.reduce((s, x) => s + (x.atLeast[g - 1] ?? 0), 0) ?? 0),
);

onMounted(async () => {
  try {
    // 目录也等到（读过就不再请求）：不然直接打开这页时街名先显示成编号（fix/batch-1008 遗留）；目录读失败照样显示
    const [d] = await Promise.all([endpoints.cookbookProgress(), catalog.load().catch(() => undefined)]);
    data.value = d;
  } catch (e) {
    error.value = errorMessage(e, t.value.cookbook.progress.loadFailed);
  }
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <DtSkeleton v-else-if="!data" :rows="6" data-testid="progress-loading" />
  <template v-if="data">
    <!-- 各品级一共学到多少（界面改版 P7）：一品级一行细进度条，右边“几 / 共几” -->
    <section class="dt-card dt-grade-bars" data-testid="progress-summary">
      <div
        v-for="(g, i) in grades"
        :key="g"
        class="dt-grade-bar"
        role="img"
        :aria-label="
          t.cookbook.progress.summary(
            t.labels.grade[g] ?? '',
            formatNum(allRow[i]!),
            formatNum(total),
            formatPct(total ? allRow[i]! / total : 0, { digits: 2 }),
          )
        "
      >
        <span class="dt-grade-bar-name">{{ t.labels.grade[g] }}</span>
        <span class="dt-hbar"
          ><i class="is-a" :style="{ width: `${total ? (allRow[i]! / total) * 100 : 0}%` }"></i
        ></span>
        <span class="dt-grade-bar-num">{{ formatNum(allRow[i]!) }} / {{ formatNum(total) }}</span>
      </div>
    </section>
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.cookbook.progress.byStreet }}</h2>
    </div>
    <p class="dt-block-note">{{ t.cookbook.progress.note }}</p>
    <!-- 各条街一张表，放在卡片里；第一列街名固定，左右滑看后面的品级；本店所在街浅紫，学满的绿色 -->
    <div class="dt-card dt-progress-card">
      <table class="dt-progress-table">
        <thead>
          <tr>
            <th scope="col">{{ t.cookbook.progress.street }}</th>
            <th scope="col">{{ t.labels.grade[0] }}</th>
            <th v-for="g in grades" :key="g" scope="col">{{ t.labels.grade[g] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in data.streets"
            :key="s.streetId"
            :class="{ 'is-current': s.streetId === data.street }"
            :data-testid="`progress-street-${s.streetId}`"
          >
            <th scope="row">
              {{ catalog.streetName(s.streetId, String(s.streetId)) }}
            </th>
            <td :class="{ 'is-zero': s.total - (s.atLeast[0] ?? 0) === 0 }">
              {{ formatNum(s.total - (s.atLeast[0] ?? 0)) }}
            </td>
            <td
              v-for="(n, i) in s.atLeast"
              :key="i"
              :class="{ 'is-full': n === s.total, 'is-zero': n === 0 }"
            >
              {{ formatNum(n) }}
            </td>
          </tr>
          <tr class="is-sum">
            <th scope="row">{{ t.cookbook.progress.all }}</th>
            <td>{{ formatNum(total - (allRow[0] ?? 0)) }}</td>
            <td v-for="(n, i) in allRow" :key="i" :class="{ 'is-full': n === total }">
              {{ formatNum(n) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
