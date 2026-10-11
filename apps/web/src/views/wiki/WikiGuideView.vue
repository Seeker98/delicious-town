<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { OpenGuideNumbers } from '@dt/shared';
import { useT } from '../../composables/useT';
import { headBody } from '../../utils/headBody';
import { useWikiData } from './wiki';

/**
 * 玩法攻略（问题记录 384；界面改版 P11 报刊专栏）：快速模拟里勤快、普通、休闲三种机器人的做法，写给玩家看。
 * 整页米色纸，报头写“小镇资料库 · 专栏”；开头导语首行缩进，下面一排目录胶囊；每节宋体小标题 + 细线，
 * “三种节奏”是两列小表
 */
const t = useT();
const data = useWikiData();

/**
 * 攻略里的数（菜数、外卖门槛、交易所门槛、新手经验加成）按开放接口给的默认配置写（backlog 384）。
 * 还没读到、或接口是发版前缓存的旧响应（没有这些数）时，带数的几条先不显示
 */
const nums = ref<OpenGuideNumbers | null>(null);
onMounted(async () => {
  try {
    nums.value = (await data.index()).guide ?? null;
  } catch {
    nums.value = null;
  }
});
type Item = string | ((n: OpenGuideNumbers) => string);
/** 带数的一条算不出来（旧响应缺后来加的数，比如收购的几项）就跳过这一条，不让整页报错（收购 PR 3 审查） */
function line(x: (n: OpenGuideNumbers) => string, n: OpenGuideNumbers): string[] {
  try {
    return [x(n)];
  } catch {
    return [];
  }
}
const shown = (items: readonly Item[]) =>
  items.flatMap((x) => (typeof x === 'string' ? [x] : nums.value ? line(x, nums.value) : []));
/** 目录胶囊：点了跳到那一节 */
function jump(i: number) {
  document.getElementById(`wiki-guide-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>

<template>
  <div class="dt-paper-page dt-paper-article">
    <header class="dt-paper-mast2">
      <div class="dt-paper-kick">{{ t.wiki.columnKick }}</div>
      <h2 class="dt-paper-head is-sm">{{ t.wiki.guide.title }}</h2>
      <div class="dt-paper-dateline">
        <span>{{ t.wiki.guide.dl1 }}</span
        ><span>{{ t.wiki.guide.dl2 }}</span>
      </div>
    </header>
    <p class="dt-paper-lead">{{ t.wiki.guide.intro }}</p>
    <nav class="dt-paper-toc" :aria-label="t.wiki.toc">
      <button v-for="(s, i) in t.wiki.guide.sections" :key="s.title" type="button" @click="jump(i)">
        {{ s.title }}
      </button>
    </nav>
    <section
      v-for="(s, i) in t.wiki.guide.sections"
      :id="`wiki-guide-${i}`"
      :key="s.title"
      data-testid="guide-section"
    >
      <h3 class="dt-paper-h">{{ s.title }}</h3>
      <!-- 第一节“三种节奏”：左边节奏名、右边做法和进度 -->
      <table v-if="i === 0" class="dt-paper-table">
        <tbody>
          <tr v-for="item in shown(s.items)" :key="item">
            <th>{{ headBody(item).head }}</th>
            <td>{{ headBody(item).body }}</td>
          </tr>
        </tbody>
      </table>
      <ul v-else class="dt-paper-list">
        <li v-for="item in shown(s.items)" :key="item">{{ item }}</li>
      </ul>
    </section>
  </div>
</template>
