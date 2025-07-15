// src/user/workers/review.worker.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user.service';
import { setReviewResult } from 'src/utils/redis.utils';
import RedisConnection from 'src/config/Redis.config';

@Injectable()
export class ReviewWorker implements OnModuleInit {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const worker = new Worker(
      'code-review',
      async (job) => {
        const { githubId, repo, pr } = job.data;
        try {
          const review = await this.userService.getCodeReview(
            githubId,
            repo,
            pr,
          );
          const redisKey = `review:${githubId}:${repo}:${pr}`;
          await setReviewResult(redisKey, review);
        } catch (err) {
          console.error('Worker error:', err.message);
        }
      },
      { connection: RedisConnection },
    );

    worker.on('completed', async (job) => {
      console.error(`Job ${job.id} completed`);
    });

    worker.on('failed', async (job, err) => {
      console.error(`Job ${job.id} failed:`, err);
    });

    console.log('✅ Code review worker initialized');
  }
}
