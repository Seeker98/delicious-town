<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { COMMISSION_MEMBERS, type CommissionDto, type CommissionMember } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import type { ArtName } from '../art/generated/names';
import DtArt from '../components/DtArt.vue';
import DtSheet from '../components/DtSheet.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import MascotCard from '../components/MascotCard.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useLocaleStore } from '../stores/locale';
import { catalogNames, dailyLang, dailyPlain } from '../utils/daily';
import { logText } from '../utils/events';
import { formatNum, gameDateTime } from '../utils/format';
import { serverNowMs } from '../utils/serverNow';

/**
 * 小镇委员会（2026-10-16，效果图用户已看过）：主席一张卡（点一下换一句）；“今日要点”五位委员一人一行，
 * 点一行从下面弹出这位委员的面板（台词、分管、今天的数、去哪）；最下面是委员会公报。
 * ?m= 直接打开某位委员的面板（餐厅动态里的卫生巡查链到章鱼哥）
 */
const ART: Record<CommissionMember, ArtName> = {
  mayor: 'npc-mayor',
  squid: 'npc-squid',
  fandao: 'npc-fandao',
  garden: 'npc-garden',
  gary: 'npc-gary',
  bro13: 'npc-bro13',
};
/** 面板里的按钮去哪；主席没有 */
const GO: Partial<Record<CommissionMember, string>> = {
  squid: '/friends?tab=feed',
  fandao: '/weather',
  garden: '/market',
  gary: '/bank',
  bro13: '/town',
};
/** 特价菜场的食材列几种，多了写“等” */
const FOODS_SHOWN = 3;
/** 几天内的公报标“新” */
const NEW_MS = 3 * 86_400_000;

const t = useT();
const route = useRoute();
const router = useRouter();
const catalog = useCatalogStore();
const locale = useLocaleStore();
const data = ref<CommissionDto | null>(null);
const error = ref('');

async function load() {
  try {
    data.value = await endpoints.commission();
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, t.value.commission.loadFailed);
  }
}
onMounted(() => {
  void catalog.load().catch(() => undefined);
  void load();
});

