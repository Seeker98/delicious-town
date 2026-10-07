<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useT } from '../../composables/useT';

/** 开放接口说明（问题记录 142，设计 §3.6） */
const t = useT();
/** 接口地址：生产环境接口在单独的域名（VITE_API_BASE），开发时和页面同源 */
const base = `${import.meta.env.VITE_API_BASE || window.location.origin}/api/v1/open`;
const ROWS: Array<[string, string]> = [
  ['', 'index'],
  ['/goods', 'goods'],
  ['/goods/:id', 'goodsId'],
  ['/foods', 'foods'],
  ['/foods/:id', 'foodsId'],
  ['/cookbooks', 'cookbooks'],
  ['/cookbooks/:id', 'cookbooksId'],
  ['/equips', 'equips'],
  ['/streets', 'streets'],
];
const example = computed(
  () =>
    `const res = await fetch('${base}/cookbooks/1?lang=en');\nconst { data } = await res.json();\nconsole.log(data.name, data.grades[0].foods);`,
);
</script>

<template>
  <div>
    <RouterLink to="/wiki" class="small dt-back">{{ t.wiki.home }}</RouterLink>
    <h5 class="dt-page-title mt-2">{{ t.wiki.api.title }}</h5>
    <p class="small">{{ t.wiki.api.intro }}</p>
    <h6 class="dt-section">{{ t.wiki.api.base }}</h6>
    <p class="small mb-1">
      <code data-testid="wiki-api-base">{{ base }}</code>
    </p>
    <p class="small">{{ t.wiki.api.langParam }}</p>
    <h6 class="dt-section">{{ t.wiki.api.endpoints }}</h6>
    <div class="table-responsive">
      <table class="table table-sm small mb-0" data-testid="wiki-api-table">
        <thead>
          <tr>
            <th>{{ t.wiki.api.path }}</th>
            <th>{{ t.wiki.api.content }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[p, k] in ROWS" :key="k">
            <td class="text-nowrap">
              <code>/api/v1/open{{ p }}</code>
            </td>
            <td>{{ t.wiki.api.list[k] }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <h6 class="dt-section">{{ t.wiki.api.format }}</h6>
    <p class="small">{{ t.wiki.api.formatText }}</p>
    <h6 class="dt-section">{{ t.wiki.api.example }}</h6>
    <pre class="small bg-light border rounded p-2 mb-0"><code>{{ example }}</code></pre>
    <h6 class="dt-section">{{ t.wiki.api.cache }}</h6>
    <p class="small">{{ t.wiki.api.cacheText }}</p>
    <h6 class="dt-section">{{ t.wiki.api.cors }}</h6>
    <p class="small">{{ t.wiki.api.corsText }}</p>
    <h6 class="dt-section">{{ t.wiki.api.limit }}</h6>
    <p class="small">{{ t.wiki.api.limitText }}</p>
    <h6 class="dt-section">{{ t.wiki.api.notIncluded }}</h6>
    <p class="small">{{ t.wiki.api.notIncludedText }}</p>
  </div>
</template>
