import redis from '../src/lib/utils/redisClient';

async function testRedisConnection() {
  try {
    await redis.set('test-key', 'test-value', 'EX', 10);
    const value = await redis.get('test-key');
    console.log('Redis test value:', value);
    if (value === 'test-value') {
      console.log('Redis connection successful!');
    } else {
      console.error('Redis connection failed: Value mismatch');
    }
  } catch (err) {
    console.error('Redis connection error:', err);
  } finally {
    redis.disconnect();
  }
}

testRedisConnection();
