import { json, type RequestHandler } from '@sveltejs/kit';
import redis from '$lib/utils/redisClient';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { keys } = await request.json();

    if (!Array.isArray(keys) || keys.length === 0) {
      return json({ error: 'Invalid request: keys array required' }, { status: 400 });
    }

    // Delete each key from Redis
    const results = await Promise.allSettled(
      keys.map(key => redis.del(key))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return json({
      success: true,
      message: `Cleared ${succeeded} cache keys`,
      deleted: succeeded,
      failed: failed
    });
  } catch (error) {
    console.error('Error clearing cache keys:', error);
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
