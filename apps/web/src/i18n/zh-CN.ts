import type { ErrorCode } from '@dt/shared';
import { ApiError } from '../api/client';

const TEXT: Record<ErrorCode | 'NETWORK', string> = {
  VALIDATION_FAILED: '填写的内容不正确，请检查后再试',
  UNAUTHORIZED: '请先登录',
  FORBIDDEN: '没有权限进行这个操作',
  NOT_FOUND: '要找的内容不存在',
  RATE_LIMITED: '操作太频繁了，歇一会儿再试吧',
  IDEMPOTENCY_IN_PROGRESS: '正在处理上一次的请求，请稍候',
  CAPTCHA_FAILED: '人机验证没有通过，请刷新页面重试',
  USERNAME_TAKEN: '这个用户名已经被注册了',
  EMAIL_TAKEN: '这个邮箱已经被注册了',
  INVALID_CREDENTIALS: '用户名或密码错误',
  ACCOUNT_BANNED: '账号已被封禁，如有疑问请联系管理员',
  EMAIL_NOT_VERIFIED: '请先验证邮箱',
  TOKEN_INVALID: '链接无效或已过期，请重新获取',
  EMAIL_COOLDOWN: '邮件发送太频繁，请 1 分钟后再试',
  SHARD_NOT_FOUND: '区服不存在',
  SHARD_CLOSED: '这个区服已关闭',
  NO_SHARD_SELECTED: '请先选择区服',
  RESTAURANT_EXISTS: '你在这个区服已经有一家餐厅了',
  RESTAURANT_NOT_FOUND: '你在这个区服还没有餐厅',
  RESTAURANT_NAME_INVALID: '餐厅名称不合适',
  RESTAURANT_NAME_TAKEN: '这个名字已经被别的餐厅用了',
  FEATURE_DISABLED: '这个区服暂未开放该功能',
  INTERNAL: '服务器开小差了，请稍后再试',
  NETWORK: '网络连接失败，请稍后再试',
};

const NAME_REASON: Record<string, string> = {
  empty: '请输入餐厅名称',
  bad_chars: '只能使用中文、字母、数字、下划线和减号',
  too_long: '名称太长了，最多 8 个汉字或 12 个字母数字',
  reserved: '名称里不能包含小镇人物或官方字样',
};

export function errorText(code: string, params: Record<string, unknown> = {}): string {
  if (code === 'RESTAURANT_NAME_INVALID' && typeof params.reason === 'string' && NAME_REASON[params.reason]) {
    return NAME_REASON[params.reason]!;
  }
  return (TEXT as Record<string, string>)[code] ?? `出错了（${code}）`;
}

/** 把任意异常转成给玩家看的文案 */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? errorText(e.code, e.params) : fallback;
}
