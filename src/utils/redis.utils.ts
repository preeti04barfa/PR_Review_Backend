// src/utils/redis.utils.ts
import Redis from 'ioredis';
import RedisConnection from 'src/config/Redis.config';

export const setReviewResult = async (key: string, value: any) => {
  await RedisConnection.set(key, JSON.stringify(value), 'EX',  5 * 60); // 1 hour expiry
};

export const getReviewResult = async (key: string) => {
  const val = await RedisConnection.get(key);
  return val ? JSON.parse(val) : null;
};