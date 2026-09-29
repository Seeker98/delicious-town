import type {
  ForgotPasswordInput,
  LoginInput,
  MeDto,
  RegisterInput,
  ResetPasswordInput,
  RestaurantDto,
  SelectShardResult,
  ShardDto,
} from '@dt/shared';
import { api } from './client';

type Empty = Record<string, never>;

export const endpoints = {
  me: () => api.get<MeDto>('/api/v1/account/me'),
  register: (body: RegisterInput) => api.post<MeDto>('/api/v1/account/register', body),
  login: (body: LoginInput) => api.post<MeDto>('/api/v1/account/login', body),
  logout: () => api.post<Empty>('/api/v1/account/logout'),
  sendVerifyEmail: () => api.post<Empty>('/api/v1/account/send-verify-email'),
  verifyEmail: (token: string) => api.post<Empty>('/api/v1/account/verify-email', { token }),
  forgotPassword: (body: ForgotPasswordInput) => api.post<Empty>('/api/v1/account/forgot-password', body),
  resetPassword: (body: ResetPasswordInput) => api.post<Empty>('/api/v1/account/reset-password', body),
  listShards: () => api.get<ShardDto[]>('/api/v1/shard/list'),
  selectShard: (shardId: number) => api.post<SelectShardResult>('/api/v1/shard/select', { shardId }),
  createRestaurant: (name: string) => api.post<RestaurantDto>('/api/v1/restaurant/create', { name }),
  overview: () => api.get<RestaurantDto>('/api/v1/restaurant/overview'),
};
