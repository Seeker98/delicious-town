<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { BROADCAST_NEWS, isBroadcastStyle, type NewsDto, type TownDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import ReportButton from '../ReportButton.vue';
import DailyCard from './DailyCard.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import { newsParts, newsTime } from '../../utils/news';
import { useServerClock } from '../../utils/serverClock';

const props = defineProps<{ data: TownDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const myRest = computed(() => useSessionStore().me?.restaurantId ?? null);
const toast = useToastStore();
const t = useT();
const items = ref<NewsDto[]>([]);
const hasMore = ref(false);
const text = ref('');
const busy = ref(false);
/** 读取中：防止"加载更多"连点追加两次同一页 */
const loading = ref(false);
const clock = useServerClock(() => props.data.now);

/** 读取序号：刷新第一页总是执行并作废进行中的读取；只有"加载更多"在读取中时被拦住（PR27 遗留） */
let seq = 0;
async function load(more = false) {
  if (more && loading.value) return;
  const mine = ++seq;
  loading.value = true;
  try {
    const last = items.value.at(-1);
    const page = await endpoints.townNews(more && last ? last.id : undefined);
    if (mine !== seq) return;
    items.value = more ? [...items.value, ...page.items] : page.items;
    hasMore.value = page.hasMore;
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, t.value.town.news.loadFailed), 'danger');
  } finally {
    if (mine === seq) loading.value = false;
  }
}
onMounted(() => void load());

const block = computed(() => {
  const b = props.data.broadcast;
  const x = t.value.town.news;
  if (props.data.star < b.minStar) return x.needStar(b.minStar);
  if (b.horns === 0) return x.noHorn;
  if (clock.pending(b.readyAt)) return x.cooling(clock.secondsLeft(b.readyAt));
  return '';
});

async function send() {
  if (busy.value) return;
  busy.value = true;
  try {
    await endpoints.townBroadcast(text.value);
    text.value = '';
    toast.push(t.value.town.news.sent, 'success');
    emit('reload');
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.town.news.failed), 'danger');
    emit('reload');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- 小镇日报（2026-10-08）：区服没开时卡片自己不显示 -->
  <DailyCard />
  <div class="d-flex gap-1 mb-1">
    <input
      v-model="text"
      class="form-control form-control-sm"
      :maxlength="data.broadcast.maxLen"
      :placeholder="t.town.news.placeholder"
      data-testid="bc-input"
    />
    <button
      class="btn btn-sm btn-primary text-nowrap"
      :disabled="busy || !!block || text.trim() === ''"
      data-testid="bc-send"
      @click="send"
    >
      {{ t.town.news.send }}
    </button>
  </div>
  <div class="dt-meta mb-2">
    {{ t.town.news.horns(data.broadcast.horns) }}
    <span v-if="block" class="text-danger ms-1" data-testid="bc-block">{{ block }}</span>
  </div>
  <div
    v-for="n in items"
    :key="n.id"
    :class="['dt-feed', { 'text-primary': isBroadcastStyle(n.type) }]"
    data-testid="news-row"
  >
    <span class="dt-feed-time">{{ newsTime(n.createdAt) }}</span>
    <!-- 广播只加粗内容，时间保持普通（问题记录 196） -->
    <!-- 一番赏大赏和喇叭一样按广播显示，和首页一致（backlog 一番赏） -->
    <span :class="{ 'fw-bold': isBroadcastStyle(n.type) }" data-testid="news-text"
      >{{
        isBroadcastStyle(n.type) ? t.nav.news.broadcast : ''
      }}<!-- 别人的店名链到访问页，方便加好友（问题记录 567）；自己的店不做成链接 --><template
        v-for="(s, i) in newsParts(n, catalog)"
        :key="i"
        ><RouterLink v-if="s.restId !== undefined && s.restId !== myRest" :to="`/friends/${s.restId}`">{{
          s.text
        }}</RouterLink
        ><template v-else>{{ s.text }}</template></template
      ></span
    >
    <!-- 别人的喇叭可以举报（子项目 6B-1） -->
    <ReportButton
      v-if="n.type === BROADCAST_NEWS && n.restId !== null && n.restId !== myRest"
      class="ms-1"
      target-type="broadcast"
      :target-id="n.id"
      :testid="`news-report-${n.id}`"
    />
  </div>
  <div v-if="items.length === 0" class="dt-empty">{{ t.town.news.empty }}</div>
  <button
    v-if="hasMore"
    class="btn btn-sm btn-outline-secondary mt-2"
    :disabled="loading"
    data-testid="news-more"
    @click="load(true)"
  >
    {{ t.common.loadMore }}
  </button>
</template>
