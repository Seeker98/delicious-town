<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CHANGELOG, type ChangelogId } from '../data/changelog';
import { useChangelog } from '../composables/useChangelog';
import { useT } from '../composables/useT';
import { isNewChangelog, markChangelogSeen, readChangelogSeen } from '../utils/changelogSeen';
import { headBody } from '../utils/headBody';

/**
 * 更新记录（问题记录 348；界面改版 P11 报刊风）：一张米色纸，报头宋体“更新记录”、双线，下面一行写共几条、最近哪天。
 * 一天一栏：左边大号日期（宋体）、月和星期，右边这天的每一条；冒号前面是标题（宋体加粗），后面是说明。
 * 比上次来新的条目带红色“新”；一次显示 10 天，底下“再看 10 天”
 */
const PAGE = 10;
const t = useT();
/** 文案分包按需加载，到了再显示各天 */
const texts = useChangelog();
/** 进来时记下的“看到哪天”：标完“新”再更新，这一次照样看得到哪些是新的 */
const seen = readChangelogSeen();
const shown = ref(PAGE);
onMounted(() => markChangelogSeen());

const days = computed(() => {
  const out: Array<{ date: string; ids: ChangelogId[] }> = [];
  for (const x of CHANGELOG) {
    const last = out[out.length - 1];
    if (last && last.date === x.date) last.ids.push(x.id);
    else out.push({ date: x.date, ids: [x.id] });
  }
  return out;
});
const visible = computed(() => days.value.slice(0, shown.value));
/** 日期拆成年、月、日、星期（按北京日期写的字符串，不按本机时区） */
const parts = (d: string) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return { y, m, d: day, w: new Date(Date.UTC(y, m - 1, day)).getUTCDay() };
};
const dayNum = (d: string) => String(Number(d.slice(8, 10)));
const latest = computed(() => {
  if (!CHANGELOG[0]) return '';
  const p = parts(CHANGELOG[0].date);
  return t.value.site.ymd(p.y, p.m, p.d);
});
const item = (id: ChangelogId) => headBody(texts.value?.[id] ?? '');
</script>

<template>
  <section class="dt-paper dt-cl" data-testid="changelog">
    <header class="dt-paper-mast2">
      <div class="dt-paper-kick">{{ t.nav.appName }}</div>
      <h2 class="dt-paper-head">{{ t.site.changelogTitle }}</h2>
      <div class="dt-paper-dateline">
        <span>{{ t.site.clTotal(CHANGELOG.length) }}</span
        ><span>{{ t.site.clLatest(latest) }}</span>
      </div>
    </header>
    <template v-if="texts">
      <div v-for="d in visible" :key="d.date" class="dt-cl-day" :data-testid="`cl-day-${d.date}`">
        <div class="dt-cl-date">
          <b>{{ dayNum(d.date) }}</b>
          <span>{{ t.site.monthShort(parts(d.date).m) }}</span>
          <span>{{ t.site.weekday(parts(d.date).w) }}</span>
        </div>
        <ul class="dt-cl-items">
          <li v-for="id in d.ids" :key="id" data-testid="cl-item">
            <template v-if="item(id).head"
              ><b class="dt-cl-head">{{ item(id).head }}</b
              ><span v-if="isNewChangelog(d.date, seen)" class="dt-cl-new" data-testid="cl-new">{{
                t.site.newMark
              }}</span
              >{{ t.site.clColon }}{{ item(id).body }}</template
            >
            <template v-else
              >{{ item(id).body
              }}<span v-if="isNewChangelog(d.date, seen)" class="dt-cl-new" data-testid="cl-new">{{
                t.site.newMark
              }}</span></template
            >
          </li>
        </ul>
      </div>
      <button
        v-if="shown < days.length"
        type="button"
        class="dt-paper-btn"
        data-testid="cl-more"
        @click="shown += PAGE"
      >
        {{ t.site.clMore(Math.min(PAGE, days.length - shown)) }}
      </button>
    </template>
  </section>
</template>
