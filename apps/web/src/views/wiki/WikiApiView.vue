<script setup lang="ts">
import { computed, ref } from 'vue';
import DtArt from '../../components/DtArt.vue';
import { useT } from '../../composables/useT';
import { useToastStore } from '../../stores/toast';

/**
 * 开放接口说明（问题记录 142，设计 §3.6；界面改版 P11 报刊专栏）：路径用等宽紫字，接口表两列；
 * 代码块是浅底圆角，基础地址那块右边带“复制”
 */
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
  ['/mysterious', 'mysterious'],
  ['/mysterious/:id', 'mysteriousId'],
  ['/equips', 'equips'],
  ['/streets', 'streets'],
];
const example = computed(
  () =>
    `const res = await fetch('${base}/cookbooks/1?lang=en');\nconst { data } = await res.json();\nconsole.log(data.name, data.grades[0].foods);`,
);
const toast = useToastStore();
const copied = ref(false);
async function copyBase() {
  try {
    await navigator.clipboard.writeText(base);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    toast.push(t.value.misc.invite.copyFailed, 'danger');
  }
}
/** 正文各节：标题和说明 */
const notes = computed(() => [
  [t.value.wiki.api.format, t.value.wiki.api.formatText],
  [t.value.wiki.api.cache, t.value.wiki.api.cacheText],
  [t.value.wiki.api.cors, t.value.wiki.api.corsText],
  [t.value.wiki.api.limit, t.value.wiki.api.limitText],
  [t.value.wiki.api.notIncluded, t.value.wiki.api.notIncludedText],
]);
</script>

<template>
  <div class="dt-paper-page dt-paper-article">
    <header class="dt-paper-mast2">
      <div class="dt-paper-kick">{{ t.wiki.columnKick }}</div>
      <h2 class="dt-paper-head is-sm">{{ t.wiki.api.title }}</h2>
      <div class="dt-paper-dateline">
        <span>{{ t.wiki.api.dl1 }}</span
        ><span>{{ t.wiki.api.dl2 }}</span>
      </div>
    </header>
    <p class="dt-paper-lead">{{ t.wiki.api.intro }}</p>
    <h3 class="dt-paper-h">{{ t.wiki.api.base }}</h3>
    <div class="dt-code dt-code-base">
      <code data-testid="wiki-api-base">{{ base }}</code>
      <button
        type="button"
        class="btn btn-sm btn-outline-primary"
        data-testid="wiki-api-copy"
        @click="copyBase"
      >
        <DtArt name="set-copy" :size="14" />{{ copied ? t.misc.invite.copied : t.wiki.api.copy }}
      </button>
    </div>
    <p class="dt-col-p">{{ t.wiki.api.langParam }}</p>
    <h3 class="dt-paper-h">{{ t.wiki.api.endpoints }}</h3>
    <table class="dt-paper-table is-api" data-testid="wiki-api-table">
      <thead>
        <tr>
          <th>{{ t.wiki.api.path }}</th>
          <th>{{ t.wiki.api.content }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="[p, k] in ROWS" :key="k">
          <th>
            <code class="dt-code-path">/open{{ p }}</code>
          </th>
          <td>{{ t.wiki.api.list[k] }}</td>
        </tr>
      </tbody>
    </table>
    <h3 class="dt-paper-h">{{ t.wiki.api.example }}</h3>
    <pre class="dt-code"><code>{{ example }}</code></pre>
    <template v-for="[h, p] in notes" :key="h">
      <h3 class="dt-paper-h">{{ h }}</h3>
      <p class="dt-col-p">{{ p }}</p>
    </template>
  </div>
</template>
