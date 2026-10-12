<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { PlayerBriefDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { adminDate } from '../../utils/gameInput';
import { banText } from '../../utils/adminLabels';

/**
 * 玩家（界面改版 P12）：搜索条一行；结果一行一人：账号 id、用户名（协管、管理员带紫标签）、
 * 邮箱（没验证带琥珀标签）、店、注册日期、状态（封号写到哪天），整行点进详情
 */
const toast = useToastStore();
const router = useRouter();
const q = ref('');
const rows = ref<PlayerBriefDto[] | null>(null);
const busy = ref(false);
const ROLE: Record<string, string> = { mod: '协管', admin: '管理员' };

async function search() {
  if (!q.value.trim()) return;
  busy.value = true;
  try {
    rows.value = await adminApi.searchPlayers(q.value.trim());
  } catch (e) {
    toast.push(errorMessage(e, '搜索失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
const open = (id: number) => void router.push(`/admin/players/${id}`);
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead title="玩家" desc="按用户名、邮箱、店名或账号 id 找人" />
    <form class="dt-adm-fbar" @submit.prevent="search">
      <input
        v-model="q"
        class="dt-adm-in dt-adm-w-lg"
        type="search"
        placeholder="用户名 / 邮箱 / 店名 / 账号 id"
        data-testid="player-q"
      />
      <button class="dt-adm-btn is-p" :disabled="busy">搜索</button>
      <span v-if="rows" class="dt-adm-fbar-r">找到 {{ rows.length }} 个</span>
    </form>
    <AdmBox flush>
      <AdmEmpty v-if="rows === null" title="还没有搜索" text="输入用户名、邮箱、店名或账号 id, 按搜索" />
      <AdmEmpty v-else-if="rows.length === 0" title="没有找到" text="换个词搜搜看; 店名可以只写一部分" />
      <table v-else class="dt-adm-table is-stack">
        <thead>
          <tr>
            <th>#</th>
            <th>用户名</th>
            <th>邮箱</th>
            <th>店（区服 · 等级）</th>
            <th>注册</th>
            <th>状态</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.accountId" class="is-link" @click="open(r.accountId)">
            <td class="dt-adm-mono dt-adm-mu is-hide-m">{{ r.accountId }}</td>
            <td class="is-main">
              <RouterLink :to="`/admin/players/${r.accountId}`" @click.stop>{{ r.username }}</RouterLink>
              <span class="dt-adm-mono dt-adm-mu dt-adm-only-m"> #{{ r.accountId }}</span>
              <span v-if="ROLE[r.role]" class="dt-adm-tag is-p ms-1">{{ ROLE[r.role] }}</span>
              <span v-if="r.banned" class="dt-adm-tag is-d ms-1 dt-adm-only-m">{{
                banText(r.bannedUntil)
              }}</span>
            </td>
            <td class="dt-adm-mu is-hide-m">
              {{ r.email }} <span v-if="!r.emailVerified" class="dt-adm-tag is-w">没验证</span>
            </td>
            <td>
              <div v-for="s in r.restaurants" :key="s.id">
                {{ s.name }} <span class="dt-adm-mono dt-adm-mu">#{{ s.id }}</span> · {{ s.shardName }} ·
                {{ s.level }} 级{{ s.state === 2 ? ' · 停业' : '' }}
              </div>
              <span v-if="r.restaurants.length === 0" class="dt-adm-mu">还没开店</span>
            </td>
            <td class="dt-adm-mu nowrap is-hide-m">{{ adminDate(r.createdAt) }}</td>
            <td class="is-hide-m">
              <span v-if="r.banned" class="dt-adm-tag is-d">{{ banText(r.bannedUntil) }}</span>
              <span v-else class="dt-adm-tag is-ok">正常</span>
            </td>
            <td class="acts is-hide-m">
              <RouterLink :to="`/admin/players/${r.accountId}`" class="dt-adm-btn is-t is-sm" @click.stop
                >详情 ›</RouterLink
              >
            </td>
          </tr>
        </tbody>
      </table>
    </AdmBox>
  </div>
</template>
