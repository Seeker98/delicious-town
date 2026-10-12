<script setup lang="ts">
import { adminShort, fromGameInput } from '../../utils/gameInput';
import { computed, onMounted, ref, watch } from 'vue';
import type { AdminCodeDto, RewardItems } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import RewardItemsEditor from '../../components/admin/RewardItemsEditor.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { rewardSummary } from '../../utils/reward';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmField from '../../components/admin/kit/AdmField.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import { useConfirmStore } from '../../stores/confirm';

/** 后台兑换码（子项目 6A-2）：通用码、批量一次性码；批次按整批停用、导出 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const confirm = useConfirmStore();

const kind = ref<'shared' | 'single'>('shared');
const code = ref('');
const maxUses = ref<number | ''>('');
const count = ref<number | ''>(10);
const scope = ref<'all' | 'shard'>('all');
const minLevel = ref<number | ''>('');
const startsAt = ref('');
const endsAt = ref('');
const note = ref('');
const rewards = ref<RewardItems>({});
const over = ref<string[]>([]);
const formKey = ref(0);
const busy = ref(false);
const list = ref<AdminCodeDto[]>([]);
const exported = ref<{ batchId: number; text: string } | null>(null);

const search = ref('');
const hasRewards = computed(() => Object.keys(rewards.value).length > 0);
/** 附件带称号时的两条提示（定制称号设计 三） */
const iconSharedHint = computed(() => kind.value === 'shared' && (rewards.value.icons?.length ?? 0) > 0);
const iconUntilHint = computed(() => {
  if (!endsAt.value) return false;
  const end = new Date(fromGameInput(endsAt.value)).getTime();
  return (rewards.value.icons ?? []).some((i) => i.until && new Date(i.until).getTime() < end);
});
/** 选了"当前区服"却没在顶部选区服：以前点了没反应（backlog 兑换码） */
const noShard = computed(() => scope.value === 'shard' && !admin.shardId);
const countOk = computed(
  () => kind.value === 'shared' || (Number(count.value) >= 1 && Number(count.value) <= 1000),
);

async function loadList() {
  try {
    list.value = await adminApi.codes(admin.shardId ?? undefined, search.value.trim() || undefined);
  } catch (e) {
    toast.push(errorMessage(e, '读取兑换码失败'), 'danger');
  }
}
onMounted(() => void loadList());
watch(() => admin.shardId, loadList);

/** datetime-local 的值按北京时间解析，转成 ISO；空就不传（终审：不跟着设备时区） */
const iso = (v: string) => (v ? { value: fromGameInput(v) } : null);

async function create() {
  const shardId = admin.shardId;
  if (busy.value || !hasRewards.value || over.value.length > 0 || !countOk.value || noShard.value) return;
  const s = iso(startsAt.value);
  const e = iso(endsAt.value);
  const common = {
    ...(scope.value === 'shard' ? { shardId: shardId! } : {}),
    ...(minLevel.value ? { minLevel: Number(minLevel.value) } : {}),
    ...(s ? { startsAt: s.value } : {}),
    ...(e ? { endsAt: e.value } : {}),
    note: note.value.trim(),
    items: rewards.value,
  };
  busy.value = true;
  try {
    if (kind.value === 'shared') {
      const c = code.value.trim().toUpperCase();
      const r = await adminApi.createCode({
        ...(c ? { code: c } : {}),
        ...(maxUses.value ? { maxUses: Number(maxUses.value) } : {}),
        ...common,
      });
      toast.push(`已建兑换码 ${r.code ?? ''}`);
    } else {
      const r = await adminApi.createCodeBatch({ count: Number(count.value), ...common });
      toast.push(`已生成 ${r.count} 个一次性码`);
      if (r.batchId !== null) await showExport(r.batchId);
    }
    code.value = '';
    note.value = '';
    rewards.value = {};
    formKey.value++;
    await loadList();
  } catch (err) {
    toast.push(
      taken(err)
        ? `兑换码 ${code.value.trim().toUpperCase()} 已经存在，换一个`
        : errorMessage(err, '建码失败'),
      'danger',
    );
  } finally {
    busy.value = false;
  }
}

/** 自定码重复时服务端报 VALIDATION_FAILED，路径 code、原因 taken */
function taken(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_FAILED') return false;
  const issues = (e.params.issues ?? []) as Array<{ path: string; message: string }>;
  return issues.some((i) => i.path === 'code' && i.message === 'taken');
}

