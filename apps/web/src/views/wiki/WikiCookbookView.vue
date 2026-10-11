<script setup lang="ts">
import { computed, ref, onBeforeUnmount, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { OpenCookbookDto, OpenStreetDto } from '@dt/shared';
import WikiEntry from '../../components/wiki/WikiEntry.vue';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { usePageTitle } from '../../stores/pageTitle';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { GRADE_NAMES, TASTE_NAMES } from '../../utils/labels';
import { isNotFound, useWikiData } from './wiki';

/**
 * 食谱词条（问题记录 142；界面改版 P11 报刊风）：大图用主料的图，名字下面写菜系和口味；
 * 资料表写街道、推荐等级、售价；各品级食材左边品级名、右边食材链接×数量，放不下自动换行
 */
const route = useRoute();
const router = useRouter();
const t = useT();
const data = useWikiData();
const c = ref<OpenCookbookDto | null>(null);
const streets = ref<OpenStreetDto[]>([]);
const error = ref<'' | 'missing' | 'failed'>('');

const toast = useToastStore();
const catalog = useCatalogStore();
/** 读取序号：先打开 A 再打开 B，A 晚到的结果不盖掉 B（backlog #115） */
let seq = 0;
// 离开页面后，旧请求的结果和失败提示都不要了（质量期 ①b 终审）
onBeforeUnmount(() => seq++);
watch(
  () => Number(route.params.id),
  async (id) => {
    const mine = ++seq;
    c.value = null;
    error.value = '';
    try {
      const s = (await data.streets()).items;
      const v = await data.cookbook(id);
      if (mine !== seq) return;
      streets.value = s;
      c.value = v;
      // 旧链接（重新编号前的编号）：接口已跳到新编号，地址栏也换成新的（设计 §5）
      if (v.id !== id) void router.replace(`/wiki/cookbooks/${v.id}`);
    } catch (e) {
      if (mine !== seq) return;
      error.value = isNotFound(e) ? 'missing' : 'failed';
      if (error.value === 'failed') toast.push(t.value.wiki.loadFailed, 'danger');
    }
  },
  { immediate: true },
);
const w = computed(() => t.value.wiki);
/** 顶栏标题是菜名；返回在顶栏（界面改版 P2a） */
usePageTitle(() => c.value?.name);
const street = computed(() => streets.value.find((s) => s.id === c.value?.streetId) ?? null);
/** 口味用顿号还是逗号跟着语言：简繁中文用顿号 */
const tastes = computed(() =>
  (c.value?.taste ?? []).map((x) => TASTE_NAMES[x] ?? '').join(t.value.events.sep),
);
/** 第一行分类：食谱 · 菜系 · 口味 */
const kick = computed(() =>
  [
    w.value.kinds.cookbooks,
    street.value?.cookName ?? '',
    tastes.value ? w.value.fields.tasteOf(tastes.value) : '',
  ]
    .filter(Boolean)
    .join(' · '),
);
</script>

<template>
  <div>
    <div v-if="error" class="dt-empty" data-testid="wiki-error">
      {{ error === 'missing' ? t.wiki.notFound : t.wiki.loadFailed }}
    </div>
    <WikiEntry
      v-else-if="c"
      :art="c.mainFoodId ? catalog.foodArt(c.mainFoodId) : 'food-misc'"
      :name="c.name"
      :kick="kick"
    >
      <dl class="dt-entry-dl">
        <dt>{{ w.fields.street }}</dt>
        <dd>
          <RouterLink :to="`/wiki/streets/${c.streetId}`" data-testid="wiki-street-link">{{
            street?.name ?? c.streetId
          }}</RouterLink>
        </dd>
        <dt>{{ w.fields.recommendLabel }}</dt>
        <dd>{{ w.level(c.level) }}</dd>
        <dt>{{ w.fields.price }}</dt>
        <dd>{{ w.coin(formatNum(c.coin)) }}</dd>
      </dl>
      <h3 class="dt-entry-h">{{ w.sections.grades }}</h3>
      <dl class="dt-entry-grades" data-testid="wiki-grades">
        <template v-for="g in c.grades" :key="g.grade">
          <dt>{{ GRADE_NAMES[g.grade] }}</dt>
          <dd>
            <!-- 长食材名可以折行，只有数量不和名字断开 -->
            <span v-for="f in g.foods" :key="f.foodsId"
              ><RouterLink :to="`/wiki/foods/${f.foodsId}`">{{ f.name }}</RouterLink
              ><span class="text-nowrap">{{ t.common.times + f.num }}</span></span
            >
          </dd>
        </template>
      </dl>
    </WikiEntry>
  </div>
</template>
