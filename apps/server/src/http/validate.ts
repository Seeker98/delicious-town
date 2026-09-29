import type { z } from 'zod';

/** 校验请求参数；失败时抛 ZodError，由统一错误处理转成 400 VALIDATION_FAILED */
export function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  return schema.parse(value);
}
