import { Controller, Get, UseGuards, Request, Response, Query, Post, Body } from "@nestjs/common"
import { AuthGuard } from "@nestjs/passport"
import { Response as ExpressResponse } from "express"
import { AuthService } from "./auth.service"
import { UserDocument } from "../user/schemas/user.schema"
import { UserService } from "src/user/user.service"
import { getReviewResult } from "src/utils/redis.utils"
import { ReviewQueue } from "src/config/Bullmq.config"
import { log } from 'node:console';

interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly userService: UserService,
    ) { }

  @Get('github')
  @UseGuards(AuthGuard('github'))
  async githubAuth(@Request() req: AuthenticatedRequest) {}

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubCallback(@Request() req: AuthenticatedRequest, @Response() res: ExpressResponse) {
    if (!req || !req.user) {
      console.error('No user found in request - req exists:', !!req, 'req.user exists:', !!(req && req.user));
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=auth_failed`);
    }

    try {
      const loginResult = await this.authService.login(req.user);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontendUrl}/auth/callback?token=${loginResult.access_token}&refresh=${loginResult.refresh_token}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Login error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=login_failed`);
    }
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Request() req: AuthenticatedRequest) {
    const userId = req.user._id?.toString() || req.user.id;

    if (!userId) {
      throw new Error('User ID is missing');
    }

    return {
      status: 'success',
      message: 'User data retrieved successfully',
      data: {
        id: userId,
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar,
        role: req.user.role,
      },
    };
  }

  @Get('users')
  @UseGuards(AuthGuard('jwt'))
  async getAllUsers(@Request() req: AuthenticatedRequest) {
    const users = await this.authService.getAllUsers();
    return {
      status: 'success',
      message: 'Fetched all users successfully',
      data: users,
    };
  }

  @Get('repos-prs')
  @UseGuards(AuthGuard('jwt'))
  async getReposAndPRs(@Request() req: AuthenticatedRequest) {
    const user = req.user;
    const githubId = user.githubId;

    const reposAndPRs = await this.authService.getReposAndPRs(githubId);
    console.log(reposAndPRs,"reposAndPRs");
    
    return {
      status: 'success',
      data: reposAndPRs,
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
      const addData = {
        githubId,
        repo,
        pr,
      }
      // Add job to queue
      await ReviewQueue.add('review-task', addData, { attempts: 3 });

      return {
        status: 'queued',
        message: 'Review is being processed.',
      };
    }
    @Post('webhook')
    async handleWebhook(@Body() payload: any, @Request() req: Request) {
      const event = req.headers['x-github-event'] as string;
      const signature = req.headers['x-hub-signature-256'] as string;
      return this.authService.handleGithubWebhook(payload, event, signature);
    }
}

