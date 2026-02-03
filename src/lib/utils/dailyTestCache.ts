import redis from '$lib/utils/redisClient';

/**
 * Get daily build data from cache or fetch and cache if missing/expired.
 * @param {string} key - Redis cache key
 * @param {Function} fetchFn - Function to fetch data if not in cache
 * @param {number} ttlSeconds - Time to live for cache in seconds
 */
export async function getOrSetDailyTestCache(key: string, fetchFn: () => Promise<any>, ttlSeconds = 600) {
  try {
    console.log(`[Redis] Attempting to get key: ${key}`);
    const cached = await redis.get(key);
    if (cached) {
      console.log(`[Redis] Cache hit for key: ${key}`);
      return JSON.parse(cached);
    } else {
      console.log(`[Redis] Cache miss for key: ${key}`);
    }
  } catch (err) {
    console.error(`[Redis] Error getting key ${key}:`, err);
  }
  let freshData;
  try {
    freshData = await fetchFn();
  } catch (err) {
    console.error(`[Cache] Error in fetchFn for key ${key}:`, err);
    throw err;
  }
  try {
    await redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);
    console.log(`[Redis] Set key: ${key} (TTL: ${ttlSeconds}s)`);
  } catch (err) {
    console.error(`[Redis] Error setting key ${key}:`, err);
  }
  return freshData;
}
