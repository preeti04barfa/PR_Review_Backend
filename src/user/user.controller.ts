import {
  Controller,
  Get,
  UseGuards,
  Request,
  Response,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response as ExpressResponse } from 'express';
import { UserDocument } from '../user/schemas/user.schema';
import { UserService } from './user.service';
import { AuthService } from 'src/auth/auth.service';
import { getReviewResult, setReviewResult } from 'src/utils/redis.utils';
import { PRReviewStatus } from './dto/user.dto';
import { ReviewQueue } from 'src/config/Bullmq.config';

interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

@Controller('user')
export class UserController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}
  @Get('test')
  async test() {
    return {
      status: 'success',
      data: 'hello',
    };
  }

  @Get('code-review')
  @UseGuards(AuthGuard('jwt'))
  async codeReview(
    @Request() req,
    @Query('repo') repo: string,
    @Query('pr') pr: number,
  ) {
    const user = req.user;
    const githubId = user.githubId;
    const reposAndPRs = await this.userService.getCodeReview(
      githubId,
      repo,
      pr,
    );
    return {
      status: 'success',
      data: reposAndPRs,
    };
  }

  @Get('review-pr')
  @UseGuards(AuthGuard('jwt'))
  async enqueueCodeReviewJob(
    @Request() req,
    @Query('repo') repo: string,
    @Query('pr') pr: number,
    @Query('prId') prId: string,
    @Query('isRetry') isRetry: string,
  ) {
    const user = req.user;
    const githubId = user.githubId;
    const redisKey = `review:${githubId}:${repo}:${pr}`;

    const cached = await getReviewResult(redisKey);
    if (cached) {
      return {
        status: 'success',
        message: 'Already reviewed',
        data: cached,
      };
    }
    const prDetail = await this.userService.findReviewInDb(prId);
    if (
      (prDetail?.reviewedStatus == PRReviewStatus.COMPLETED ||
        prDetail?.reviewedStatus == PRReviewStatus.FAILED) &&
      isRetry === 'false'
    ) {
      let isCompleted = prDetail?.reviewedStatus == PRReviewStatus.COMPLETED;
      if (isCompleted) {
        await setReviewResult(redisKey, prDetail?.reviewData);
      }
      return {
        status: isCompleted ? 'success' : 'failed',
        message: isCompleted ? 'Already reviewed' : 'Pr Review Failed',
        data: isCompleted ? prDetail?.reviewData : null,
      };
    }
    // if(prDetail?.reviewedStatus == PRReviewStatus.COMPLETED){
    //   await setReviewResult(redisKey, prDetail?.reviewData);
    //   return {
    //     status: 'success',
    //     message: 'Already reviewed',
    //     data: prDetail?.reviewData,
    //   };
    // }
    const addData = {
      githubId,
      repo,
      pr,
      prId,
    };
    await this.userService.updateReviewStatus(prId, PRReviewStatus.IN_PROGRESS);
    // Add job to queue
    await ReviewQueue.add('review-task', addData, {
      jobId: redisKey,
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: true,
    });

    return {
      status: 'queued',
      message: 'Review is being processed.',
    };
  }
}
