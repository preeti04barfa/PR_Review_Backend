import { Redis } from 'ioredis';

let retryCount = 0;
const MAX_RETRIES = 3;
const RedisConnection = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => {
    retryCount++;
    if (retryCount > MAX_RETRIES) {
      console.error(`❌ Redis retry limit reached (${MAX_RETRIES}). No more retries.`);
      return null; // <== stop trying to reconnect
    }
    const delay = Math.min(times * 100, 3000); // exponential backoff, max 3 sec
    console.warn(`⚠️ Redis reconnect attempt #${retryCount}. Retrying in ${delay}ms`);
    return delay;
  },
});
RedisConnection.on('connect', () => {
  console.log('✅ Redis connected successfully');
});
RedisConnection.on('error', (err) => {
  console.error('❌ Redis connection error:', err?.message);
});
export default RedisConnection;
