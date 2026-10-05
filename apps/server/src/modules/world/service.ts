import type { Kysely } from 'kysely';
import type { I18nEntry, I18nTable, Weather } from '@dt/config';
import {
  CATALOG_DATA_KINDS,
  gameParts,
  seededRng,
  type CatalogDataEntry,
  type CatalogDataKind,
  type CatalogDto,
  type Locale,
  type Slot,
  type WorldDto,
} from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { DB } from '../../db/schema';
import { postNews } from '../news/news';
import { rollKrabStreet, rollWeather } from './rules';
import { gameSeed } from '../../core/seed';

export interface WorldSnapshot {
  weather: Weather;
  weatherUntil: Date;
  krabStreet: number;
  planktonRestId: number | null;
}

const WEATHER_MS = 2 * 3600_000;

export function createWorldService(d: GameDeps) {
  let catalog: CatalogDto | null = null;
  const localized = new Map<Locale, CatalogDto>();

  function weatherOf(id: number): Weather {
    const w = d.config.weather.get(id);
    if (!w) throw new Error(`unknown weather ${id}`);
    return w;
  }

  async function read(db: Kysely<DB>, shardId: number) {
    return db.selectFrom('world_state').selectAll().where('shard_id', '=', shardId).executeTakeFirst();
  }

  /** 取区服小镇状态；新区服第一次访问时创建。玩家事务里调用时传 o.tx，不能另向连接池要连接 */
  async function ensure(shardId: number, now: Date = d.now(), db: Kysely<DB> = d.db): Promise<WorldSnapshot> {
    let row = await read(db, shardId);
    if (!row) {
      const { tuning } = await d.shards.settings(shardId);
      const rng = seededRng(gameSeed(shardId, 'world-init'));
      const w = rollWeather(d.config, gameParts(now).hour, tuning.world, rng);
      await db
        .insertInto('world_state')
        .values({
          shard_id: shardId,
          weather_id: w.id,
          weather_until: new Date(now.getTime() + WEATHER_MS),
          krab_street: rollKrabStreet(tuning.world, rng),
          updated_at: now,
        })
        .onConflict((oc) => oc.column('shard_id').doNothing())
        .execute();
      row = (await read(db, shardId))!;
    }
    return {
      weather: weatherOf(row.weather_id),
      weatherUntil: row.weather_until,
      krabStreet: row.krab_street,
      planktonRestId: row.plankton_rest_id,
    };
  }

  return {
    ensure,

    async changeWeather(shardId: number, slot: Slot, now: Date): Promise<{ from: number; to: number }> {
      const before = await ensure(shardId, now);
      const { tuning } = await d.shards.settings(shardId);
      const w = rollWeather(
        d.config,
        slot.hour,
        tuning.world,
        seededRng(gameSeed(shardId, 'weather', slot.key)),
      );
      await d.db
        .updateTable('world_state')
        .set({
          weather_id: w.id,
          weather_until: new Date(slot.start.getTime() + WEATHER_MS),
          weather_changed_at: now,
          updated_at: now,
        })
        .where('shard_id', '=', shardId)
        .execute();
      await postNews(
        d.db,
        { shardId, type: 'weather.change', params: { from: before.weather.id, to: w.id } },
        now,
      );
      return { from: before.weather.id, to: w.id };
    },

    async changeKrabStreet(shardId: number, slot: Slot, now: Date): Promise<{ street: number }> {
      await ensure(shardId, now);
      const { tuning } = await d.shards.settings(shardId);
      const street = rollKrabStreet(tuning.world, seededRng(gameSeed(shardId, 'krab', slot.key)));
      await d.db
        .updateTable('world_state')
        .set({ krab_street: street, updated_at: now })
        .where('shard_id', '=', shardId)
        .execute();
      return { street };
    },

    /** 设置痞老板驻留店；onlyIf 给定时只有当前驻留店等于它才修改（赶走时用）。返回是否修改了 */
    async setPlankton(
      db: Kysely<DB>,
      shardId: number,
      restId: number | null,
      onlyIf?: number,
    ): Promise<boolean> {
      let q = db.updateTable('world_state').set({ plankton_rest_id: restId }).where('shard_id', '=', shardId);
      if (onlyIf !== undefined) q = q.where('plankton_rest_id', '=', onlyIf);
      const r = await q.executeTakeFirst();
      return Number(r.numUpdatedRows) > 0;
    },

    async view(shardId: number): Promise<WorldDto> {
      const now = d.now();
      const s = await ensure(shardId, now);
      return {
        weather: {
          id: s.weather.id,
          name: s.weather.name,
          type: s.weather.type,
          effects: s.weather.effects,
          note: s.weather.note,
          until: s.weatherUntil.toISOString(),
        },
        krabStreet: s.krabStreet,
        krabStreetName: d.config.streets.get(s.krabStreet)?.name ?? '',
        holidayMultiplier: d.config.holidayMultiplier(now),
        planktonRestId: s.planktonRestId,
      };
    },

    /** 道具目录：按语言缓存（问题记录 272）；没翻译的回退到简中 */
    catalog(lang: Locale = 'zh-CN'): CatalogDto {
      const base = baseCatalog();
      if (lang === 'zh-CN') return base;
      let c = localized.get(lang);
      if (!c) localized.set(lang, (c = localizeCatalog(base, d.config.bundle.i18n[lang], lang)));
      return c;
    },
  };

  function baseCatalog(): CatalogDto {
    catalog ??= {
      version: d.config.version,
      goods: d.config.bundle.goods.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        deviceType: g.deviceType,
        level: g.level,
        desc: g.desc,
        coin: g.coin,
        diamond: g.diamond,
        stackable: g.stackable,
        ...(g.equip
          ? {
              equip: {
                part: g.equip.part,
                minLevel: g.equip.minLevel,
                suitId: g.equip.suitId,
                essence: g.equip.essence,
                maxHole: g.equip.maxHole,
              },
            }
          : {}),
        ...(g.gem ? { gem: { level: g.gem.level, nextId: g.gem.nextId } } : {}),
      })),
      foods: d.config.bundle.foods.map((f) => ({
        id: f.id,
        name: f.name,
        level: f.level,
        odds: f.odds,
        coin: f.coin,
        type: f.type,
      })),
      streets: d.config.bundle.streets.map((s) => ({
        id: s.id,
        name: s.name,
        cookName: s.cookName,
        desc: s.desc,
        theme: s.theme,
        focus: s.focus,
      })),
      weather: d.config.bundle.weather.map((w) => ({ id: w.id, name: w.name, note: w.note })),
      devices: d.config.bundle.devices.map((x) => ({
        id: x.id,
        name: x.name,
        deviceType: x.deviceType,
        needStar: x.needStar,
      })),
      looks: d.config.bundle.looks,
      suits: d.config.bundle.suits.map((s) => ({
        id: s.id,
        name: s.name,
        maxNum: s.maxNum,
        tiers: s.tiers.map((x) => ({ need: x.need, desc: x.desc })),
      })),
      mysterious: d.config.bundle.mysteriousCookbooks.map((m) => ({
        id: m.id,
        name: m.name,
        level: m.level,
        road: m.road,
        nutritive: m.nutritive,
        coin: m.coin,
        foods: m.foods,
      })),
      seeds: d.config.bundle.seeds.map((s) => ({ id: s.id, foodsId: s.foodsId, level: s.level })),
      data: {
        // 问题记录 318：主线、支线、每周任务的名字；章名、支线名
        tasks: [...d.config.bundle.quests, ...d.config.bundle.weeklyGroups.flatMap((g) => g.quests)].map(
          (x) => ({
            id: x.id,
            name: x.name,
          }),
        ),
        chapters: d.config.bundle.chapters.map((x) => ({ id: x.id, name: x.name })),
        questLines: d.config.bundle.questLines.map((x) => ({ id: x.id, name: x.name })),
        activation: d.config.bundle.activationTasks.map((x) => ({ id: x.id, name: x.name })),
        bless: d.config.bundle.bless.map((x) => ({ id: x.id, name: x.name })),
        tower: [...d.config.towerFloors.values()].map((f) => ({
          id: f.floor,
          name: f.name,
          title: f.title,
          note: f.note,
        })),
        formulas: [...d.config.formulas.values()].map((x) => ({ id: x.id, name: x.name })),
        kujiThemes: d.config.bundle.kujiThemes.map((x) => ({ id: x.month, name: x.name, desc: x.desc })),
        proficiency: d.config.mcProficiency.map((x) => ({ id: x.curlevel, name: x.name })),
        cookbooks: d.config.bundle.cookbooks.map((x) => ({ id: x.id, name: x.name })),
      },
    };
    return catalog;
  }
}

