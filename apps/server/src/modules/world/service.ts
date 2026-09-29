import type { Kysely } from 'kysely';
import type { Weather } from '@dt/config';
import { gameParts, hashSeed, seededRng, type CatalogDto, type Slot, type WorldDto } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { DB } from '../../db/schema';
import { postNews } from '../news/news';
import { rollKrabStreet, rollWeather } from './rules';

export interface WorldSnapshot {
  weather: Weather;
  weatherUntil: Date;
  krabStreet: number;
  planktonRestId: number | null;
}

const WEATHER_MS = 2 * 3600_000;

export function createWorldService(d: GameDeps) {
  let catalog: CatalogDto | null = null;

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
      const rng = seededRng(hashSeed(shardId, 'world-init'));
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
        seededRng(hashSeed(shardId, 'weather', slot.key)),
      );
      await d.db
        .updateTable('world_state')
        .set({
          weather_id: w.id,
          weather_until: new Date(slot.start.getTime() + WEATHER_MS),
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
      const street = rollKrabStreet(tuning.world, seededRng(hashSeed(shardId, 'krab', slot.key)));
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

    catalog(): CatalogDto {
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
        })),
        foods: d.config.bundle.foods.map((f) => ({
          id: f.id,
          name: f.name,
          level: f.level,
          odds: f.odds,
          coin: f.coin,
          type: f.type,
        })),
        streets: d.config.bundle.streets.map((s) => ({ id: s.id, name: s.name, cookName: s.cookName })),
        weather: d.config.bundle.weather.map((w) => ({ id: w.id, name: w.name })),
        devices: d.config.bundle.devices.map((x) => ({
          id: x.id,
          name: x.name,
          deviceType: x.deviceType,
          needStar: x.needStar,
        })),
      };
      return catalog;
    },
  };
}

export type WorldService = ReturnType<typeof createWorldService>;
