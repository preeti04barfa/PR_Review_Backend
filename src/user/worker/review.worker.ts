// src/user/workers/review.worker.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user.service';
import { setReviewResult } from 'src/utils/redis.utils';
import RedisConnection from 'src/config/Redis.config';
import { PRDocument, PullRequest } from '../schemas/pr.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PRReviewStatus } from '../dto/user.dto';

@Injectable()
export class ReviewWorker implements OnModuleInit {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    @InjectModel(PullRequest.name) private readonly PrModal: Model<PRDocument>,
  ) {}

  onModuleInit() {
    const worker = new Worker(
      'code-review',
      async (job) => {
        const { githubId, repo, pr, prId } = job.data;
        const review = await this.userService.getCodeReview(githubId, repo, pr);
        const redisKey = `review:${githubId}:${repo}:${pr}`;
        await setReviewResult(redisKey, review);
        await this.PrModal.findOneAndUpdate(
          { _id: prId },
          { reviewData: review },
        );
      },
      { connection: RedisConnection },
    );

    worker.on('completed', async (job) => {
      const { prId } = job.data;
      await this.PrModal.findOneAndUpdate(
        { _id: prId },
        { reviewedStatus: PRReviewStatus.COMPLETED },
      );
      console.error(`Job ${job.id} completed`);
    });

    worker.on('failed', async (job, err) => {
      const { prId } = job.data;
      if(job.attemptsMade == 3){
        await this.PrModal.findOneAndUpdate(
          { _id: prId },
          { reviewedStatus: PRReviewStatus.FAILED },
        );
        console.error(`Job ${job.id} failed:`, err?.message);
      }
    });

    console.log('✅ Code review worker initialized');
  }
}
