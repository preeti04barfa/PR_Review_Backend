import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GithubStrategy } from '../auth/strategies/github.strategy';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { PullRequestSchema } from './schemas/pr.schema';
import { AuthService } from 'src/auth/auth.service';
@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default-secret',
        signOptions: { expiresIn: '7d' },
      }),
    }),
     MongooseModule.forFeature([{ name: 'User', schema: UserSchema }, { name: 'PullRequest', schema: PullRequestSchema }]),
  ],
  providers: [
    AuthService,
    UserService,
    GithubStrategy,
    JwtStrategy,
  ],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
