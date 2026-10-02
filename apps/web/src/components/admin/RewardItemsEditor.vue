<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { GRANT_LIMITS, HAT_NAME_MAX, MAIL_HATS_MAX, type RewardItems } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import CatalogPicker from './CatalogPicker.vue';

/**
 * 附件编辑器（补偿、后台邮件共用；子项目 6A）：银币、钻石、经验、道具、食材，可选命名帽子。
 * 输出只含填了的项；超出单项上限时通过 over 事件给出提示。父组件要清空时换一个 key 重新挂载。
 * 道具、食材用搜索下拉选（问题记录 270）；goodsOnly 只留道具行（战令解锁价格，backlog 148-1）
 */
const props = withDefaults(
  defineProps<{ modelValue: RewardItems; hats?: boolean; idPrefix?: string; goodsOnly?: boolean }>(),
  { hats: false, idPrefix: 'ri', goodsOnly: false },
);
const emit = defineEmits<{ 'update:modelValue': [RewardItems]; over: [string[]] }>();
const catalog = useCatalogStore();
const tid = (s: string) => `${props.idPrefix}-${s}`;

type Line = { id: number | ''; num: number | '' };
const coin = ref<number | ''>(props.modelValue.coin ?? '');
const diamond = ref<number | ''>(props.modelValue.diamond ?? '');
const exp = ref<number | ''>(props.modelValue.exp ?? '');
const goods = ref<Line[]>((props.modelValue.goods ?? []).map((g) => ({ ...g })));
const foods = ref<Line[]>((props.modelValue.foods ?? []).map((f) => ({ ...f })));
const hatRows = ref<Array<{ tier: 'jade' | 'xuan'; name: string }>>(
  (props.modelValue.hats ?? []).map((h) => ({ ...h })),
);
const fmt = (n: number) => n.toLocaleString('en-US');

function items(): RewardItems {
  const out: RewardItems = {};
  if (coin.value) out.coin = Number(coin.value);
  if (diamond.value) out.diamond = Number(diamond.value);
  if (exp.value) out.exp = Number(exp.value);
  const lines = (rows: Line[]) =>
    rows.filter((r) => r.id && r.num).map((r) => ({ id: Number(r.id), num: Number(r.num) }));
  if (lines(goods.value).length > 0) out.goods = lines(goods.value);
  if (lines(foods.value).length > 0) out.foods = lines(foods.value);
  const hats = hatRows.value.filter((h) => h.name.trim()).map((h) => ({ tier: h.tier, name: h.name.trim() }));
  if (props.hats && hats.length > 0) out.hats = hats;
  return out;
}

/** 每项上限（和服务端 GRANT_LIMITS 一致）、帽子没填名字：当场列出，父组件禁止提交 */
const overLimit = computed(() => {
  const out: string[] = [];
  const check = (label: string, v: number | '', max: number) => {
    if (v !== '' && Number(v) > max) out.push(`${label}最多 ${fmt(max)}`);
  };
  check('银币', coin.value, GRANT_LIMITS.coin);
  check('钻石', diamond.value, GRANT_LIMITS.diamond);
  check('经验', exp.value, GRANT_LIMITS.exp);
  for (const g of goods.value)
    if (g.id) check(`${catalog.goodsName(Number(g.id))} `, g.num, GRANT_LIMITS.item);
  for (const f of foods.value)
    if (f.id) check(`${catalog.foodName(Number(f.id))} `, f.num, GRANT_LIMITS.item);
  if (props.hats)
    hatRows.value.forEach((h, i) => {
      if (!h.name.trim()) out.push(`第 ${i + 1} 顶帽子没填名字`);
    });
  return out;
});

watch(
  [coin, diamond, exp, goods, foods, hatRows],
  () => {
    emit('update:modelValue', items());
    emit('over', overLimit.value);
  },
  { deep: true },
);
</script>

