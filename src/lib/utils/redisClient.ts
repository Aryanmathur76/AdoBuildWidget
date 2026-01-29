import Redis from 'ioredis';

const redisOptions: any = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

if (process.env.REDIS_PASSWORD) {
  redisOptions.password = process.env.REDIS_PASSWORD;
  // Azure Redis requires username (typically 'default')
  redisOptions.username = process.env.REDIS_USERNAME || 'default';
}

if (process.env.REDIS_TLS === 'true') {
  redisOptions.tls = {
    servername: process.env.REDIS_HOST || '127.0.0.1'
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