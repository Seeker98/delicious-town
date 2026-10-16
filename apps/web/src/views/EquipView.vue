<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { EquipDto, EquipOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import type { UiArtName } from '../art/generated/names';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtSheet from '../components/DtSheet.vue';
import DtTabs from '../components/DtTabs.vue';
import AttrPoints from '../components/equip/AttrPoints.vue';
import GemPanel from '../components/equip/GemPanel.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { activeMessages } from '../i18n';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { formatNum, formatPct } from '../utils/format';
import { equipName } from '../utils/equipName';
import { ATTR_KEYS, ATTR_NAMES, PART_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
/** 两个标签：装备、宝石（界面改版 P2b：宝石原来单独一页 /rest/gem） */
const TABS = ['equip', 'gem'] as const;
const tab = useTabQuery({ tabs: TABS });
const tabItems = computed(() => TABS.map((k) => ({ key: k, label: t.value.equip.tabs[k] })));
/** 收益加成的百分比：+1.25%（最多两位小数，按语言写小数点） */
const pctText = (x: number) => formatPct(x, { digits: 2, sign: true });
const o = ref<EquipOverviewDto | null>(null);
const part = ref<number | null>(null);
const pieces = ref<EquipDto[]>([]);
/** pieces 是哪个部位的（backlog P7：读完再显示，快速换部位时丢掉过期的响应，不先写“0 件”） */
const piecesFor = ref<number | null>(null);
const panel = ref<'none' | 'presets' | 'batch'>('none');
const presetName = ref('');
const all = ref<EquipDto[]>([]);
const picked = ref(new Set<number>());
const busy = ref(false);
const route = useRoute();
const router = useRouter();
const restStore = useRestaurantStore();
/** 还没加的属性点；加点放在底部面板里（界面改版 P7） */
const pointsLeft = computed(() => restStore.rest?.attrLeft ?? 0);
const pointsOpen = ref(false);
function pointsDone() {
  pointsOpen.value = false;
  void load();
}
/** 属性横条按最高的一项合计算长度 */
const barMax = computed(() => Math.max(1, ...ATTR_KEYS.map((k) => o.value?.attrs.total[k] ?? 0)));
const barPct = (v: number) => `${Math.max(0, (v / barMax.value) * 100)}%`;
/** 一件厨具最高的两项属性：“厨艺 +31 · 创意 +98” */
function attrsText(e: EquipDto): string {
  return ATTR_KEYS.filter((k) => e.total[k] > 0)
    .sort((a, b) => e.total[b] - e.total[a])
    .slice(0, 2)
    .map((k) => t.value.equip.attrPlus(ATTR_NAMES[k] ?? k, e.total[k]))
    .join(' · ');
}
const wornSub = (p: number, e: EquipDto) => [PART_NAMES[p], attrsText(e)].filter(Boolean).join(' · ');
/** 部位面板：穿着的排最前 */
const sortedPieces = computed(() => [...pieces.value].sort((a, b) => Number(b.worn) - Number(a.worn)));
function closePart() {
  part.value = null;
  pieces.value = [];
  piecesFor.value = null;
}
/** 读一个部位的厨具；读回来时已经换了部位就丢掉 */
async function loadPart(p: number) {
  const list = await endpoints.equipList(p);
  if (part.value !== p) return;
  pieces.value = list;
  piecesFor.value = p;
}

async function load() {
  o.value = await endpoints.equipOverview();
  if (part.value !== null) await loadPart(part.value);
}
async function run(fn: () => Promise<unknown>, fallback: string): Promise<boolean> {
  busy.value = true;
  try {
    await fn();
    await load();
    return true;
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    return false;
  } finally {
    busy.value = false;
  }
}
const name = (e: EquipDto) => `${equipName(catalog, e)}${e.stress > 0 ? ` +${e.stress}` : ''}`;

async function pick(p: number) {
  if (part.value === p) return closePart();
  part.value = p;
  piecesFor.value = null;
  await loadPart(p);
}

async function savePreset() {
  const n = presetName.value.trim();
  if (!n) return;
  if (await run(() => endpoints.equipPresetSave(n), t.value.equip.saveFailed)) presetName.value = '';
}
async function applyPreset(id: number) {
  let skipped: number[] = [];
  const ok = await run(async () => {
    skipped = (await endpoints.equipPresetApply(id)).skipped;
  }, t.value.equip.applyFailed);
  if (ok && skipped.length > 0)
    toast.push(
      t.value.equip.skipped(skipped.map((p) => PART_NAMES[p]).join(activeMessages().events.sep)),
      'info',
    );
}
const confirm = useConfirmStore();
/** 部位格子的图标：1 铲、2 刀、3 锅、4 瓶、5 帽（界面改版 P3） */
const SLOT_ART: Record<number, UiArtName> = {
  1: 'slot-spatula',
  2: 'slot-knife',
  3: 'slot-pot',
  4: 'slot-bottle',
  5: 'slot-hat',
};
/** 确认面板和预设面板不叠两层：先收起预设，问完再打开（界面改版 P3） */
async function deletePreset(id: number) {
  panel.value = 'none';
  const yes = await confirm.ask({
    title: t.value.equip.confirmDelete,
    ok: t.value.equip.delete,
    danger: true,
  });
  panel.value = 'presets';
  if (yes) await run(() => endpoints.equipPresetDelete(id), t.value.equip.deleteFailed);
}

/** 一键处理只能选"未锁定、未穿戴、没强化、没宝石、不在预设"的；只能分解（2026-10-16 起厨具不能卖店） */
const candidates = computed(() =>
  all.value.filter(
    (e) => !e.locked && !e.worn && e.stress === 0 && e.gems.length === 0 && e.inPresets.length === 0,
  ),
);
const batchTotal = computed(() =>
  candidates.value.filter((e) => picked.value.has(e.id)).reduce((s, e) => s + e.salvage, 0),
);
async function openBatch() {
  panel.value = panel.value === 'batch' ? 'none' : 'batch';
  if (panel.value !== 'batch') return;
  all.value = await endpoints.equipList();
  picked.value = new Set(candidates.value.map((e) => e.id));
}
function toggle(id: number) {
  const s = new Set(picked.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  picked.value = s;
}
async function doBatch() {
  const ids = candidates.value.filter((e) => picked.value.has(e.id)).map((e) => e.id);
  if (ids.length === 0) return;
  // 确认面板和一键处理面板不叠两层：先收起，取消了再打开（界面改版 P3）
  panel.value = 'none';
  const yes = await confirm.ask({
    title: t.value.equip.batchConfirm(ids.length, String(batchTotal.value)),
    ok: t.value.equip.process,
    danger: true,
  });
  if (!yes) {
    panel.value = 'batch';
    return;
  }
  await run(() => endpoints.equipBatch(ids, 'salvage'), t.value.equip.processFailed);
  all.value = await endpoints.equipList();
  picked.value = new Set(candidates.value.map((e) => e.id));
}

onMounted(async () => {
  void restStore.refresh().catch(() => undefined);
  try {
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.equip.loadFailed), 'danger');
    return;
  }
  // 从餐厅信息“去加点”、主线“分配属性点”过来：直接打开加点面板
  if (route.hash === '#attr-points') {
    await restStore.refresh().catch(() => undefined);
    if (pointsLeft.value > 0) pointsOpen.value = true;
    // 打开过就把锚点去掉：从厨具详情返回时不再自己弹出来（P7 终审）
    void router.replace({ hash: '' });
  }
});
</script>

<template>
  <DtTabs v-model="tab" :tabs="tabItems" />
  <GemPanel v-if="tab === 'gem'" />
  <div v-else-if="o">
    <!-- 厨力和赛厨的进攻、防守：三个数字一排（界面改版 P7） -->
    <section class="dt-card dt-equip-power" data-testid="power-line">
      <div>
        <span class="dt-stat-label">{{ t.equip.power }}</span>
        <b class="dt-equip-power-main" data-testid="power">{{ formatNum(o.attrs.power) }}</b>
      </div>
      <!-- 赛厨时的厨力（问题记录 417）：和厨塔页的对得上 -->
      <div data-testid="duel-power">
        <span class="dt-stat-label">{{ t.equip.duelAttack }}</span>
        <b>{{ formatNum(o.duelPower.attack) }}</b>
      </div>
      <div>
        <span class="dt-stat-label">{{ t.equip.duelDefend }}</span>
        <b>{{ formatNum(o.duelPower.defend) }}</b>
      </div>
    </section>

    <!-- 穿戴中（界面改版 P7）：一个部位一行，名字写全（太长折成两行），点一行弹出这个部位的厨具 -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.equip.wornTitle }}</h2>
        <span class="dt-block-more" data-testid="equip-count">{{ t.equip.countHint(o.count) }}</span>
      </div>
      <div class="dt-card dt-rows-card">
        <button
          v-for="p in [1, 2, 3, 4, 5]"
          :key="p"
          type="button"
          class="dt-row is-link dt-gear-row"
          :data-testid="`slot-${p}`"
          @click="pick(p)"
        >
          <span :class="['dt-equip-tray', { 'is-empty': !o.worn[p - 1] }]"
            ><DtArt :name="SLOT_ART[p]!" :size="26"
          /></span>
          <span class="dt-row-main">
            <template v-if="o.worn[p - 1]">
              <span class="dt-row-title dt-gear-name"
                >{{ equipName(catalog, o.worn[p - 1]!)
                }}<span v-if="o.worn[p - 1]!.stress > 0" class="dt-tag dt-tag-primary"
                  >+{{ o.worn[p - 1]!.stress }}</span
                ></span
              >
              <span class="dt-row-sub">{{ wornSub(p, o.worn[p - 1]!) }}</span>
            </template>
            <template v-else>
              <span class="dt-row-title dt-meta">{{ t.equip.empty }}</span>
              <span class="dt-row-sub">{{ PART_NAMES[p] }}</span>
            </template>
          </span>
        </button>
        <!-- 套装：名字和件数，每一档一行，生效的打勾 -->
        <div v-for="s in o.suits" :key="s.suitId" class="dt-equip-suit" data-testid="suit">
          <div class="dt-equip-suit-head">
            <b>{{ catalog.suit(s.suitId)?.name ?? s.name }}</b>
            <span :class="['dt-tag', s.tiers.some((x) => x.active) ? 'dt-tag-ok' : 'dt-tag-mute']">{{
              t.equip.suitCount(s.count, s.maxNum)
            }}</span>
          </div>
          <div v-for="(x, i) in s.tiers" :key="x.need" :class="['dt-equip-tier', { 'is-on': x.active }]">
            <i :class="['bi', x.active ? 'bi-check2' : 'bi-dot']" aria-hidden="true"></i>
            <span
              ><span class="dt-meta">{{ t.equip.tierNeed(x.need) }}</span>
              {{ catalog.suit(s.suitId)?.tiers[i]?.desc ?? x.desc }}</span
            >
          </div>
        </div>
      </div>
      <div class="dt-equip-actions">
        <button
          type="button"
          class="btn btn-outline-primary"
          data-testid="open-presets"
          @click="panel = 'presets'"
        >
          {{ t.equip.presets }}
        </button>
        <button type="button" class="btn btn-outline-primary" data-testid="open-batch" @click="openBatch">
          {{ t.equip.batch }}
        </button>
        <button
          type="button"
          class="btn btn-light"
          :disabled="busy"
          @click="run(() => endpoints.equipUnwearAll(), t.equip.unwearFailed)"
        >
          {{ t.equip.unwearAll }}
        </button>
      </div>
    </section>

    <!-- 一件厨具都没有：写去哪里获得（界面改版 P3） -->
    <DtEmpty
      v-if="o.count === 0"
      art="empty-equip"
      :title="t.equip.none.title"
      :body="t.equip.none.body"
      to="/temple"
      :link="t.equip.none.link"
      data-testid="equip-empty"
    />

    <!-- 点一个部位：这个部位的厨具一行一件，名字进详情，右边穿戴或卸下 -->
    <DtSheet :open="part !== null" :title="part !== null ? (PART_NAMES[part] ?? '') : ''" @close="closePart">
      <div v-if="piecesFor !== part" class="dt-meta" data-testid="part-loading">{{ t.common.loading }}</div>
      <div v-else class="dt-meta mb-2">{{ t.equip.partHint(pieces.length) }}</div>
      <div v-if="piecesFor === part && pieces.length === 0" class="dt-meta">{{ t.equip.noPieces }}</div>
      <div v-else-if="piecesFor === part" class="dt-sheet-list" data-testid="part-pieces">
        <div v-for="e in sortedPieces" :key="e.id" :class="['dt-row', 'dt-gear-row', { 'is-worn': e.worn }]">
          <span class="dt-equip-tray"><DtArt :name="SLOT_ART[e.part]!" :size="26" /></span>
          <RouterLink :to="`/rest/equip/${e.id}`" class="dt-row-main dt-equip-link">
            <span class="dt-row-title dt-gear-name"
              >{{ equipName(catalog, e)
              }}<span v-if="e.stress > 0" class="dt-tag dt-tag-primary">+{{ e.stress }}</span
              ><i v-if="e.locked" class="bi bi-lock-fill ms-1 dt-meta" :aria-label="t.equip.locked"></i
            ></span>
            <span class="dt-row-sub"
              ><span v-if="e.worn" class="dt-tag dt-tag-ok me-1">{{ t.equip.wornTag }}</span
              ><span v-else-if="o.level < e.minLevel" class="dt-tag dt-tag-danger me-1">{{
                t.equip.needLevel(e.minLevel)
              }}</span
              >{{ attrsText(e) }}</span
            >
          </RouterLink>
          <button
            v-if="!e.worn"
            type="button"
            class="btn btn-sm btn-outline-primary"
            :disabled="busy || o.level < e.minLevel"
            :data-testid="`wear-${e.id}`"
            @click="run(() => endpoints.equipWear(e.id), t.equip.wearFailed)"
          >
            {{ t.equip.wear }}
          </button>
          <button
            v-else
            type="button"
            class="btn btn-sm btn-light"
            :disabled="busy"
            :data-testid="`unwear-${e.id}`"
            @click="run(() => endpoints.equipUnwear(e.id), t.equip.unwearFailed)"
          >
            {{ t.equip.unwear }}
          </button>
        </div>
      </div>
    </DtSheet>

    <!-- 预设、一键处理是长表单，放进底部面板（界面改版 P3） -->
    <DtSheet :open="panel === 'presets'" :title="t.equip.presets" @close="panel = 'none'">
      <div class="small" data-testid="sheet-presets">
        <div v-for="p in o.presets" :key="p.id" class="d-flex align-items-center gap-1 border-bottom py-1">
          <span class="flex-fill">{{ p.name }}</span>
          <button
            class="btn btn-sm btn-primary"
            :disabled="busy"
            :data-testid="`preset-apply-${p.id}`"
            @click="applyPreset(p.id)"
          >
            {{ t.equip.apply }}
          </button>
          <button class="btn btn-sm btn-outline-danger" :disabled="busy" @click="deletePreset(p.id)">
            {{ t.equip.delete }}
          </button>
        </div>
        <div class="d-flex gap-1 mt-2">
          <input
            v-model="presetName"
            maxlength="12"
            class="form-control form-control-sm"
            :placeholder="t.equip.presetName"
            data-testid="preset-name"
          />
          <button
            class="btn btn-sm btn-primary text-nowrap"
            :disabled="busy"
            data-testid="preset-save"
            @click="savePreset"
          >
            {{ t.equip.saveCurrent }}
          </button>
        </div>
      </div>
    </DtSheet>

    <DtSheet :open="panel === 'batch'" :title="t.equip.batch" @close="panel = 'none'">
      <div class="small" data-testid="sheet-batch">
        <div class="text-muted mb-1">{{ t.equip.batchNote }}</div>
        <div v-for="e in candidates" :key="e.id" :data-testid="`batch-item-${e.id}`">
          <label
            ><input type="checkbox" :checked="picked.has(e.id)" @change="toggle(e.id)" /> {{ name(e) }}</label
          >
        </div>
        <div class="d-flex align-items-center mt-2">
          <span data-testid="batch-total">{{ t.equip.batchTotal(t.equip.essence(batchTotal)) }}</span>
          <button
            class="btn btn-sm btn-danger ms-auto"
            :disabled="busy"
            data-testid="batch-go"
            @click="doBatch"
          >
            {{ t.equip.process }}
          </button>
        </div>
      </div>
    </DtSheet>

    <!-- 属性（界面改版 P7）：每项一根横条，深紫是加点、浅紫是厨具，右边合计；下面一行小字写“加点 + 厨具” -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.equip.attrsTitle }}</h2>
        <span class="dt-block-more dt-equip-legend"
          ><i class="is-a" aria-hidden="true"></i>{{ t.equip.rows.points
          }}<i class="is-b" aria-hidden="true"></i>{{ t.equip.rows.gear }}</span
        >
      </div>
      <div class="dt-card dt-attr-bars" data-testid="attr-table">
        <div v-for="k in ATTR_KEYS" :key="k" class="dt-attr-bar" :data-testid="`attr-${k}`">
          <span class="dt-attr-bar-name">{{ ATTR_NAMES[k] }}</span>
          <span
            class="dt-hbar"
            role="img"
            :aria-label="
              t.equip.barLabel(ATTR_NAMES[k] ?? k, o.attrs.points[k], o.attrs.gear[k], o.attrs.total[k])
            "
            ><i class="is-a" :style="{ width: barPct(o.attrs.points[k]) }"></i
            ><i class="is-b" :style="{ width: barPct(o.attrs.gear[k]) }"></i
          ></span>
          <b class="dt-attr-bar-total">{{ o.attrs.total[k] }}</b>
          <small class="dt-attr-bar-sum" aria-hidden="true"
            >{{ o.attrs.points[k] }} + {{ o.attrs.gear[k] }}</small
          >
        </div>
        <!-- 锚点：餐厅信息页“去加点”、主线“分配属性点”直接落到这里并打开加点面板（530 遗留） -->
        <div v-if="pointsLeft > 0" id="attr-points" class="dt-attr-points">
          <span
            ><b>{{ pointsLeft }}</b> {{ t.equip.pointsLeftText }}</span
          >
          <button
            type="button"
            class="btn btn-sm btn-primary"
            data-testid="open-points"
            @click="pointsOpen = true"
          >
            {{ t.equip.points.open }}
          </button>
        </div>
      </div>
    </section>
    <DtSheet :open="pointsOpen" :title="t.equip.points.title" @close="pointsOpen = false">
      <AttrPoints :totals="o.attrs.total" @done="pointsDone" />
    </DtSheet>

    <!-- 厨具收益加成（问题记录 411）：三个绿色数字 -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.equip.incomeTitle }}</h2>
      </div>
      <div class="dt-card dt-equip-power" data-testid="gear-income">
        <div>
          <span class="dt-stat-label">{{ t.equip.incomeCoin }}</span>
          <b class="is-good">{{ pctText(o.income.coinRate) }}</b>
        </div>
        <div>
          <span class="dt-stat-label">{{ t.equip.incomeExp }}</span>
          <b class="is-good">{{ pctText(o.income.expRate) }}</b>
        </div>
        <div>
          <span class="dt-stat-label">{{ t.equip.incomeGold }}</span>
          <b class="is-good">{{ pctText(o.income.mcGoldRate) }}</b>
        </div>
      </div>
    </section>
    <details class="dt-card dt-effects mt-2" data-testid="equip-notes">
      <summary class="dt-effects-sum">
        <span class="dt-effects-sum-text">{{ t.equip.notesTitle }}</span>
        <i class="bi bi-chevron-down dt-effects-chev" aria-hidden="true"></i>
      </summary>
      <ul class="dt-effects-body dt-equip-notes">
        <li>{{ t.equip.powerNote }}</li>
        <li>{{ t.equip.duelNote }}</li>
        <li>{{ t.equip.incomeNote }}</li>
      </ul>
    </details>
  </div>
</template>