const hhmm = (iso: string) => gameDateTime(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
const when = (iso: string) =>
  gameDateTime(iso, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const mem = (k: CommissionMember) => t.value.commission.members[k];
const linesOf = (k: CommissionMember) => mem(k).lines.map((text) => ({ text, weight: 1 }));

/** 今日要点：每位委员一句，数据从接口来 */
const brief = computed<Record<Exclude<CommissionMember, 'mayor'>, string>>(() => {
  const b = t.value.commission.brief;
  const d = data.value?.brief;
  if (!d) return { squid: '', fandao: '', garden: '', gary: '', bro13: '' };
  const h = d.hygiene;
  let garden = b.off;
  if (d.market) {
    const ids = d.market.foodsIds;
    const names = ids
      .slice(0, FOODS_SHOWN)
      .map((id) => catalog.foodName(id))
      .join(b.sep);
    garden =
      ids.length === 0
        ? b.gardenNone(hhmm(d.market.next))
        : b.garden(ids.length, ids.length > FOODS_SHOWN ? b.gardenMore(names) : names);
  }
  const daily = d.daily
    ? dailyPlain(
        d.daily.title[dailyLang(locale.locale).lang],
        d.daily.rests,
        catalogNames(catalog),
        t.value.town.daily.closed,
      )
    : '';
  return {
    squid: b.squid(h.roachKills, h.mouseVisits, h.mouseSteals),
    fandao: b.fandao(catalog.weatherName(d.weather.id), hhmm(d.weather.until)),
    garden,
    gary: b.gary(formatNum(d.finance.coin)),
    bro13: daily ? b.bro13(daily) : b.bro13None,
  };
});
const rows = COMMISSION_MEMBERS.filter((k): k is Exclude<CommissionMember, 'mayor'> => k !== 'mayor');

/** 打开的委员面板：跟着地址里的 ?m= 走，能后退、能从餐厅动态直接链过来 */
const open = computed<CommissionMember | null>(() => {
  const m = route.query.m;
  return typeof m === 'string' && (COMMISSION_MEMBERS as readonly string[]).includes(m)
    ? (m as CommissionMember)
    : null;
});
const show = (k: CommissionMember) => void router.push({ query: { ...route.query, m: k } });
const hide = () => {
  const { m: _m, ...rest } = route.query;
  void router.replace({ query: rest });
};
/** 章鱼哥面板里“你的店”：最近一次巡查，和餐厅动态里同一句话 */
const mine = computed(() => {
  const h = data.value?.myHygiene;
  if (!h) return t.value.commission.sheet.mineNone;
  const { at, ...params } = h;
  return logText({ type: 'hygiene.report', params, at }, catalog);
});
/** 面板按钮的字（主席没有按钮） */
const goText = computed(() =>
  open.value && open.value !== 'mayor' ? t.value.commission.sheet.go[open.value] : '',
);
const isNew = (iso: string) => serverNowMs() - Date.parse(iso) < NEW_MS;
</script>

<template>
  <div class="dt-commission" data-testid="commission">
    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <MascotCard
      class="dt-hero-card"
      :name="`${mem('mayor').name} · ${mem('mayor').role}`"
      icon="bi-person-badge"
      art="npc-mayor"
      :lines="linesOf('mayor')"
      :ready="!!data"
      testid="cm-mayor"
      large
    />

    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.commission.briefTitle }}</h2>
        <span class="dt-block-more">{{ t.commission.briefHint }}</span>
      </div>
      <DtSkeleton v-if="!data && !error" :rows="5" />
      <div v-else-if="data" class="dt-card dt-rows-card">
        <button
          v-for="k in rows"
          :key="k"
          type="button"
          class="dt-row is-link dt-row-wrap dt-cm-row"
          :data-testid="`cm-row-${k}`"
          @click="show(k)"
        >
          <span class="dt-npc-ava"><DtArt :name="ART[k]" :size="40" /></span>
          <span class="dt-row-main">
            <span class="dt-row-title is-strong"
              >{{ mem(k).name }} <span class="dt-tag dt-tag-mute">{{ mem(k).role }}</span></span
            >
            <span class="dt-row-sub dt-cm-brief" :data-testid="`cm-brief-${k}`">{{ brief[k] }}</span>
          </span>
        </button>
      </div>
    </section>

    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.commission.noticesTitle }}</h2>
      </div>
      <div v-if="data && data.notices.length === 0" class="dt-card dt-empty">
        {{ t.commission.noticesEmpty }}
      </div>
      <div v-else-if="data" class="dt-card dt-list-card">
        <article v-for="n in data.notices" :key="n.id" class="dt-cm-notice" data-testid="cm-notice">
          <div class="dt-cm-by">
            <span class="dt-npc-ava is-xs"><DtArt :name="ART[n.member]" :size="20" /></span>
            <span>{{ mem(n.member).name }} · {{ mem(n.member).role }}</span>
            <span v-if="isNew(n.createdAt)" class="dt-tag dt-tag-warn">{{ t.commission.newTag }}</span>
            <span class="dt-cm-when">{{ when(n.createdAt) }}</span>
          </div>
          <p>{{ n.body }}</p>
        </article>
      </div>
      <p class="dt-block-note dt-cm-foot">{{ t.commission.noticesFoot }}</p>
    </section>

    <DtSheet :open="!!open" :title="open ? mem(open).role : ''" @close="hide">
      <div v-if="open" data-testid="cm-sheet">
        <MascotCard
          :key="open"
          :name="mem(open).name"
          icon="bi-person-badge"
          :art="ART[open]"
          :lines="linesOf(open)"
          :ready="true"
          testid="cm-sheet-npc"
          large
        />
        <p class="dt-meta dt-cm-hint">{{ t.commission.sheet.tapHint }}</p>
        <dl class="dt-sum dt-cm-sum">
          <div>
            <dt>{{ t.commission.sheet.duty }}</dt>
            <dd>{{ mem(open).duty }}</dd>
          </div>
          <div v-if="open !== 'mayor' && data">
            <dt>{{ t.commission.sheet.today }}</dt>
            <dd>{{ brief[open] }}</dd>
          </div>
          <div v-if="open === 'squid'">
            <dt>{{ t.commission.sheet.mine }}</dt>
            <dd data-testid="cm-mine">{{ mine }}</dd>
          </div>
        </dl>
        <p v-if="open === 'squid'" class="dt-meta dt-cm-hint">{{ t.commission.sheet.rule }}</p>
      </div>
      <template v-if="open && GO[open]" #actions>
        <RouterLink :to="GO[open]!" class="btn btn-primary dt-btn-block" data-testid="cm-go">{{
          goText
        }}</RouterLink>
      </template>
    </DtSheet>
  </div>
</template>
