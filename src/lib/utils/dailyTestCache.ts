import redis from '$lib/utils/redisClient';

/**
 * Get daily build data from cache or fetch and cache if missing/expired.
 * @param {string} key - Redis cache key
 * @param {Function} fetchFn - Function to fetch data if not in cache
 * @param {number} ttlSeconds - Time to live for cache in seconds
 */
export async function getOrSetDailyTestCache(key: string, fetchFn: () => Promise<any>, ttlSeconds = 600) {
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    } else {
    }
  } catch (err) {
  }
  let freshData;
  try {
    freshData = await fetchFn();
  } catch (err) {
    throw err;
  }
  try {
    await redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);
  } catch (err) {
  }
  return freshData;
}
