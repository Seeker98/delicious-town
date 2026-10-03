<script setup lang="ts">
import { ref } from 'vue';
import { ACTIVITY_ACTIONS, type ExchangeDef } from '@dt/shared';
import { rowKeys } from '../../../utils/activityForm';
import RewardItemsEditor from '../RewardItemsEditor.vue';

const props = defineProps<{ modelValue: ExchangeDef; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [ExchangeDef] }>();
type Def = ExchangeDef;
const patch = (p: Partial<Def>) => emit('update:modelValue', { ...props.modelValue, ...p });
const num = (e: Event) => Number((e.target as HTMLInputElement).value);
const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
const shopKeys = ref(rowKeys(props.modelValue.shop.length));
const setDrop = (i: number, p: Partial<Def['drops'][number]>) =>
  patch({ drops: props.modelValue.drops.map((d, j) => (j === i ? { ...d, ...p } : d)) });
const setShop = (i: number, p: Partial<Def['shop'][number]>) =>
  patch({ shop: props.modelValue.shop.map((s, j) => (j === i ? { ...s, ...p } : s)) });
const setCost = (i: number, k: number, p: Partial<Def['shop'][number]['cost'][number]>) =>
  setShop(i, { cost: props.modelValue.shop[i]!.cost.map((c, j) => (j === k ? { ...c, ...p } : c)) });
function addShop() {
  shopKeys.value = [...shopKeys.value, ...rowKeys(1)];
  patch({
    shop: [...props.modelValue.shop, { cost: [{ currency: 0, num: 1 }], award: {} as never, limit: 1 }],
  });
}
function removeShop(i: number) {
  shopKeys.value = shopKeys.value.filter((_, j) => j !== i);
  patch({ shop: props.modelValue.shop.filter((_, j) => j !== i) });
}
const err = (k: string) => props.errors[k];
/** 某一行下的所有字段错误（终审：货币名、个数、上限等都要显示在对应行） */
const errsUnder = (prefix: string) => Object.entries(props.errors).filter(([k]) => k.startsWith(prefix));
/** 掉落规则或兑换消耗还引用着的货币不能删：删了下标会错位（终审） */
const inUse = (i: number) =>
  props.modelValue.drops.some((d) => d.currency === i) ||
  props.modelValue.shop.some((s) => s.cost.some((c) => c.currency === i));
</script>

