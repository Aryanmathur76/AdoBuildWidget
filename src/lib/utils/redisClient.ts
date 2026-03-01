import Redis from 'ioredis';
import { env } from '$env/dynamic/private';


const redisOptions: any = {
  host: env.REDIS_HOST || '127.0.0.1',
  port: parseInt(env.REDIS_PORT || '6379', 10),
  lazyConnect: true,  // don't connect at import time (avoids errors during Vite build)
};

if (env.REDIS_PASSWORD) {
  redisOptions.password = env.REDIS_PASSWORD;
  // Azure Redis requires username (typically 'default')
  // Do NOT set username for Azure Managed Redis
}

if (env.REDIS_TLS === 'true') {
  redisOptions.tls = {
    servername: env.REDIS_HOST || '127.0.0.1'
  };
}

const redis = new Redis(redisOptions);

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

export default redis;