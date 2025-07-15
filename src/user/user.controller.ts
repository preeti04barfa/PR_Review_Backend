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
    console.log('==========', { githubId, repo, pr });
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
}
