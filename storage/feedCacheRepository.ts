import { localDatabase } from './localDatabase';

export const MAX_CACHED_LAUNCH_FEED_ITEMS = 10;

export interface FeedCacheContext {
  accountKey: string;
  feedType: string;
}

export interface CachedFeedResult<T = unknown> {
  items: T[];
  nextUrl: string | null;
}

interface FeedCacheRow {
  items_json: string;
  next_url: string | null;
  updated_at: number;
}

class FeedCacheRepository {
  async getFeedCache<T = unknown>(
    context: FeedCacheContext,
  ): Promise<CachedFeedResult<T> | null> {
    if (!context.accountKey.trim() || !context.feedType.trim()) return null;

    return localDatabase.run(async (database) => {
      const row = await database.getFirstAsync<FeedCacheRow>(
        `SELECT items_json, next_url, updated_at
         FROM feed_cache
         WHERE account_key = ? AND feed_type = ?`,
        [context.accountKey, context.feedType],
      );

      if (!row) return null;

      try {
        const items = JSON.parse(row.items_json);
        if (!Array.isArray(items) || items.length === 0) return null;
        return {
          items: items.slice(0, MAX_CACHED_LAUNCH_FEED_ITEMS),
          nextUrl: row.next_url ?? null,
        };
      } catch (e) {
        console.warn('解析本地 Feed 缓存失败', e);
        return null;
      }
    });
  }

  async saveFeedCache(
    context: FeedCacheContext,
    items: unknown[],
    nextUrl?: string | null,
  ): Promise<void> {
    if (!context.accountKey.trim() || !context.feedType.trim()) return;
    const boundedItems = items.slice(0, MAX_CACHED_LAUNCH_FEED_ITEMS);
    if (boundedItems.length === 0) return;

    const itemsJson = JSON.stringify(boundedItems);
    const now = Date.now();

    await localDatabase.run(async (database) => {
      await database.runAsync(
        `INSERT INTO feed_cache (
           account_key,
           feed_type,
           items_json,
           next_url,
           updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(account_key, feed_type) DO UPDATE SET
           items_json = excluded.items_json,
           next_url = excluded.next_url,
           updated_at = excluded.updated_at`,
        [context.accountKey, context.feedType, itemsJson, nextUrl ?? null, now],
      );
    });
  }

  async clearAccountCache(accountKey: string): Promise<void> {
    if (!accountKey.trim()) return;
    await localDatabase.run(async (database) => {
      await database.runAsync('DELETE FROM feed_cache WHERE account_key = ?', [
        accountKey,
      ]);
    });
  }
}

export const feedCacheRepository = new FeedCacheRepository();