/** 按翻译表替换名字和说明（问题记录 272）：只换有翻译的字段，不改原对象；版本带语言后缀，前端缓存分开 */
export function localizeCatalog(base: CatalogDto, t: I18nTable | undefined, lang: Locale): CatalogDto {
  if (lang === 'zh-CN' || !t)
    return lang === 'zh-CN' ? base : { ...base, version: `${base.version}:${lang}` };
  /** 只换这一类目录里有的字段（街道的说明不在目录里，不带出去） */
  const pick = <T extends { id: number | string }>(
    list: T[],
    table: Record<string, I18nEntry>,
    fields: readonly (keyof I18nEntry & keyof T)[],
    key: (x: T) => string = (x) => String(x.id),
  ): T[] =>
    list.map((x) => {
      const e = table[key(x)];
      if (!e) return x;
      const out = { ...x };
      for (const f of fields) if (e[f] !== undefined) (out as Record<string, unknown>)[f] = e[f];
      return out;
    });
  const suits = base.suits?.map((s) => {
    const e = t.suits[String(s.id)];
    return e
      ? {
          ...s,
          ...(e.name ? { name: e.name } : {}),
          tiers: s.tiers.map((x, i) => ({ ...x, desc: e.tiers?.[i] ?? x.desc })),
        }
      : s;
  });
  const looks = base.looks && {
    doors: pick(base.looks.doors, t.doors, ['name']),
    avatars: pick(base.looks.avatars, t.avatars, ['name']),
    icons: base.looks.icons.map((x) => {
      const e = t.icons[x.key];
      return e ? { ...x, ...(e.title ? { title: e.title } : {}), ...(e.desc ? { desc: e.desc } : {}) } : x;
    }),
  };
  return {
    ...base,
    version: `${base.version}:${lang}`,
    goods: pick(base.goods, t.goods, ['name', 'desc']),
    foods: pick(base.foods, t.foods, ['name']),
    weather: pick(base.weather, t.weather, ['name', 'note']),
    streets: pick(base.streets, t.streets, ['name', 'cookName', 'desc', 'theme']),
    devices: pick(base.devices, t.devices, ['name']),
    ...(suits ? { suits } : {}),
    ...(looks ? { looks } : {}),
    ...(base.mysterious ? { mysterious: pick(base.mysterious, t.mysterious, ['name']) } : {}),
    ...(base.data
      ? {
          data: Object.fromEntries(
            CATALOG_DATA_KINDS.map((k) => [k, pick(base.data![k], t[k], ['name', 'title', 'note', 'desc'])]),
          ) as Record<CatalogDataKind, CatalogDataEntry[]>,
        }
      : {}),
  };
}

export type WorldService = ReturnType<typeof createWorldService>;
