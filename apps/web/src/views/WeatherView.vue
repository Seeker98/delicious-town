<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { ShilingDto, WeatherToolsDto, WorldDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import type { ArtName } from '../art/generated/names';
import DtArt from '../components/DtArt.vue';
import CompassSheet from '../components/weather/CompassSheet.vue';
import LotsSheet from '../components/weather/LotsSheet.vue';
import ShilingSection from '../components/weather/ShilingSection.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { usePageTitle } from '../stores/pageTitle';
import { useToastStore } from '../stores/toast';
import { describeEffects } from '../utils/effects';
import { formatPct, timeHM } from '../utils/format';
import { useServerClock } from '../utils/serverClock';

/**
 * 天气页（天气改版设计；设计图 Wx-A、Wx-B、Sl-A、Sl-B）：顶部现在的天气和效果、当令的道、怎么玩、预报（下一轮四类概率）、
 * 时令（余额、当令、时令铺）、改天气（司天罗盘、晴雨签）
 */
const t = useT();
/** 天气名、说明、街道名按目录取，跟着语言走（问题记录 272） */
const catalog = useCatalogStore();
const toast = useToastStore();
const world = ref<WorldDto | null>(null);
const tools = ref<WeatherToolsDto | null>(null);
/** 时令（天气改版 PR②）：功能关着或读失败时不显示这一块 */
const shiling = ref<ShilingDto | null>(null);
/** 顶栏标题是当前天气（界面改版 P2a） */
usePageTitle(() =>
  world.value ? catalog.weatherName(world.value.weather.id, world.value.weather.name) : null,
);
const error = ref('');
const clock = useServerClock(() => tools.value?.now ?? null);

/** 天气说明一行一条：“经营: 上座率 −8%” 拆成灰色的小标题和内容；没有冒号的整行写 */
const fx = computed(() => {
  const w = world.value;
  if (!w) return [];
  const note = catalog.weatherNote(w.weather.id) ?? w.weather.note ?? '';
  const lines = note.trim()
    ? note.split(/\r?\n/).filter((x) => x.trim())
    : [describeEffects(w.weather.effects) || t.value.misc.weather.noEffect];
  return lines.map((line) => {
    const m = /^([^:\uff1a]{1,14}?)[\s\u00a0\u202f]*[:\uff1a][\s\u00a0\u202f]*(.+)$/.exec(line.trim());
    return m ? { k: m[1]!, v: m[2]! } : { k: '', v: line.trim() };
  });
});

const ART: Record<number, ArtName> = {
  1: 'weather-sun',
  2: 'weather-rain',
  3: 'weather-snow',
  4: 'weather-wind',
};
const artOf = (id: number): ArtName => {
  const w = catalog.weather(id);
  return w?.special ? 'weather-special' : (ART[w?.type ?? world.value?.weather.type ?? 1] ?? 'weather-sun');
};
const hourOf = (iso: string) => Number(timeHM(iso).slice(0, 2));

const head = computed(() => {
  const w = world.value;
  if (!w) return null;
  const d = t.value.misc.weather;
  const next = w.forecast ? hourOf(w.forecast.at) : null;
  if (w.cover) {
    const until = w.cover.until;
    const from = new Date(Date.parse(until) - (tools.value?.coverMinutes ?? 60) * 60_000).toISOString();
    const minutes = Math.max(1, Math.ceil((Date.parse(until) - clock.now.value) / 60_000));
    return {
      when: d.coverSlot(
        timeHM(from),
        timeHM(until),
        catalog.weatherName(w.cover.natural.id, w.cover.natural.name),
      ),
      tag: catalog.goodsName(w.cover.goodsId),
      cover: d.cover(
        w.cover.byName ?? d.someone,
        catalog.goodsName(w.cover.goodsId),
        catalog.weatherName(w.cover.natural.id, w.cover.natural.name),
        catalog.weatherName(w.weather.id, w.weather.name),
        minutes,
        next ?? 0,
      ),
    };
  }
  const cur = w.forecast?.current;
  return {
    when:
      cur !== undefined && next !== null
        ? d.slot(`${cur}:00`, timeHM(w.forecast!.at), next)
        : d.until(timeHM(w.weather.until)),
    tag: null,
    cover: null,
  };
});

/** 怎么玩：可以收起，记住（只是方便，不重要） */
const HOW_KEY = 'dt_weather_how';
const howOpen = ref(true);
try {
  howOpen.value = localStorage.getItem(HOW_KEY) !== '0';
} catch {
  // 存储不可用时总是展开
}
function toggleHow() {
  howOpen.value = !howOpen.value;
  try {
    localStorage.setItem(HOW_KEY, howOpen.value ? '1' : '0');
  } catch {
    // 忽略
  }
}

const forecast = computed(() => {
  const f = world.value?.forecast;
  if (!f) return null;
  const types = ([2, 1, 4, 3] as const)
    .map((k) => ({ k, p: f.types[String(k) as '1'] ?? 0 }))
    .sort((a, b) => b.p - a.p || a.k - b.k);
  return { at: f.at, next: hourOf(f.at), hours: f.hours ?? [], current: f.current, types };
});

/** 改天气一块底下那一行：别人盖着（黄）、我在冷却（黄）、平时写规则 */
const block = computed(() => {
  const x = tools.value;
  if (!x) return null;
  const d = t.value.misc.weather.tools;
  if (clock.pending(x.lockedUntil) && !x.pendingLots) {
    const minutes = Math.max(1, Math.ceil(clock.secondsLeft(x.lockedUntil) / 60));
    return { warn: true, text: d.locked(minutes, timeHM(x.lockedUntil)) };
  }
  if (clock.pending(x.readyAt)) {
    const used = new Date(Date.parse(x.readyAt) - x.cooldownHours * 3_600_000).toISOString();
    return { warn: true, text: d.cooling(timeHM(used), timeHM(x.readyAt)) };
  }
  return { warn: false, text: d.rule(x.cooldownHours) };
});

const compassOpen = ref(false);
const lotsOpen = ref(false);

async function load() {
  try {
    const [w, x, s] = await Promise.all([
      endpoints.weather(),
      endpoints.weatherTools().catch(() => null),
      endpoints.shiling().catch(() => null),
    ]);
    world.value = w;
    tools.value = x;
    shiling.value = s;
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, t.value.misc.weather.loadFailed);
  }
}
async function done(r: { to: number; until: string }) {
  compassOpen.value = false;
  lotsOpen.value = false;
  toast.push(t.value.misc.weather.tools.done(catalog.weatherName(r.to), timeHM(r.until)), 'info');
  await load();
}
onMounted(load);
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-if="world && head" class="dt-wx">
    <!-- 现在的天气：大图托盘、名字（盖着时带道具名）、时段、效果一条一行 -->
    <section class="dt-card dt-wx-hero" data-testid="weather-hero">
      <div class="dt-wx-hero-main">
        <span class="dt-wx-hero-art"><DtArt :name="artOf(world.weather.id)" :size="40" /></span>
        <div class="dt-wx-hero-text">
          <h2 class="dt-wx-hero-name">
            {{ catalog.weatherName(world.weather.id, world.weather.name)
            }}<span v-if="head.tag" class="dt-tag dt-tag-primary">{{ head.tag }}</span>
          </h2>
          <div class="dt-wx-hero-when" data-testid="weather-when">{{ head.when }}</div>
          <ul class="dt-wx-fx" data-testid="weather-note">
            <li v-for="(x, i) in fx" :key="i">
              <span v-if="x.k" class="dt-wx-fx-k">{{ x.k }}</span
              ><span>{{ x.v }}</span>
            </li>
          </ul>
          <div class="dt-wx-zero">{{ t.misc.weather.zeroStarLine }}</div>
          <div v-if="shiling?.season.roads.length" class="dt-wx-dl" data-testid="weather-season">
            <span class="dt-wx-fx-k">{{ t.misc.weather.shiling.dl }}</span
            ><span v-for="r in shiling.season.roads" :key="r" class="dt-road">{{
              t.misc.weather.shiling.roads[r]
            }}</span>
          </div>
        </div>
      </div>
      <p v-if="head.cover" class="dt-wx-cover" data-testid="weather-cover">
        <template v-for="(x, i) in head.cover" :key="i"
          ><b v-if="typeof x !== 'string'">{{ x.b }}</b
          ><template v-else>{{ x }}</template></template
        >
      </p>
    </section>

    <!-- 天气怎么玩：三行，可以收起 -->
    <section class="dt-card dt-wx-how" data-testid="weather-how">
      <div class="dt-wx-how-head">
        <DtArt name="me-help" :size="20" />
        <b>{{ t.misc.weather.how.title }}</b>
        <button
          type="button"
          class="dt-wx-link"
          :aria-expanded="howOpen"
          data-testid="weather-how-toggle"
          @click="toggleHow"
        >
          {{ howOpen ? t.misc.weather.how.fold : t.misc.weather.how.unfold }}
        </button>
      </div>
      <ol v-if="howOpen">
        <li v-for="(x, i) in t.misc.weather.how.lines(forecast?.hours ?? [])" :key="i">{{ x }}</li>
      </ol>
    </section>

    <!-- 预报：一天的换天时间（现在这一轮、下一轮标出来），下一轮四类的概率 -->
    <template v-if="forecast">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.misc.weather.forecast.title }}</h2>
        <span class="dt-block-more">{{ t.misc.weather.forecast.next(timeHM(forecast.at)) }}</span>
      </div>
      <section class="dt-card dt-wx-fc" data-testid="weather-forecast">
        <div v-if="forecast.hours.length" class="dt-wx-slots" aria-hidden="true">
          <span
            v-for="h in forecast.hours"
            :key="h"
            :class="{ 'is-now': h === forecast.current, 'is-next': h === forecast.next }"
            >{{ h }}:00</span
          >
        </div>
        <div v-for="x in forecast.types" :key="x.k" class="dt-wx-bar" :data-testid="`forecast-${x.k}`">
          <DtArt :name="ART[x.k]!" :size="22" />
          <span class="dt-wx-bar-name">{{ t.misc.weather.types[x.k] }}</span>
          <span class="dt-wx-meter"><i :style="{ width: `${Math.round(x.p * 100)}%` }"></i></span>
          <b class="dt-wx-bar-pct">{{ formatPct(x.p, { digits: 0 }) }}</b>
        </div>
        <p class="dt-wx-fc-note">{{ t.misc.weather.forecast.note }}</p>
      </section>
    </template>

    <!-- 时令（天气改版 PR②）：余额、当令、时令铺；0 星写“1 星开放” -->
    <ShilingSection v-if="shiling" :data="shiling" @changed="load" />

    <!-- 改天气：司天罗盘、晴雨签；底下一行写规则或者为什么现在不能用 -->
    <template v-if="tools">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.misc.weather.tools.title }}</h2>
      </div>
      <section class="dt-card dt-rows-card dt-wx-tools" data-testid="weather-tools">
        <div class="dt-row dt-wx-tool" data-testid="tool-compass">
          <span class="dt-wx-tool-art"><DtArt name="goods-compass" :size="32" /></span>
          <span class="dt-row-main">
            <span class="dt-row-title is-strong"
              >{{ catalog.goodsName(tools.compassGoodsId)
              }}<span class="dt-tag">{{ t.misc.weather.tools.have(tools.compass) }}</span></span
            >
            <span class="dt-row-sub dt-row-sub-wrap">{{ t.misc.weather.tools.compassSub }}</span>
          </span>
          <button
            v-if="tools.compass > 0"
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="!!block?.warn"
            data-testid="compass-open"
            @click="compassOpen = true"
          >
            {{ t.misc.weather.tools.use }}
          </button>
          <RouterLink v-else to="/society/mayor" class="btn btn-sm btn-outline-primary">{{
            t.misc.weather.tools.toMayor
          }}</RouterLink>
        </div>
        <div class="dt-row dt-wx-tool" data-testid="tool-lots">
          <span class="dt-wx-tool-art"><DtArt name="goods-lots" :size="32" /></span>
          <span class="dt-row-main">
            <span class="dt-row-title is-strong"
              >{{ catalog.goodsName(tools.lotsGoodsId)
              }}<span class="dt-tag">{{ t.misc.weather.tools.have(tools.lots) }}</span></span
            >
            <span class="dt-row-sub dt-row-sub-wrap">{{ t.misc.weather.tools.lotsSub }}</span>
          </span>
          <button
            v-if="tools.pendingLots && clock.pending(tools.pendingLots.until)"
            type="button"
            class="btn btn-sm btn-primary"
            data-testid="lots-open"
            @click="lotsOpen = true"
          >
            {{ t.misc.weather.tools.pick }}
          </button>
          <button
            v-else-if="tools.lots > 0"
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="!!block?.warn"
            data-testid="lots-open"
            @click="lotsOpen = true"
          >
            {{ t.misc.weather.tools.use }}
          </button>
          <RouterLink v-else to="/shop" class="btn btn-sm btn-outline-primary">{{
            t.misc.weather.tools.toShop
          }}</RouterLink>
        </div>
        <p v-if="block" :class="['dt-wx-tool-foot', { 'is-warn': block.warn }]" data-testid="tool-foot">
          {{ block.text }}
        </p>
      </section>
    </template>

    <section class="dt-card dt-wx-krab">
      <p>
        {{ t.misc.weather.krabPre }}<b>{{ catalog.streetName(world.krabStreet, world.krabStreetName) }}</b
        >{{ t.misc.weather.krabPost }}
      </p>
      <p v-if="world.holidayMultiplier > 1" class="text-success">
        {{ t.misc.weather.holiday(world.holidayMultiplier) }}
      </p>
    </section>

    <CompassSheet v-if="tools" :open="compassOpen" :tools="tools" @close="compassOpen = false" @done="done" />
    <LotsSheet
      v-if="tools"
      :open="lotsOpen"
      :tools="tools"
      :now="clock.now.value"
      @close="lotsOpen = false"
      @done="done"
      @expired="
        lotsOpen = false;
        load();
      "
    />
  </div>
</template>