<template>
  <div>
    <div v-if="!goodsOnly" class="d-flex flex-wrap gap-2 mb-2">
      <input
        v-model.number="coin"
        type="number"
        class="form-control form-control-sm w-auto"
        :placeholder="`银币（≤ ${fmt(GRANT_LIMITS.coin)}）`"
        :max="GRANT_LIMITS.coin"
        :data-testid="tid('coin')"
      />
      <input
        v-model.number="diamond"
        type="number"
        class="form-control form-control-sm w-auto"
        :placeholder="`钻石（≤ ${fmt(GRANT_LIMITS.diamond)}）`"
        :max="GRANT_LIMITS.diamond"
        :data-testid="tid('diamond')"
      />
      <input
        v-model.number="exp"
        type="number"
        class="form-control form-control-sm w-auto"
        :placeholder="`经验（≤ ${fmt(GRANT_LIMITS.exp)}）`"
        :max="GRANT_LIMITS.exp"
        :data-testid="tid('exp')"
      />
    </div>
    <div v-for="(g, i) in goods" :key="`g${i}`" class="d-flex gap-2 mb-1 align-items-center">
      <CatalogPicker v-model="g.id" kind="goods" class="flex-fill" :testid="tid(`goods-id-${i}`)" />
      <input
        v-model.number="g.num"
        type="number"
        class="form-control form-control-sm w-auto"
        :placeholder="`数量（≤ ${fmt(GRANT_LIMITS.item)}）`"
        :max="GRANT_LIMITS.item"
        :data-testid="tid(`goods-num-${i}`)"
      />
    </div>
    <div v-for="(f, i) in foods" :key="`f${i}`" class="d-flex gap-2 mb-1 align-items-center">
      <CatalogPicker v-model="f.id" kind="foods" class="flex-fill" :testid="tid(`foods-id-${i}`)" />
      <input
        v-model.number="f.num"
        type="number"
        class="form-control form-control-sm w-auto"
        :placeholder="`数量（≤ ${fmt(GRANT_LIMITS.item)}）`"
        :max="GRANT_LIMITS.item"
        :data-testid="tid(`foods-num-${i}`)"
      />
    </div>
    <div v-for="(h, i) in hatRows" :key="`h${i}`" class="d-flex gap-2 mb-1 align-items-center">
      <select v-model="h.tier" class="form-select form-select-sm w-auto" :data-testid="tid(`hat-tier-${i}`)">
        <option value="jade">玉级（创意 +22）</option>
        <option value="xuan">铉级（创意 +40）</option>
      </select>
      <input
        v-model="h.name"
        class="form-control form-control-sm w-auto"
        :maxlength="HAT_NAME_MAX"
        :placeholder="`帽子名字（1~${HAT_NAME_MAX} 字）`"
        :data-testid="tid(`hat-name-${i}`)"
      />
      <span class="text-muted">{{
        h.name.trim() ? `${h.tier === 'jade' ? '玉' : '铉'}•${h.name.trim()}之帽` : ''
      }}</span>
    </div>
    <div v-if="!goodsOnly" class="dt-meta mb-1" :data-testid="tid('limits')">
      单次上限：银币、经验各 ≤ {{ fmt(GRANT_LIMITS.coin) }}；钻石 ≤
      {{ fmt(GRANT_LIMITS.diamond) }}；道具、食材每种 ≤ {{ fmt(GRANT_LIMITS.item) }}。
      <!-- 问题记录 204：发 9999 个只到账 5998，是橱柜、冰箱各有单种上限 -->
      食材到账时受店的单种食材上限限制：橱柜放满后进冰箱，冰箱也满了，多出的会丢弃，并记进玩家日志。
    </div>
    <div v-if="overLimit.length > 0" class="text-danger mb-1" :data-testid="tid('over')">
      请检查：{{ overLimit.join('；') }}
    </div>
    <div class="d-flex gap-2 mb-2">
      <button
        type="button"
        class="btn btn-link btn-sm p-0"
        :data-testid="tid('add-goods')"
        @click="goods.push({ id: '', num: 1 })"
      >
        + 道具
      </button>
      <button
        v-if="!goodsOnly"
        type="button"
        class="btn btn-link btn-sm p-0"
        :data-testid="tid('add-foods')"
        @click="foods.push({ id: '', num: 1 })"
      >
        + 食材
      </button>
      <button
        v-if="hats && !goodsOnly"
        type="button"
        class="btn btn-link btn-sm p-0"
        :disabled="hatRows.length >= MAIL_HATS_MAX"
        :data-testid="tid('add-hat')"
        @click="hatRows.push({ tier: 'jade', name: '' })"
      >
        + 命名帽子
      </button>
    </div>
  </div>
</template>
