import type { Migration } from 'kysely';
import * as m0001 from './0001_init';
import * as m0002 from './0002_business_loop';
import * as m0003 from './0003_admin_console';
import * as m0004 from './0004_friends';
import * as m0005 from './0005_playtest';
import * as m0006 from './0006_equip';
import * as m0007 from './0007_equip_preset_idx';
import * as m0008 from './0008_mysterious';
import * as m0009 from './0009_temple';
import * as m0010 from './0010_yard';
import * as m0011 from './0011_bar';
import * as m0012 from './0012_tower';
import * as m0013 from './0013_takeaway';
import * as m0014 from './0014_town';
import * as m0015 from './0015_bar_round';
import * as m0016 from './0016_hiphop';
import * as m0017 from './0017_forum';
import * as m0018 from './0018_ops_mail';
import * as m0019 from './0019_reports';
import * as m0020 from './0020_login_trace';
import * as m0021 from './0021_activity';
import * as m0022 from './0022_activity_boost';
import * as m0023 from './0023_activity_exchange';
import * as m0024 from './0024_activity_coop';
import * as m0025 from './0025_exchange';
import * as m0026 from './0026_exchange_trade_last';
import * as m0027 from './0027_exchange_guard';
import * as m0028 from './0028_exchange_maker';
import * as m0029 from './0029_predict';
import * as m0030 from './0030_predict_void_ratio';
import * as m0031 from './0031_predict_auto';
import * as m0032 from './0032_kuji';
import * as m0033 from './0033_kuji_prizes';
import * as m0034 from './0034_kuji_theme';
import * as m0035 from './0035_server_secret';
import * as m0036 from './0036_account_lang';
import * as m0037 from './0037_i18n_server_text';
import * as m0038 from './0038_activity_settle_fail';
import * as m0039 from './0039_old_street_revision';
import * as m0040 from './0040_move_176';
import * as m0041 from './0041_quests';
import * as m0042 from './0042_backlog_trade';

/** 迁移列表写在代码里（而不是按文件扫描），打包后也能用 */
export const migrations: Record<string, Migration> = {
  '0001_init': m0001,
  '0002_business_loop': m0002,
  '0003_admin_console': m0003,
  '0004_friends': m0004,
  '0005_playtest': m0005,
  '0006_equip': m0006,
  '0007_equip_preset_idx': m0007,
  '0008_mysterious': m0008,
  '0009_temple': m0009,
  '0010_yard': m0010,
  '0011_bar': m0011,
  '0012_tower': m0012,
  '0013_takeaway': m0013,
  '0014_town': m0014,
  '0015_bar_round': m0015,
  '0016_hiphop': m0016,
  '0017_forum': m0017,
  '0018_ops_mail': m0018,
  '0019_reports': m0019,
  '0020_login_trace': m0020,
  '0021_activity': m0021,
  '0022_activity_boost': m0022,
  '0023_activity_exchange': m0023,
  '0024_activity_coop': m0024,
  '0025_exchange': m0025,
  '0026_exchange_trade_last': m0026,
  '0027_exchange_guard': m0027,
  '0028_exchange_maker': m0028,
  '0029_predict': m0029,
  '0030_predict_void_ratio': m0030,
  '0031_predict_auto': m0031,
  '0032_kuji': m0032,
  '0033_kuji_prizes': m0033,
  '0034_kuji_theme': m0034,
  '0035_server_secret': m0035,
  '0036_account_lang': m0036,
  '0037_i18n_server_text': m0037,
  '0038_activity_settle_fail': m0038,
  '0039_old_street_revision': m0039,
  '0040_move_176': m0040,
  '0041_quests': m0041,
  '0042_backlog_trade': m0042,
};
