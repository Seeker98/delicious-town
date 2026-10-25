import { z } from 'zod';

/** 可疑数据（子项目 6B-2，设计 §5）：只读，供协管参考 */
export interface SuspectRest {
  restId: number;
  restName: string;
  accountId: number;
  username: string;
}
export interface SuspiciousBarRow extends SuspectRest {
  perfectSum: number;
  perfectMax: number;
  bullSum: number;
  bullMax: number;
  /** 任一单日最高超过门槛 */
  flagged: boolean;
}
export interface SuspiciousSurgeRow extends SuspectRest {
  /** 当天净增 */
  net: number;
  /** 按来源汇总、绝对值最大的 3 个 */
  topSources: Array<{ source: string; delta: number }>;
}
export interface SuspiciousSurgeDto {
  day: string;
  coin: SuspiciousSurgeRow[];
  diamond: SuspiciousSurgeRow[];
  exp: SuspiciousSurgeRow[];
}
export interface SuspiciousMultiGroup {
  kind: 'ip' | 'device';
  key: string;
  /** 这一组一共几个账号；accounts 最多列 50 个（backlog 6B-2） */
  total: number;
  accounts: Array<{
    accountId: number;
    username: string;
    /** 在本区服的店；没有为 null */
    restId: number | null;
    restName: string | null;
    lastSeen: string;
  }>;
}
/** 接口调用（2026-10-24）：开放接口谁在调、哪些游戏请求没带设备号 */
export interface SuspiciousApiDto {
  /** 开放接口：最近 7 个游戏日按 IP + 浏览器标识 + 来源网页合计，没带 lang 的多的在前，最多 100 行 */
  open: Array<{
    ip: string;
    userAgent: string;
    /** 来源网页的源；空串是没有（脚本、直接打开） */
    origin: string;
    n: number;
    /** 其中没带 ?lang= 的次数（本站资料库一定带） */
    noLang: number;
    days: number;
    firstSeen: string;
    lastSeen: string;
    /** 最近 30 天用这个 IP 玩过游戏的账号，最多 5 个 */
    accounts: Array<{ accountId: number; username: string }>;
  }>;
  /** 没带设备号的游戏请求（网页客户端一定带）：最近 30 天，至少一个账号在本区服有店，最多 100 行 */
  bare: Array<{
    accountId: number;
    username: string;
    restId: number | null;
    restName: string | null;
    ip: string;
    userAgent: string | null;
    firstSeen: string;
    lastSeen: string;
  }>;
}
export interface SuspiciousRedeemRow {
  accountId: number;
  username: string;
  fails: number;
  /** 还要锁多少秒 */
  ttlSec: number;
}
/** 收购时被拦下的关联账号（收购 PR 3） */
export interface SuspiciousAcquireRow {
  at: string;
  reason: 'device' | 'ip';
  buyer: { restId: number; name: string; accountId: number };
  target: { restId: number; name: string; accountId: number };
  /** 关联上的账号（可能是目标店的老板）；旧记录为 null */
  linked: { accountId: number; username: string } | null;
}
export const suspiciousQuery = z.object({
  shardId: z.coerce.number().int().positive(),
  // 不存在的日期（如 2026-02-30）在这里拦下报 400，不再进到查询里报 500（backlog 6B-2）
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
      const d = new Date(`${s}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, 'invalid_date')
    .optional(),
});

/** 道具整理只读页（问题记录 429）：和本地道具整理工具同一份分析（apps/server/src/items/analyze.ts） */
export interface AdminItemTag {
  where: string;
  n: number;
  /** 这处本身是已下架的道具 */
  retired?: true;
  /** 这处是礼包或道具，但它自己哪里都拿不到 */
  dead?: true;
}
export interface AdminItemRow {
  kind: 'goods' | 'foods';
  id: number;
  name: string;
  category: string;
  level: number;
  desc: string;
  gives: AdminItemTag[];
  uses: AdminItemTag[];
  /** 代码里直接用到 */
  code: boolean;
  noSource: boolean;
  noUse: boolean;
  notes: string[];
  retired: boolean;
}
export interface AdminItemGradeRow {
  grade: number;
  name: string;
  open: boolean;
  foodLevels: Record<number, number>;
}
export interface AdminItemsDto {
  maxGrade: number;
  grades: AdminItemGradeRow[];
  rows: AdminItemRow[];
}

/** IP、设备封禁（2026-10-16 小号刷一番赏）：命中的请求一律拒绝，注册、登录、已登录的都挡 */
export const accessBanKind = z.enum(['ip', 'device']);
export type AccessBanKind = z.infer<typeof accessBanKind>;
export const accessBanBody = z.object({
  kind: accessBanKind,
  /** IP、IP 段（CIDR，如 38.28.0.0/16）或设备号 */
  value: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(1).max(200),
  /** 一并永久封掉最近 30 天用这个 IP（段）或设备登录过的账号（管理员、协管不封） */
  banAccounts: z.boolean().default(false),
});
export type AccessBanBody = z.infer<typeof accessBanBody>;
export interface AccessBanDto {
  id: number;
  kind: AccessBanKind;
  value: string;
  reason: string;
  actor: string | null;
  createdAt: string;
  /** 最近 30 天用它登录过的账号数 */
  accounts: number;
}
export interface AccessBanResultDto {
  ban: AccessBanDto;
  /** 一并封掉的账号 */
  bannedAccounts: number[];
}

/**
 * 客户端分类（安全审计 D1 2026-10-25）：bare 裸接口（写请求八成以上没签名、没带版本号）；
 * automation 浏览器被自动化工具控制；idle 网页签了名，但写操作时多半很久没有真人点击；normal 看不出问题
 */
export type RhythmClient = 'bare' | 'automation' | 'idle' | 'normal';

/** 操作节奏（防脚本 2026-10-25）：最近 7 天按账号汇总，像机器的排前面 */
export interface RhythmRow {
  accountId: number;
  username: string;
  restId: number | null;
  restName: string | null;
  whitelisted: boolean;
  /** 0~100，规则见后台页面 */
  score: number;
  /** 有写操作的天数（北京时间） */
  days: number;
  /** 有写操作的小时数 ÷ 天数 */
  activeHoursPerDay: number;
  /** 连续都有写操作的最长小时数 */
  longestStreakHours: number;
  /** 北京时间 2~7 点的写操作数 */
  nightPosts: number;
  posts: number;
  /** 间隔不到 10 秒的写操作（一阵猛点） */
  bursts: number;
  /** 10 秒~1 小时的间隔：标准差 ÷ 平均值；样本不到 30 个为空 */
  gapCv: number | null;
  /** 写操作前 5 分钟没看页面的比例 */
  noViewShare: number;
  /** 写操作时很久没有真人操作的比例 */
  idleShare: number;
  /**
   * 签名校验各结论的次数；另有不算写操作的几项：get_no_build（读请求没带版本号）、
   * captcha_missing / captcha_failed / captcha_ok（人机验证没带令牌、没通过、通过）
   */
  verdicts: Record<string, number>;
  /** 一小时内最多出现过几种浏览器标识、几个设备号 */
  uas: number;
  devices: number;
  /** 一小时内最多出现过几个 IP */
  ips: number;
  /** 最近登录用的设备号、IP（去封禁时预填） */
  lastDevice: string | null;
  lastIp: string | null;
  /** 后台要求人机验证到什么时候（PR②）；没有为空 */
  challengeUntil: string | null;
  /** 客户端分类（安全审计 D1） */
  client: RhythmClient;
  /** 写请求里没签名（missing、no_build）的比例 */
  unsignedShare: number;
}

export interface RhythmDto {
  rows: RhythmRow[];
  whitelist: Array<{ accountId: number; username: string; note: string; at: string }>;
  /** 还没到期的人机验证名单（PR②），按到期时间升序 */
  challenges: Array<{ accountId: number; username: string; note: string; until: string }>;
}

export const whitelistBody = z.object({
  accountId: z.number().int().positive(),
  note: z.string().max(100).default(''),
});
export const unwhitelistBody = z.object({ accountId: z.number().int().positive() });

/** 对可疑号打开人机验证（防脚本 PR②）：1、3、7 天 */
export const challengeBody = z.object({
  accountId: z.number().int().positive(),
  days: z.union([z.literal(1), z.literal(3), z.literal(7)]),
  note: z.string().max(100).default(''),
});
export const unchallengeBody = z.object({ accountId: z.number().int().positive() });