async function showExport(batchId: number) {
  try {
    const r = await adminApi.exportCodeBatch(batchId);
    exported.value = { batchId, text: r.codes.join('\n') };
  } catch (e) {
    toast.push(errorMessage(e, '导出失败'), 'danger');
  }
}

async function copyExport() {
  if (!exported.value) return;
  try {
    await navigator.clipboard.writeText(exported.value.text);
    toast.push('已复制');
  } catch {
    toast.push('复制失败，请手动选中复制', 'danger');
  }
}

function downloadExport() {
  if (!exported.value) return;
  const url = URL.createObjectURL(new Blob([exported.value.text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `codes-batch-${exported.value.batchId}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function disable(c: AdminCodeDto) {
  const what = c.code ? `兑换码 ${c.code}` : `这一批 ${c.count} 个一次性码`;
  const ok = await confirm.ask({
    title: `停用${what}？`,
    body: '停用后不能再兑换, 已兑换的不追回。',
    ok: '停用',
    danger: true,
  });
  if (!ok) return;
  try {
    await adminApi.disableCode(c.id);
    await loadList();
  } catch (e) {
    toast.push(errorMessage(e, '停用失败'), 'danger');
  }
}

async function enable(c: AdminCodeDto) {
  const what = c.code ? `兑换码 ${c.code}` : `这一批 ${c.count} 个一次性码`;
  const ok = await confirm.ask({ title: `重新启用${what}？`, body: '启用后可以继续兑换。', ok: '启用' });
  if (!ok) return;
  try {
    await adminApi.enableCode(c.id);
    await loadList();
  } catch (e) {
    toast.push(errorMessage(e, '启用失败'), 'danger');
  }
}

const fmt = (s: string | null) => (s ? adminShort(s) : '');
const period = (c: AdminCodeDto) =>
  c.startsAt || c.endsAt ? `${fmt(c.startsAt) || '现在'} ~ ${fmt(c.endsAt) || '不限'}` : '不限';
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead title="兑换码" desc="通用码每家店能用一次; 一次性码批量生成, 每个只能用一次" />
    <div v-if="!admin.isAdmin" class="dt-adm-alert is-p">
      <i class="bi bi-eye" aria-hidden="true"></i>
      <div>只有管理员能建码, 你可以查看记录。</div>
    </div>
    <AdmBox v-else title="建码">
      <form @submit.prevent="create">
        <AdmField label="种类">
          <div class="dt-adm-line">
            <select v-model="kind" class="dt-adm-in" data-testid="code-kind">
              <option value="shared">通用码（每家店一次）</option>
              <option value="single">一次性码（批量生成）</option>
            </select>
            <template v-if="kind === 'shared'">
              <input
                v-model="code"
                class="dt-adm-in dt-adm-w-md is-mono"
                maxlength="20"
                placeholder="自定码 (可空, 空就随机)"
                data-testid="code-text"
              />
              <input
                v-model.number="maxUses"
                type="number"
                min="1"
                class="dt-adm-in dt-adm-w-md"
                placeholder="总次数上限 (可空)"
                data-testid="code-max"
              />
            </template>
            <input
              v-else
              v-model.number="count"
              type="number"
              min="1"
              max="1000"
              class="dt-adm-in dt-adm-w-md"
              placeholder="数量 (1~1000)"
              data-testid="code-count"
            />
          </div>
        </AdmField>
        <AdmField label="谁能用">
          <div class="dt-adm-line">
            <select v-model="scope" class="dt-adm-in" data-testid="code-scope">
              <option value="all">全部区服</option>
              <option value="shard">当前区服</option>
            </select>
            <input
              v-model.number="minLevel"
              type="number"
              min="1"
              class="dt-adm-in dt-adm-w-md"
              placeholder="最低等级 (可空)"
              data-testid="code-min-level"
            />
            <span v-if="noShard" class="dt-adm-bad dt-adm-small" data-testid="code-scope-hint"
              >请先在顶部选择区服</span
            >
          </div>
        </AdmField>
        <AdmField label="时间段" hint="北京时间, 可空">
          <div class="dt-adm-line">
            <input
              v-model="startsAt"
              type="datetime-local"
              class="dt-adm-in"
              aria-label="开始"
              data-testid="code-starts"
            />
            <span class="dt-adm-mu">–</span>
            <input
              v-model="endsAt"
              type="datetime-local"
              class="dt-adm-in"
              aria-label="结束"
              data-testid="code-ends"
            />
          </div>
        </AdmField>
        <AdmField label="备注" hint="运营自己看, ≤ 200 字">
          <input v-model="note" class="dt-adm-in dt-adm-full" maxlength="200" data-testid="code-note" />
        </AdmField>
        <AdmField label="附件">
          <RewardItemsEditor
            :key="formKey"
            v-model="rewards"
            :hats="true"
            :icons="true"
            @over="over = $event"
          />
          <template v-if="iconSharedHint || iconUntilHint" #help>
            <div v-if="iconSharedHint" class="dt-adm-warn" data-testid="code-icon-shared-hint">
              共享码可以被转发, 谁拿到都能兑换; 称号只想给特定的人, 请用一次性码。
            </div>
            <div v-if="iconUntilHint" class="dt-adm-warn" data-testid="code-icon-until-hint">
              兑换码截止前称号就过期了, 过期后兑换会跳过称号（别的照发）。
            </div>
          </template>
        </AdmField>
        <AdmField>
          <button
            type="button"
            class="dt-adm-btn is-p"
            :disabled="busy || !hasRewards || over.length > 0 || !countOk || noShard"
            data-testid="code-create"
            @click="create"
          >
            {{ kind === 'shared' ? '建码' : '批量生成' }}
          </button>
        </AdmField>
      </form>
    </AdmBox>

    <AdmBox v-if="exported" :title="`批次 ${exported.batchId} 的全部兑换码`">
      <template #right>
        <button type="button" class="dt-adm-btn is-sp is-sm" @click="copyExport">复制全部</button>
        <button type="button" class="dt-adm-btn is-sp is-sm" @click="downloadExport">下载 .txt</button>
        <button type="button" class="dt-adm-btn is-s is-sm" @click="exported = null">关闭</button>
      </template>
      <textarea
        class="dt-adm-in is-mono dt-adm-full"
        rows="6"
        readonly
        :value="exported.text"
        data-testid="code-export-text"
      ></textarea>
    </AdmBox>

    <form class="dt-adm-fbar" data-testid="code-search-form" @submit.prevent="loadList">
      <input
        v-model="search"
        class="dt-adm-in dt-adm-w-lg"
        type="search"
        maxlength="40"
        placeholder="按码搜索 (一次性码会列出整批)"
        data-testid="code-search"
      />
      <button type="submit" class="dt-adm-btn is-sp">搜索</button>
      <span class="dt-adm-fbar-r">{{ list.length }} 条</span>
    </form>
    <AdmBox flush>
      <div class="dt-adm-scroll">
        <table v-if="list.length > 0" class="dt-adm-table">
          <thead>
            <tr>
              <th>码</th>
              <th>范围</th>
              <th>附件</th>
              <th class="num">已用</th>
              <th>时间段</th>
              <th>备注</th>
              <th>操作人</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in list" :key="c.id" :class="{ 'is-off': c.disabled }">
              <td class="dt-adm-mono nowrap">{{ c.code ?? `一次性码 ×${c.count}` }}</td>
              <td class="nowrap">
                {{ c.shardId ? `区服 ${c.shardId}` : '全部区服'
                }}{{ c.minLevel ? ` (≥ ${c.minLevel} 级)` : '' }}
              </td>
              <td>{{ rewardSummary(c.items, catalog) }}</td>
              <td class="num nowrap">
                {{ c.usedCount }} / {{ c.code === null ? c.count : (c.maxUses ?? '不限') }}
              </td>
              <td class="dt-adm-mu">{{ period(c) }}</td>
              <td class="dt-adm-mu">{{ c.note }}</td>
              <td class="dt-adm-mu">{{ c.actor ?? '系统' }}</td>
              <td class="acts">
                <span v-if="c.disabled" class="dt-adm-tag">已停用</span>
                <template v-if="admin.isAdmin">
                  <button
                    v-if="c.code === null && c.batchId !== null"
                    type="button"
                    class="dt-adm-btn is-t is-sm"
                    :data-testid="`code-export-${c.id}`"
                    @click="showExport(c.batchId)"
                  >
                    导出
                  </button>
                  <button
                    v-if="c.disabled"
                    type="button"
                    class="dt-adm-btn is-s is-sm"
                    :data-testid="`code-enable-${c.id}`"
                    @click="enable(c)"
                  >
                    启用
                  </button>
                  <button
                    v-else
                    type="button"
                    class="dt-adm-btn is-d is-sm"
                    :data-testid="`code-disable-${c.id}`"
                    @click="disable(c)"
                  >
                    停用
                  </button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <AdmEmpty v-else title="没有兑换码" text="建一个, 或者换个词搜" />
      </div>
    </AdmBox>
  </div>
</template>
