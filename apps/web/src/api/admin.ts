import type {
  AccountRole,
  AdminAnnouncementDto,
  AdminCodeDto,
  ReportCaseDto,
  ReportDetailDto,
  ReportStatus,
  SuspiciousBarRow,
  SuspiciousMultiGroup,
  SuspiciousRedeemRow,
  SuspiciousSurgeDto,
  CreateBatchInput,
  CreateSharedCodeInput,
  AdminMailDto,
  AnnouncementInput,
  AdminLedgerPageDto,
  AdminIconDto,
  AdminMeDto,
  AdminRestaurantDto,
  AdminShardDto,
  AuditPageDto,
  CreateGrantInput,
  DistributionDto,
  EconomyRowDto,
  GrantDto,
  IncomePageDto,
  LogPageDto,
  PlayerBriefDto,
  PlayerDetailDto,
  SettlementRoundDto,
  ShardHistoryDto,
  SendMailInput,
  ShardSettingsDto,
} from '@dt/shared';
import { api } from './client';

const A = '/api/v1/admin';
const qs = (q: Record<string, string | number | undefined>) => {
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
};

export const adminApi = {
  me: () => api.get<AdminMeDto>(`${A}/me`),
  shards: () => api.get<AdminShardDto[]>(`${A}/shards`),
  settings: (id: number) => api.get<ShardSettingsDto>(`${A}/shards/${id}/settings`),
  saveOverride: (id: number, b: { override: Record<string, unknown>; note: string; version: number }) =>
    api.post<{ version: number }>(`${A}/shards/${id}/override`, b),
  history: (id: number) => api.get<ShardHistoryDto[]>(`${A}/shards/${id}/history`),
  rollback: (id: number, b: { version: number; note: string }) =>
    api.post<{ version: number }>(`${A}/shards/${id}/rollback`, b),
  searchPlayers: (q: string) => api.get<PlayerBriefDto[]>(`${A}/players${qs({ q })}`),
  player: (id: number) => api.get<PlayerDetailDto>(`${A}/players/${id}`),
  restaurant: (id: number) => api.get<AdminRestaurantDto>(`${A}/restaurants/${id}`),
  ledger: (id: number, q: { kind?: string; source?: string; before?: string }) =>
    api.get<AdminLedgerPageDto>(`${A}/restaurants/${id}/ledger${qs(q)}`),
  restLog: (id: number, before?: string) =>
    api.get<LogPageDto>(`${A}/restaurants/${id}/log${qs({ before })}`),
  income: (id: number, before?: string) =>
    api.get<IncomePageDto>(`${A}/restaurants/${id}/income${qs({ before })}`),
  ban: (id: number, reason: string, days?: number) =>
    api.post<{ banned: boolean }>(`${A}/players/${id}/ban`, {
      reason,
      ...(days === undefined ? {} : { days }),
    }),
  unban: (id: number) => api.post<{ banned: boolean }>(`${A}/players/${id}/unban`, {}),
  rename: (restId: number, name: string, reason: string) =>
    api.post<{ name: string }>(`${A}/restaurants/${restId}/rename`, { name, reason }),
  setRole: (id: number, role: AccountRole) =>
    api.post<{ role: AccountRole }>(`${A}/players/${id}/role`, { role }),
  grantPreview: (shardId: number, minLevel?: number) =>
    api.get<{ count: number }>(`${A}/grants/preview${qs({ shardId, minLevel })}`),
  createGrant: (b: CreateGrantInput) => api.post<GrantDto>(`${A}/grants`, b),
  grants: (shardId?: number) => api.get<GrantDto[]>(`${A}/grants${qs({ shardId })}`),
  mails: (shardId?: number) => api.get<AdminMailDto[]>(`${A}/mails${qs({ shardId })}`),
  sendMail: (b: SendMailInput) => api.post<AdminMailDto>(`${A}/mails`, b),
  revokeMail: (id: number) => api.post<AdminMailDto>(`${A}/mails/${id}/revoke`, {}),
  reports: (q: { shardId?: number; status?: ReportStatus }) =>
    api.get<ReportCaseDto[]>(`${A}/reports${qs(q)}`),
  report: (id: number) => api.get<ReportDetailDto>(`${A}/reports/${id}`),
  resolveReport: (id: number, b: { note: string; banDays?: 0 | 1 | 7; newName?: string }) =>
    api.post<ReportCaseDto>(`${A}/reports/${id}/resolve`, b),
  rejectReport: (id: number, b: { note: string }) => api.post<ReportCaseDto>(`${A}/reports/${id}/reject`, b),
  suspiciousBar: (shardId: number) => api.get<SuspiciousBarRow[]>(`${A}/suspicious/bar${qs({ shardId })}`),
  suspiciousSurge: (shardId: number, day?: string) =>
    api.get<SuspiciousSurgeDto>(`${A}/suspicious/surge${qs({ shardId, day })}`),
  suspiciousMulti: (shardId: number) =>
    api.get<SuspiciousMultiGroup[]>(`${A}/suspicious/multi${qs({ shardId })}`),
  suspiciousRedeem: (shardId: number) =>
    api.get<SuspiciousRedeemRow[]>(`${A}/suspicious/redeem${qs({ shardId })}`),
  codes: (shardId?: number) => api.get<AdminCodeDto[]>(`${A}/codes${qs({ shardId })}`),
  createCode: (b: CreateSharedCodeInput) => api.post<AdminCodeDto>(`${A}/codes`, b),
  createCodeBatch: (b: CreateBatchInput) => api.post<AdminCodeDto>(`${A}/codes/batch`, b),
  disableCode: (id: number) => api.post<null>(`${A}/codes/${id}/disable`, {}),
  exportCodeBatch: (batchId: number) => api.get<{ codes: string[] }>(`${A}/codes/batches/${batchId}/export`),
  announcements: () => api.get<AdminAnnouncementDto[]>(`${A}/announcements`),
  createAnnouncement: (b: AnnouncementInput) => api.post<AdminAnnouncementDto>(`${A}/announcements`, b),
  updateAnnouncement: (id: number, b: AnnouncementInput) =>
    api.post<AdminAnnouncementDto>(`${A}/announcements/${id}`, b),
  deleteAnnouncement: (id: number) => api.post<null>(`${A}/announcements/${id}/delete`, {}),
  economy: (shardId: number, from: string, to: string) =>
    api.get<EconomyRowDto[]>(`${A}/stats/economy${qs({ shardId, from, to })}`),
  distribution: (shardId: number) => api.get<DistributionDto>(`${A}/stats/distribution${qs({ shardId })}`),
  settlementRounds: (shardId: number, rounds = 90) =>
    api.get<SettlementRoundDto[]>(`${A}/stats/settlement${qs({ shardId, rounds })}`),
  audit: (q: { actor?: string; action?: string; before?: string }) =>
    api.get<AuditPageDto>(`${A}/audit${qs(q)}`),
  icons: (restId: number) => api.get<AdminIconDto[]>(`${A}/restaurants/${restId}/icons`),
  grantIcon: (restId: number, key: string) =>
    api.post<AdminIconDto[]>(`${A}/restaurants/${restId}/icons`, { key }),
  revokeIcon: (restId: number, iconId: number) =>
    api.post<AdminIconDto[]>(`${A}/restaurants/${restId}/icons/${iconId}/revoke`),
};
