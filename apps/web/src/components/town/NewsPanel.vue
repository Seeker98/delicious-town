<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { BROADCAST_NEWS, type NewsDto, type TownDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import ReportButton from '../ReportButton.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import { newsText, newsTime } from '../../utils/news';
import { useServerClock } from '../../utils/serverClock';

const props = defineProps<{ data: TownDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const myRest = computed(() => useSessionStore().me?.restaurantId ?? null);
const toast = useToastStore();
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
    if (mine === seq) toast.push(errorMessage(e, '读取新闻失败'), 'danger');
  } finally {
    if (mine === seq) loading.value = false;
  }
}
onMounted(() => void load());

const block = computed(() => {
  const b = props.data.broadcast;
  if (props.data.star < b.minStar) return `餐厅 ${b.minStar} 星才能广播`;
  if (b.horns === 0) return '没有喇叭（和 13 哥聊天可以拿到）';
  if (clock.pending(b.readyAt)) return `广播冷却中，还要等 ${clock.secondsLeft(b.readyAt)} 秒`;
  return '';
});

async function send() {
  if (busy.value) return;
  busy.value = true;
  try {
    await endpoints.townBroadcast(text.value);
    text.value = '';
    toast.push('广播已发出', 'success');
    emit('reload');
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '广播失败'), 'danger');
    emit('reload');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="d-flex gap-1 mb-1">
    <input
      v-model="text"
      class="form-control form-control-sm"
      :maxlength="data.broadcast.maxLen"
      placeholder="对全镇说点什么"
      data-testid="bc-input"
    />
    <button
      class="btn btn-sm btn-primary text-nowrap"
      :disabled="busy || !!block || text.trim() === ''"
      data-testid="bc-send"
      @click="send"
    >
      广播
    </button>
  </div>
  <div class="dt-meta mb-2">
    喇叭 {{ data.broadcast.horns }} 个，每次用 1 个
    <span v-if="block" class="text-danger ms-1" data-testid="bc-block">{{ block }}</span>
  </div>
  <div
    v-for="n in items"
    :key="n.id"
    :class="['dt-feed', { 'text-primary': n.type === BROADCAST_NEWS, 'fw-bold': n.type === BROADCAST_NEWS }]"
    data-testid="news-row"
  >
    <span class="dt-feed-time">{{ newsTime(n.createdAt) }}</span>
    <span>{{ n.type === BROADCAST_NEWS ? '【广播】' : '' }}{{ newsText(n, catalog) }}</span>
    <!-- 别人的喇叭可以举报（子项目 6B-1） -->
    <ReportButton
      v-if="n.type === BROADCAST_NEWS && n.restId !== null && n.restId !== myRest"
      class="ms-1"
      target-type="broadcast"
      :target-id="n.id"
      :testid="`news-report-${n.id}`"
    />
  </div>
  <div v-if="items.length === 0" class="dt-empty">还没有新闻</div>
  <button
    v-if="hasMore"
    class="btn btn-sm btn-outline-secondary mt-2"
    :disabled="loading"
    data-testid="news-more"
    @click="load(true)"
  >
    加载更多
  </button>
</template>
