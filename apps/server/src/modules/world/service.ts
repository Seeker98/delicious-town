import type { Kysely } from 'kysely';
import { GOODS, type I18nEntry, type I18nTable, type Weather } from '@dt/config';
import {
  CATALOG_DATA_KINDS,
  gameParts,
  latestSlot,
  nextSlot,
  seededRng,
  type CatalogDataEntry,
  type CatalogDataKind,
  type CatalogDto,
  type LotsDrawDto,
  type Locale,
  type Slot,
  type WeatherToolResultDto,
  type WeatherToolsDto,
  type WorldDto,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp } from '../../core/op';
import type { DB } from '../../db/schema';
import { postNews } from '../news/news';
import { chainRow, pickRow, typeShares } from './chain';
import { isNight, rollKrabStreet, rollWeather } from './rules';
import { compassUse, lotsDraw, lotsPick, toolsView } from './tools';
import { gameSeed } from '../../core/seed';

export interface WorldSnapshot {
  /** 现在生效的天气：道具盖着时是盖的那个，否则是自然天气 */
  weather: Weather;
  /** 生效的天气到几点 */
  weatherUntil: Date;
  /** 天气链的状态（底下的自然天气）和它到几点（下一次换天） */
  natural: Weather;
  naturalUntil: Date;
  cover: { weather: Weather; until: Date; by: number | null; goodsId: number } | null;
  /** 晴雨签摇出来还没选的两支 */
  lot: { by: number; choices: number[]; until: Date } | null;
  krabStreet: number;
  planktonRestId: number | null;
}

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

  /** 这一刻所在那一轮的结束时间（下一个换天时间） */
  async function slotEnd(shardId: number, now: Date): Promise<Date> {
    const { tuning } = await d.shards.settings(shardId);
    return nextSlot(now, tuning.world.weatherHours).start;
  }

  /**
   * 晴雨签摇了、到时间还没选：按第一支盖上（设计 §2.3），从到时的那一刻起算 1 小时。
   * 谁先读到谁写；条件更新保证只写一次，写成功的那一个发新闻
   */
  async function settleLots(db: Kysely<DB>, shardId: number, now: Date): Promise<void> {
    const row = await read(db, shardId);
    if (!row?.lot_until || row.lot_until > now || !row.lot_choices?.length) return;
    const { tuning } = await d.shards.settings(shardId);
    const to = row.lot_choices[0]!;
    const until = new Date(row.lot_until.getTime() + tuning.world.tool.coverMinutes * 60_000);
    const r = await db
      .updateTable('world_state')
      .set({
        cover_weather_id: to,
        cover_until: until,
        cover_by: row.lot_by,
        cover_goods: GOODS.weatherLots,
        lot_by: null,
        lot_choices: null,
        lot_until: null,
        updated_at: now,
      })
      .where('shard_id', '=', shardId)
      .where('lot_until', '=', row.lot_until)
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) return;
    await postNews(
      db,
      {
        shardId,
        type: 'weather.tool',
        restId: row.lot_by ?? undefined,
        params: { goodsId: GOODS.weatherLots, from: row.weather_id, to, auto: true },
      },
      row.lot_until,
    );
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
          weather_until: await slotEnd(shardId, now),
          krab_street: rollKrabStreet(tuning.world, rng),
          updated_at: now,
        })
        .onConflict((oc) => oc.column('shard_id').doNothing())
        .execute();
      row = (await read(db, shardId))!;
    }
    if (row.lot_until && row.lot_until <= now) {
      await settleLots(db, shardId, now);
      row = (await read(db, shardId))!;
    }
    const natural = weatherOf(row.weather_id);
    // 自然天气到下一个换天时间为止：按区服的换天时间现算，不用库里记的 weather_until
    // （上线、改了换天时间时库里还是旧的，用户反馈：天气页写了不存在的 19 点）
    const naturalUntil = await slotEnd(shardId, now);
    const cover =
      row.cover_weather_id !== null && row.cover_until && row.cover_until > now
        ? {
            weather: weatherOf(row.cover_weather_id),
            until: row.cover_until,
            by: row.cover_by,
            goodsId: row.cover_goods ?? 0,
          }
        : null;
    return {
      weather: cover?.weather ?? natural,
      weatherUntil: cover?.until ?? naturalUntil,
      natural,
      naturalUntil,
      cover,
      lot:
        row.lot_until && row.lot_until > now && row.lot_by !== null && row.lot_choices
          ? { by: row.lot_by, choices: row.lot_choices, until: row.lot_until }
          : null,
      krabStreet: row.krab_street,
      planktonRestId: row.plankton_rest_id,
    };
  }

  /** 预报（设计 §1.6）：从这一刻的自然天气，下一轮各大类的概率 */
  async function forecast(
    shardId: number,
    s: WorldSnapshot,
  ): Promise<{ at: Date; types: Record<string, number> }> {
    const { tuning } = await d.shards.settings(shardId);
    const next = nextSlot(new Date(s.naturalUntil.getTime() - 1), tuning.world.weatherHours);
    const row = chainRow(
      d.config.bundle.weatherChain,
      d.config.weather,
      s.natural.id,
      isNight(next.hour, tuning.world),
    );
    const t = typeShares(row, d.config.weather);
    return { at: s.naturalUntil, types: { 1: t[1], 2: t[2], 3: t[3], 4: t[4] } };
  }

  const op = <T>(ctx: RestCtx, source: string, fn: Parameters<typeof runOp<T>>[3]) =>
    runOp<T>(d, ctx, { feature: 'world', source }, fn);

  return {
    ensure,
    forecast,

    /**
     * 换天（设计 §1.2）：按底下的自然天气走天气链，用这一轮的种子抽，持续到下一个换天时间。
     * 道具盖着时底下照常换，生效的还是盖着的；新闻写自然天气的变化
     */
    async changeWeather(shardId: number, slot: Slot, now: Date): Promise<{ from: number; to: number }> {
      const before = await ensure(shardId, now);
      const { tuning } = await d.shards.settings(shardId);
      const rng = seededRng(gameSeed(shardId, 'weather', slot.key));
      const row = chainRow(
        d.config.bundle.weatherChain,
        d.config.weather,
        before.natural.id,
        isNight(slot.hour, tuning.world),
      );
      // 链的数据缺了（配置坏了）退回原来的独立抽，天气不会卡住
      const to = pickRow(row, rng) ?? rollWeather(d.config, slot.hour, tuning.world, rng).id;
      await d.db
        .updateTable('world_state')
        .set({
          weather_id: to,
          weather_until: nextSlot(slot.start, tuning.world.weatherHours).start,
          weather_changed_at: now,
          updated_at: now,
        })
        .where('shard_id', '=', shardId)
        .execute();
      await postNews(
        d.db,
        {
          shardId,
          type: 'weather.change',
          params: {
            from: before.natural.id,
            to,
            ...(before.cover ? { cover: before.cover.weather.id } : {}),
          },
        },
        now,
      );
      return { from: before.natural.id, to };
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
      const fc = await forecast(shardId, s);
      const { tuning } = await d.shards.settings(shardId);
      const byName = s.cover?.by
        ? ((
            await d.db.selectFrom('restaurant').select('name').where('id', '=', s.cover.by).executeTakeFirst()
          )?.name ?? null)
        : null;
      return {
        weather: {
          id: s.weather.id,
          name: s.weather.name,
          type: s.weather.type,
          effects: s.weather.effects,
          note: s.weather.note,
          until: s.weatherUntil.toISOString(),
        },
        cover: s.cover
          ? {
              goodsId: s.cover.goodsId,
              byRestId: s.cover.by,
              byName,
              until: s.cover.until.toISOString(),
              natural: { id: s.natural.id, name: s.natural.name },
            }
          : null,
        forecast: {
          at: fc.at.toISOString(),
          types: { '1': fc.types[1]!, '2': fc.types[2]!, '3': fc.types[3]!, '4': fc.types[4]! },
          hours: tuning.world.weatherHours,
          current: latestSlot(now, tuning.world.weatherHours).hour,
        },
        krabStreet: s.krabStreet,
        krabStreetName: d.config.streets.get(s.krabStreet)?.name ?? '',
        holidayMultiplier: d.config.holidayMultiplier(now),
        planktonRestId: s.planktonRestId,
      };
    },

    /** 天气页的道具状态（天气改版设计 §2） */
    async tools(ctx: RestCtx): Promise<WeatherToolsDto> {
      const now = d.now();
      const s = await ensure(ctx.shardId, now);
      const { tuning } = await d.shards.settings(ctx.shardId);
      return toolsView(d, ctx.restaurantId, s, tuning, now);
    },

    /** 司天罗盘：选一类 */
    compass(ctx: RestCtx, b: { type: number }) {
      return op<WeatherToolResultDto>(ctx, 'weather.compass', async (o) => {
        const s = await ensure(o.shardId, o.now, o.tx);
        return compassUse(o, s, b.type);
      });
    },

    /** 晴雨签：摇两支 */
    drawLots(ctx: RestCtx) {
      return op<LotsDrawDto>(ctx, 'weather.lots', async (o) => {
        const s = await ensure(o.shardId, o.now, o.tx);
        return lotsDraw(o, s);
      });
    },

    /** 晴雨签：挑一支 */
    pickLot(ctx: RestCtx, b: { index: number }) {
      return op<WeatherToolResultDto>(ctx, 'weather.lots', async (o) => {
        const s = await ensure(o.shardId, o.now, o.tx);
        return lotsPick(o, s, b.index);
      });
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
        ...(g.art ? { art: g.art } : {}),
      })),
      foods: d.config.bundle.foods.map((f) => ({
        id: f.id,
        name: f.name,
        level: f.level,
        odds: f.odds,
        coin: f.coin,
        type: f.type,
        art: f.art,
      })),
      streets: d.config.bundle.streets.map((s) => ({
        id: s.id,
        name: s.name,
        cookName: s.cookName,
        desc: s.desc,
        theme: s.theme,
        focus: s.focus,
      })),
      weather: d.config.bundle.weather.map((w) => ({
        id: w.id,
        name: w.name,
        note: w.note,
        type: w.type,
        special: w.special,
      })),
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
        appraisable: m.appraisable,
      })),
      achievements: d.config.bundle.achievements,
      trophies: d.config.bundle.trophies,
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
        tower: [...d.config.towerFloors.values()].map((f) => ({
          id: f.floor,
          name: f.name,
          title: f.title,
          note: f.note,
        })),
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
      // 只换目录里本来就有的字段：翻译里多出来的（比如繁中菜谱描述，#115）不带进目录
      for (const f of fields) if (e[f] !== undefined && f in x) (out as Record<string, unknown>)[f] = e[f];
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
    ...(base.looks.frames ? { frames: pick(base.looks.frames, t.frames, ['name']) } : {}),
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
    // 成就线、奖杯按展开前的 key 翻（菜系线、菜系奖杯共用一条翻译）
    ...(base.achievements
      ? {
          achievements: base.achievements.map((l) => {
            const e = t.achievements[l.key.split('.')[0]!];
            return e
              ? {
                  ...l,
                  name: e.name ?? l.name,
                  desc: e.desc ?? l.desc,
                  labels: l.labels && (e.tiers ?? l.labels),
                }
              : l;
          }),
        }
      : {}),
    ...(base.trophies
      ? {
          trophies: base.trophies.map((x) => {
            const e = t.trophies[x.key.split('.')[0]!];
            return e?.name ? { ...x, name: e.name } : x;
          }),
        }
      : {}),
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