<template>
  <div class="small fw-bold">活动货币</div>
  <div v-if="err('def.currencies')" class="text-danger small" data-testid="err-def.currencies">
    {{ err('def.currencies') }}
  </div>
  <div v-for="(c, i) in modelValue.currencies" :key="`c${i}`" class="d-flex gap-2 align-items-center py-1">
    <input
      class="form-control form-control-sm w-auto"
      maxlength="12"
      :value="c.name"
      :data-testid="`cur-name-${i}`"
      @input="
        patch({ currencies: modelValue.currencies.map((x, j) => (j === i ? { name: val($event) } : x)) })
      "
    />
    <button
      type="button"
      class="btn btn-sm btn-link text-danger"
      :disabled="modelValue.currencies.length <= 1 || inUse(i)"
      :title="inUse(i) ? '掉落规则或兑换表还在用这种货币，先改掉再删' : undefined"
      :data-testid="`cur-del-${i}`"
      @click="patch({ currencies: modelValue.currencies.filter((_, j) => j !== i) })"
    >
      删除
    </button>
    <span
      v-for="[k, m] in errsUnder(`def.currencies.${i}.`)"
      :key="k"
      class="text-danger small"
      :data-testid="`err-${k}`"
      >{{ m }}</span
    >
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary mb-3"
    data-testid="cur-add"
    :disabled="modelValue.currencies.length >= 8"
    @click="patch({ currencies: [...modelValue.currencies, { name: '' }] })"
  >
    加一种货币
  </button>

  <div class="small fw-bold">掉落规则</div>
  <div
    v-for="(d, i) in modelValue.drops"
    :key="`d${i}`"
    class="d-flex flex-wrap gap-2 align-items-center py-1"
  >
    <select
      class="form-select form-select-sm w-auto"
      :value="d.key"
      @change="setDrop(i, { key: val($event) })"
    >
      <option v-for="(name, k) in ACTIVITY_ACTIONS" :key="k" :value="k">{{ name }}</option>
    </select>
    概率
    <input
      type="number"
      step="0.01"
      class="form-control form-control-sm"
      style="width: 5rem"
      :value="Math.round(d.chance * 10000) / 100"
      :data-testid="`drop-chance-${i}`"
      @input="setDrop(i, { chance: Math.round(num($event) * 100) / 10000 })"
    />% 掉
    <select
      class="form-select form-select-sm w-auto"
      :value="d.currency"
      @change="setDrop(i, { currency: num($event) })"
    >
      <option v-for="(c, k) in modelValue.currencies" :key="k" :value="k">
        {{ c.name || `货币 ${k + 1}` }}
      </option>
    </select>
    ×<input
      type="number"
      min="1"
      class="form-control form-control-sm"
      style="width: 4rem"
      :value="d.num"
      @input="setDrop(i, { num: num($event) })"
    />
    每天最多
    <input
      type="number"
      min="1"
      class="form-control form-control-sm"
      style="width: 5rem"
      :value="d.dailyCap"
      @input="setDrop(i, { dailyCap: num($event) })"
    />
    <button
      type="button"
      class="btn btn-sm btn-link text-danger"
      :disabled="modelValue.drops.length <= 1"
      @click="patch({ drops: modelValue.drops.filter((_, j) => j !== i) })"
    >
      删除
    </button>
    <span
      v-for="[k, m] in errsUnder(`def.drops.${i}.`)"
      :key="k"
      class="text-danger small"
      :data-testid="`err-${k}`"
      >{{ m }}</span
    >
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary mb-3"
    :disabled="modelValue.drops.length >= 20"
    @click="
      patch({
        drops: [...modelValue.drops, { key: 'signin', chance: 0.05, currency: 0, num: 1, dailyCap: 10 }],
      })
    "
  >
    加一条规则
  </button>

  <div class="small fw-bold">兑换表</div>
  <div v-for="(s, i) in modelValue.shop" :key="shopKeys[i]" class="border-bottom py-2">
    <div v-for="(c, k) in s.cost" :key="k" class="d-flex gap-2 align-items-center py-1">
      消耗
      <select
        class="form-select form-select-sm w-auto"
        :value="c.currency"
        :data-testid="`shop-cost-cur-${i}-${k}`"
        @change="setCost(i, k, { currency: num($event) })"
      >
        <option v-for="(cu, j) in modelValue.currencies" :key="j" :value="j">
          {{ cu.name || `货币 ${j + 1}` }}
        </option>
      </select>
      ×<input
        type="number"
        min="1"
        class="form-control form-control-sm"
        style="width: 5rem"
        :value="c.num"
        @input="setCost(i, k, { num: num($event) })"
      />
      <button
        type="button"
        class="btn btn-sm btn-link text-danger"
        :disabled="s.cost.length <= 1"
        @click="setShop(i, { cost: s.cost.filter((_, j) => j !== k) })"
      >
        删除
      </button>
    </div>
    <button
      type="button"
      class="btn btn-sm btn-link p-0"
      :data-testid="`shop-cost-add-${i}`"
      :disabled="s.cost.length >= 4"
      @click="setShop(i, { cost: [...s.cost, { currency: 0, num: 1 }] })"
    >
      加一种消耗
    </button>
    <RewardItemsEditor
      :model-value="s.award"
      :hats="true"
      :id-prefix="`shop${i}`"
      @update:model-value="setShop(i, { award: $event })"
    />
    <div class="d-flex gap-2 align-items-center">
      每人最多换
      <input
        type="number"
        min="1"
        class="form-control form-control-sm"
        style="width: 5rem"
        :value="s.limit"
        :data-testid="`shop-limit-${i}`"
        @input="setShop(i, { limit: num($event) })"
      />
      次
      <button
        type="button"
        class="btn btn-sm btn-link text-danger"
        :disabled="modelValue.shop.length <= 1"
        :data-testid="`shop-del-${i}`"
        @click="removeShop(i)"
      >
        删除这项
      </button>
    </div>
    <div v-for="(m, k) in errors" :key="k">
      <span v-if="String(k).startsWith(`def.shop.${i}.`)" class="text-danger small">{{ m }}</span>
    </div>
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary my-2"
    :disabled="modelValue.shop.length >= 30"
    data-testid="shop-add"
    @click="addShop"
  >
    加一项兑换
  </button>

  <div class="d-flex gap-2 align-items-center">
    兑换期（结束后还能兑换几小时）
    <input
      type="number"
      min="0"
      max="168"
      class="form-control form-control-sm"
      style="width: 5rem"
      :value="modelValue.graceHours"
      data-testid="ex-grace"
      @input="patch({ graceHours: num($event) })"
    />
    <span v-if="err('def.graceHours')" class="text-danger small" data-testid="err-def.graceHours">{{
      err('def.graceHours')
    }}</span>
  </div>
</template>
