import redis from '$lib/utils/redisClient';

/**
 * Get daily build data from cache or fetch and cache if missing/expired.
 * @param {string} key - Redis cache key
 * @param {Function} fetchFn - Function to fetch data if not in cache
 * @param {number} ttlSeconds - Time to live for cache in seconds
 */
export async function getOrSetDailyTestCache(key: string, fetchFn: () => Promise<any>, ttlSeconds = 3600) {
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }
  const freshData = await fetchFn();
  await redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);
  return freshData;
}
