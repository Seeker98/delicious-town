import { loadGameConfig, type GameConfig } from '@dt/config';

let config: GameConfig | null = null;
export function testConfig(): GameConfig {
  config ??= loadGameConfig(process.env.CONFIG_BUNDLE_PATH!);
  return config;
}
