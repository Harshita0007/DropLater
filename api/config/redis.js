// api/config/redis.js - Fixed Redis configuration
const Redis = require('ioredis');

let redisClient = null;

const getRedisClient = () => {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
    
    redisClient = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      reconnectOnError: (err) => {
        console.log('Redis reconnecting due to error:', err.message);
        return true;
      }
    });

    redisClient.on('connect', () => {
      console.log('Redis connected');
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redisClient.on('ready', () => {
      console.log('Redis ready');
    });

    redisClient.on('close', () => {
      console.log('Redis connection closed');
    });
  }

  return redisClient;
};

const closeRedisConnection = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

module.exports = {
  getRedisClient,
  closeRedisConnection
};