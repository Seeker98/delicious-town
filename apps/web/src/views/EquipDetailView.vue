<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { EquipDetailDto, EquipGemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import type { UiArtName } from '../art/generated/names';
import DtArt from '../components/DtArt.vue';
import DtSheet from '../components/DtSheet.vue';
import { goodsArt } from '../utils/goodsArt';
import { useT } from '../composables/useT';
import { activeMessages } from '../i18n';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import { usePageTitle } from '../stores/pageTitle';
import { useToastStore } from '../stores/toast';
import { formatNum, formatPct } from '../utils/format';
import { equipName } from '../utils/equipName';
import { ATTR_KEYS, ATTR_NAMES, PART_NAMES } from '../utils/labels';

const route = useRoute();
const router = useRouter();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const id = Number(route.params.id);
const d = ref<EquipDetailDto | null>(null);
const stone = ref(false);
const gemPick = ref<number | null>(null);
const backPick = ref<number | null>(null);
const busy = ref(false);
const pct = (x: number) => formatPct(x, { min: 1 });
const ROWS = ['base', 'boost', 'gem', 'total'] as const;
/** 部位图：1 铲、2 刀、3 锅、4 瓶、5 帽 */
const SLOT_ART: Record<number, UiArtName> = {
  1: 'slot-spatula',
  2: 'slot-knife',
  3: 'slot-pot',
  4: 'slot-bottle',
  5: 'slot-hat',
};
/** 属性横条（界面改版 P7）：按列出来的最高合计算长度 */
const barMax = computed(() => Math.max(1, ...shownAttrs.value.map((k) => e.value?.total[k] ?? 0)));
const barPct = (v: number) => `${Math.max(0, (v / barMax.value) * 100)}%`;
/** 横条下面的加法：基础 + 强化，有宝石再 + 宝石 */
const sumText = (k: (typeof ATTR_KEYS)[number]) => {
  const x = e.value!;
  return [x.base[k], x.boost[k], ...(x.gem[k] !== 0 ? [x.gem[k]] : [])].join(' + ');
};
/** 成功率圆环：周长 2π×27 */
const ringLen = (rate: number) => Math.max(0, Math.min(1, rate)) * 169.65;
const suitName = computed(() =>
  e.value && e.value.suitId > 0 ? (catalog.suit(e.value.suitId)?.name ?? '') : '',
);
/** 宝石面板：点空孔是镶嵌，点一颗宝石是看属性、摘除 */
const gemSheet = ref<EquipGemDto | 'inlay' | null>(null);
const gemAttrs = (g: EquipGemDto) =>
  ATTR_KEYS.filter((k) => g.attrs[k] !== 0)
    .map((k) => t.value.equip.attrPlus(ATTR_NAMES[k] ?? k, g.attrs[k]))
    .join(' · ');
async function inlay() {
  const pick = gemPick.value;
  if (pick === null) return;
  gemSheet.value = null;
  await run(() => endpoints.equipInlay(id, pick), t.value.equip.detail.inlayFailed);
}
async function ungemPicked() {
  const g = gemSheet.value;
  if (!g || g === 'inlay') return;
  gemSheet.value = null;
  await ungem(g);
}
/** 只列有数的属性（问题记录 530：六行里大多是 0） */
const shownAttrs = computed(() =>
  e.value ? ATTR_KEYS.filter((k) => ROWS.some((r) => e.value![r][k] !== 0)) : [],
);

async function load() {
  d.value = await endpoints.equipDetail(id);
  gemPick.value = d.value.gems[0]?.goodsId ?? null;
  backPick.value = d.value.backItems[0]?.goodsId ?? null;
  if (d.value.have.stone === 0) stone.value = false;
}
/** 执行操作；reload=false 用于分解 / 出售（厨具已经没了） */
async function run<T>(fn: () => Promise<T>, fallback: string, reload = true): Promise<T | null> {
  busy.value = true;
  try {
    const r = await fn();
    if (reload) await load();
    return r;
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    return null;
  } finally {
    busy.value = false;
  }
}

const e = computed(() => d.value?.equip ?? null);
/** 顶栏标题：厨具名，强化过的后面加 +N（界面改版 P2a） */
usePageTitle(() =>
  e.value ? equipName(catalog, e.value) + (e.value.stress > 0 ? ` +${e.value.stress}` : '') : null,
);
/** 厨具说明（含背景故事，问题记录 134） */
const desc = computed(() => (e.value ? (catalog.goods(e.value.goodsId)?.desc ?? '') : ''));
const freeHoles = computed(() => (e.value ? e.value.curHole - e.value.gems.length : 0));
/** 分解 / 出售的阻挡原因（和服务端一致） */
const blocked = computed(() => {
  const x = e.value;
  if (!x) return '';
  const b = t.value.equip.detail.blocked;
  if (x.locked) return b.locked;
  if (x.worn) return b.worn;
  if (x.gems.length > 0) return b.gems;
  if (x.inPresets.length > 0) return b.preset(x.inPresets.join(activeMessages().events.sep));
  return '';
});

async function stress() {
  const m = t.value.equip.detail;
  const r = await run(() => endpoints.equipStress(id, stone.value), m.stressFailed);
  if (!r) return;
  if (r.success) {
    const extra = `${r.lucky ? m.tags.lucky : ''}${r.floor ? m.tags.floor : ''}`;
    toast.push(m.stressOk(r.stress, ATTR_NAMES[r.attr ?? ''] ?? '', r.val, extra));
  } else toast.push(m.stressMiss, 'info');
}
/** 回退会降强化等级，先确认（问题记录 128） */
const confirm = useConfirmStore();
async function rollback() {
  const b = d.value?.backItems.find((x) => x.goodsId === backPick.value);
  if (!b || !e.value) return;
  // 服务端最多退到 +0：道具级数比已强化的多时，多的作废（终审）
  const n = Math.min(b.back, e.value.stress);
  const m = t.value.equip.detail;
  if (!(await confirm.ask({ title: m.confirmRollback(catalog.goodsName(b.goodsId), n, b.back - n) }))) return;
  await run(() => endpoints.equipRollback(id, b.goodsId), m.rollbackFailed);
}
/** 摘除要花银币时先确认并写明多少；免费时直接摘（问题记录 128） */
async function ungem(g: { id: number; level: number }) {
  const coin = g.level * (d.value?.ungemCoinPerLevel ?? 0);
  const m = t.value.equip.detail;
  if (coin > 0 && !(await confirm.ask({ title: m.confirmUngem(formatNum(coin)) }))) return;
  await run(() => endpoints.equipUngem(g.id), m.ungemFailed);
}
async function salvage() {
  const m = t.value.equip.detail;
  // 分解、出售是危险操作：确认面板的按钮红色描边（界面改版 P3）
  if (!e.value || !(await confirm.ask({ title: m.confirmSalvage(e.value.salvage), danger: true }))) return;
  if ((await run(() => endpoints.equipSalvage(id), m.salvageFailed, false)) !== null)
    await router.push('/rest/equip');
}
async function sell() {
  const m = t.value.equip.detail;
  if (
    !e.value?.sellPrice ||
    !(await confirm.ask({ title: m.confirmSell(formatNum(e.value.sellPrice)), danger: true }))
  )
    return;
  if ((await run(() => endpoints.equipSell(id), m.sellFailed, false)) !== null)
    await router.push('/rest/equip');
}

onMounted(() => load().catch((err) => toast.push(errorMessage(err, t.value.equip.loadFailed), 'danger')));
</script>

<template>
  <div v-if="d && e">
    <!-- 头部（界面改版 P7）：大图、全名、几个小标签；说明写在下面（问题记录 130、134） -->
    <section class="dt-card dt-equip-hero">
      <div class="dt-detail-head">
        <span class="dt-detail-art dt-equip-hero-art"><DtArt :name="SLOT_ART[e.part]!" :size="48" /></span>
        <div class="dt-detail-info">
          <h2 class="dt-equip-hero-name">{{ equipName(catalog, e) }}</h2>
          <div class="dt-equip-hero-tags" data-testid="equip-meta">
            <span v-if="e.stress > 0" class="dt-tag dt-tag-primary">+{{ e.stress }}</span>
            <span class="dt-tag dt-tag-mute">{{ PART_NAMES[e.part] }}</span>
            <span class="dt-tag dt-tag-mute">{{ t.equip.detail.minLevel(e.minLevel) }}</span>
            <span v-if="e.worn" class="dt-tag dt-tag-ok">{{ t.equip.wornTag }}</span>
            <span v-if="e.locked" class="dt-tag dt-tag-mute">{{ t.equip.locked }}</span>
            <span v-if="suitName" class="dt-tag dt-tag-mute">{{ suitName }}</span>
          </div>
        </div>
      </div>
      <p v-if="desc" class="dt-equip-hero-desc" data-testid="equip-desc">{{ desc }}</p>
    </section>

    <!-- 属性：每项一根三段横条（基础、强化、宝石），右边合计；只列有数的属性（问题记录 530） -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.equip.attrsTitle }}</h2>
        <span v-if="shownAttrs.length > 0" class="dt-block-more dt-equip-legend"
          ><i class="is-a" aria-hidden="true"></i>{{ t.equip.detail.rows.base
          }}<i class="is-b" aria-hidden="true"></i>{{ t.equip.detail.rows.boost
          }}<i class="is-c" aria-hidden="true"></i>{{ t.equip.detail.rows.gem }}</span
        >
      </div>
      <p v-if="shownAttrs.length === 0" class="dt-block-note" data-testid="no-attrs">
        {{ t.equip.detail.noAttrs }}
      </p>
      <div v-else class="dt-card dt-attr-bars">
        <div v-for="k in shownAttrs" :key="k" class="dt-attr-bar" :data-testid="`attr-row-${k}`">
          <span class="dt-attr-bar-name">{{ ATTR_NAMES[k] }}</span>
          <span
            class="dt-hbar"
            role="img"
            :aria-label="
              t.equip.detail.barLabel(ATTR_NAMES[k] ?? k, e.base[k], e.boost[k], e.gem[k], e.total[k])
            "
            ><i class="is-a" :style="{ width: barPct(e.base[k]) }"></i
            ><i class="is-b" :style="{ width: barPct(e.boost[k]) }"></i
            ><i class="is-c" :style="{ width: barPct(e.gem[k]) }"></i
          ></span>
          <b class="dt-attr-bar-total">{{ e.total[k] }}</b>
          <small class="dt-attr-bar-sum" aria-hidden="true">{{ sumText(k) }}</small>
        </div>
      </div>
    </section>

    <!-- 强化：圆环写成功率，旁边写成功后到多少；消耗一行、强化石一个开关、整宽主按钮；回退一行 -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.equip.detail.stress }}</h2>
        <span v-if="d.rate" class="dt-block-more">+{{ e.stress }} → +{{ e.stress + 1 }}</span>
      </div>
      <div class="dt-card dt-rows-card">
        <template v-if="d.rate">
          <div class="dt-stress-top">
            <svg
              class="dt-ring"
              width="64"
              height="64"
              viewBox="0 0 64 64"
              role="img"
              :aria-label="`${t.equip.detail.rate} ${pct(d.rate.total)}`"
            >
              <circle cx="32" cy="32" r="27" class="dt-ring-track"></circle>
              <circle
                cx="32"
                cy="32"
                r="27"
                class="dt-ring-fill"
                :stroke-dasharray="`${ringLen(d.rate.total)} 169.65`"
                transform="rotate(-90 32 32)"
              ></circle>
              <text x="32" y="37" text-anchor="middle" class="dt-ring-text">{{ pct(d.rate.total) }}</text>
            </svg>
            <div class="dt-min0">
              <div v-if="d.next" class="dt-stress-gain" data-testid="stress-next">
                {{ t.equip.detail.next(d.next.gain, d.next.total) }}
              </div>
              <div class="dt-meta">
                {{ t.equip.detail.rate
                }}{{
                  t.equip.detail.rateParts(
                    pct(d.rate.base),
                    pct(d.rate.luck),
                    pct(d.rate.weather),
                    pct(d.rate.floor),
                  )
                }}
              </div>
            </div>
          </div>
          <dl class="dt-kv-rows">
            <div class="dt-kv-row">
              <dt>{{ t.equip.detail.costLabel }}</dt>
              <dd class="dt-stress-cost">
                {{ t.equip.detail.costShort(d.cost.essence, d.have.essence, formatNum(d.cost.coin)) }}
              </dd>
            </div>
          </dl>
          <label class="dt-row dt-stress-stone">
            <span class="dt-row-main"
              ><span class="dt-row-title">{{ t.equip.detail.stoneTitle }}</span
              ><span class="dt-row-sub">{{ t.equip.detail.stoneHave(d.have.stone) }}</span></span
            >
            <span class="dt-row-end form-switch"
              ><input
                v-model="stone"
                class="form-check-input"
                type="checkbox"
                role="switch"
                :disabled="d.have.stone === 0"
                data-testid="stone"
            /></span>
          </label>
          <div class="dt-stress-go">
            <button
              class="btn btn-primary dt-btn-block"
              :disabled="busy"
              data-testid="stress-go"
              @click="stress"
            >
              {{ t.equip.detail.stress }}
            </button>
          </div>
        </template>
        <div v-else class="dt-row dt-meta">{{ t.equip.detail.maxed }}</div>
        <div v-if="e.stress > 0 && d.backItems.length > 0" class="dt-row dt-stress-back">
          <span class="dt-row-main"
            ><span class="dt-row-title">{{ t.equip.detail.rollback }}</span
            ><select
              v-model="backPick"
              class="form-select form-select-sm mt-1"
              :aria-label="t.equip.detail.rollback"
            >
              <option v-for="b in d.backItems" :key="b.goodsId" :value="b.goodsId">
                {{ t.equip.detail.backOption(catalog.goodsName(b.goodsId), b.back, b.num) }}
              </option>
            </select></span
          >
          <button
            class="btn btn-sm btn-light"
            :disabled="busy || backPick === null"
            data-testid="rollback-go"
            @click="rollback"
          >
            {{ t.equip.detail.rollback }}
          </button>
        </div>
      </div>
    </section>

    <!-- 宝石：一排圆孔，镶着的画宝石（点了可以摘），空孔虚线（点了镶嵌），还能打孔的紫色虚线 + -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.equip.detail.gems }}</h2>
        <span v-if="e.maxHole > 0 || e.gems.length > 0" class="dt-block-more" data-testid="hole-count">{{
          t.equip.detail.holes(e.gems.length, e.curHole, e.maxHole)
        }}</span>
      </div>
      <!-- 不能镶宝石的厨具只写一句（问题记录 530） -->
      <p v-if="e.maxHole === 0 && e.gems.length === 0" class="dt-block-note" data-testid="no-gems">
        {{ t.equip.detail.noGems }}
      </p>
      <div v-else class="dt-card dt-gem-card">
        <div class="dt-holes">
          <button
            v-for="g in e.gems"
            :key="g.id"
            type="button"
            class="dt-hole is-gem"
            :aria-label="catalog.goodsName(g.goodsId)"
            :data-testid="`gem-${g.id}`"
            @click="gemSheet = g"
          >
            <DtArt :name="goodsArt(g.goodsId)" :size="30" />
          </button>
          <button
            v-for="i in freeHoles"
            :key="`free-${i}`"
            type="button"
            class="dt-hole is-empty"
            :aria-label="t.equip.detail.emptyHole"
            data-testid="hole-empty"
            @click="gemSheet = 'inlay'"
          >
            {{ t.equip.detail.emptyShort }}
          </button>
          <button
            v-if="e.maxHole > 0 && e.curHole < e.maxHole"
            type="button"
            class="dt-hole is-drill"
            :aria-label="t.equip.detail.drill(d.have.drill)"
            :disabled="busy"
            data-testid="drill-go"
            @click="run(() => endpoints.equipDrill(id), t.equip.detail.drillFailed)"
          >
            {{ t.equip.detail.drillShort }}
          </button>
        </div>
        <p class="dt-meta mb-0 mt-2">
          {{
            t.equip.detail.gemNote(
              d.have.drill,
              d.ungemCoinPerLevel > 0 ? formatNum(d.ungemCoinPerLevel) : null,
            )
          }}
        </p>
      </div>
    </section>
    <!-- 点空孔：选一颗宝石镶上；点宝石：写属性，可以摘除 -->
    <DtSheet
      :open="gemSheet !== null"
      :title="
        gemSheet === 'inlay' ? t.equip.detail.inlay : gemSheet ? catalog.goodsName(gemSheet.goodsId) : ''
      "
      @close="gemSheet = null"
    >
      <template v-if="gemSheet === 'inlay'">
        <p v-if="d.gems.length === 0" class="dt-meta">{{ t.equip.detail.noGemItems }}</p>
        <select
          v-else
          v-model="gemPick"
          class="form-select"
          data-testid="inlay-pick"
          :aria-label="t.equip.detail.inlay"
        >
          <option v-for="g in d.gems" :key="g.goodsId" :value="g.goodsId">
            {{ t.equip.detail.gemOption(catalog.goodsName(g.goodsId), g.num, g.level) }}
          </option>
        </select>
      </template>
      <p v-else-if="gemSheet" class="dt-meta">{{ gemAttrs(gemSheet) }}</p>
      <template #actions>
        <div class="dt-sheet-pair">
          <button type="button" class="btn btn-light" @click="gemSheet = null">{{ t.common.close }}</button>
          <button
            v-if="gemSheet === 'inlay'"
            type="button"
            class="btn btn-primary"
            :disabled="busy || gemPick === null"
            data-testid="inlay-go"
            @click="inlay"
          >
            {{ t.equip.detail.inlay }}
          </button>
          <button
            v-else-if="gemSheet"
            type="button"
            class="btn btn-outline-danger"
            :disabled="busy"
            :data-testid="`ungem-${gemSheet.id}`"
            @click="ungemPicked"
          >
            {{ t.equip.detail.ungem }}
          </button>
        </div>
      </template>
    </DtSheet>

    <!-- 锁定、分解、出售：分解和出售是危险操作（红描边）；不能分解的写原因 -->
    <div class="dt-equip-actions mt-3">
      <button
        class="btn btn-outline-primary"
        :disabled="busy"
        data-testid="lock-go"
        @click="run(() => endpoints.equipLock(id, !e!.locked), t.common.opFailed)"
      >
        {{ e.locked ? t.equip.detail.unlock : t.equip.detail.lock }}
      </button>
      <button
        class="btn btn-outline-danger"
        :disabled="busy || !!blocked"
        data-testid="salvage-go"
        @click="salvage"
      >
        {{ t.equip.detail.salvage(e.salvage) }}
      </button>
      <button
        v-if="e.sellPrice !== null"
        class="btn btn-outline-danger"
        :disabled="busy || !!blocked"
        data-testid="sell-go"
        @click="sell"
      >
        {{ t.equip.detail.sell(formatNum(e.sellPrice)) }}
      </button>
    </div>
    <p v-if="blocked" class="dt-block-note mt-2">{{ t.equip.detail.blockedNote(blocked) }}</p>

    <section v-if="d.history.length > 0" class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.equip.detail.history }}</h2>
      </div>
      <div class="dt-card dt-list-card">
        <div v-for="(h, i) in d.history" :key="i" class="dt-feed">
          <span class="dt-feed-time">+{{ h.stress }}</span>
          <span :class="['dt-feed-text', h.success ? 'text-success' : 'dt-meta']"
            >{{
              h.success
                ? t.equip.detail.historyOk(ATTR_NAMES[h.attr ?? ''] ?? '', h.val)
                : t.equip.detail.historyFail
            }}{{ h.stone ? t.equip.detail.tags.stone : '' }}{{ h.lucky ? t.equip.detail.tags.lucky : ''
            }}{{ h.floor ? t.equip.detail.tags.floor : '' }}</span
          >
        </div>
      </div>
    </section>
  </div>
</template>
