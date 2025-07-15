import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserService } from './user.service';
import { User, UserSchema } from './schemas/user.schema';
import { PullRequest, PullRequestSchema } from './schemas/pr.schema';
import { ReviewWorker } from './worker/review.worker';


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: PullRequest.name, schema: PullRequestSchema },
    ]),
  ],
  providers: [UserService, ReviewWorker],
  exports: [UserService],
})
export class UserModule {}