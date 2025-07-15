import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import RedisConnection from './Redis.config';


export const ReviewQueue = new Queue('code-review', { connection: RedisConnection });
