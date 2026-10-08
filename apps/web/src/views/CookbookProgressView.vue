<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { CookbookProgressDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { formatNum, formatPct } from '../utils/format';

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
    data.value = await endpoints.cookbookProgress();
  } catch (e) {
    error.value = errorMessage(e, t.value.cookbook.progress.loadFailed);
  }
});
</script>

<template>
  <div class="d-flex align-items-center gap-2 mb-2">
    <h6 class="mb-0">{{ t.cookbook.progress.title }}</h6>
    <RouterLink to="/cookbooks" class="dt-go small">{{ t.cookbook.progress.back }}</RouterLink>
  </div>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <template v-if="data">
    <ul class="list-unstyled small mb-3" data-testid="progress-summary">
      <li v-for="(g, i) in grades" :key="g">
        {{
          t.cookbook.progress.summary(
            t.labels.grade[g] ?? '',
            formatNum(allRow[i]!),
            formatNum(total),
            formatPct(total ? allRow[i]! / total : 0, { digits: 2 }),
          )
        }}
      </li>
    </ul>
    <div class="small text-muted mb-1">{{ t.cookbook.progress.note }}</div>
    <div class="table-responsive">
      <table class="table table-sm small text-end align-middle">
        <thead>
          <tr>
            <th class="text-start">{{ t.cookbook.progress.street }}</th>
            <th>{{ t.labels.grade[0] }}</th>
            <th v-for="g in grades" :key="g">{{ t.labels.grade[g] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in data.streets"
            :key="s.streetId"
            :class="{ 'table-active': s.streetId === data.street }"
            :data-testid="`progress-street-${s.streetId}`"
          >
            <th scope="row" class="text-start text-nowrap">
              {{ catalog.streetName(s.streetId, String(s.streetId)) }}
            </th>
            <td>{{ formatNum(s.total - (s.atLeast[0] ?? 0)) }}</td>
            <td v-for="(n, i) in s.atLeast" :key="i" :class="{ 'text-success fw-bold': n === s.total }">
              {{ formatNum(n) }}
            </td>
          </tr>
          <tr class="fw-bold">
            <th scope="row" class="text-start">{{ t.cookbook.progress.all }}</th>
            <td>{{ formatNum(total - (allRow[0] ?? 0)) }}</td>
            <td v-for="(n, i) in allRow" :key="i">{{ formatNum(n) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
