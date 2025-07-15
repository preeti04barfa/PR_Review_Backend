import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { UserDocument } from '../user/schemas/user.schema';
import axios from 'axios';
import { createHmac } from 'crypto';
import { PRReviewStatus } from 'src/user/dto/user.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  async validateGithubUser(profile: any, accessToken: string): Promise<UserDocument> {
    const { id, username, displayName, emails, photos } = profile;

    let user = await this.userService.findByGithubId(id);

    if (!user) {
      user = await this.userService.create({
        githubId: id,
        name: displayName || username,
        email: emails?.[0]?.value || '',
        avatar: photos?.[0]?.value || '',
        role: 'developer',
        gitToken: accessToken,
      });
    } else {
      const updatedUser = await this.userService.updateGitToken(id, accessToken);
      if (!updatedUser) {
        throw new UnauthorizedException('Failed to update user token');
      }
      user = updatedUser;
    }

    return user;
  }

  async login(user: UserDocument) {
    const userId = user._id?.toString();
    if (!userId) {
      throw new UnauthorizedException('User ID is missing');
    }

    const payload = {
      sub: userId,
      githubId: user.githubId,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: this.jwtService.sign(payload, { expiresIn: '30d' }),
      user: {
        id: userId,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
      },
    };
  }

  async validateUser(payload: any): Promise<UserDocument | null> {
    const user = await this.userService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  async getAllUsers(): Promise<UserDocument[]> {
    return this.userService.findAll();
  }

  async getUserRepos(githubId: string) {
    const user = await this.userService.findByGithubId(githubId);
    if (!user || !user.gitToken) {
      throw new UnauthorizedException('GitHub token not found');
    }

    const gitToken = user.gitToken;

    const reposResponse = await axios.get('https://api.github.com/user/repos?per_page=100', {
      headers: { Authorization: `token ${gitToken}` },
    });

    return reposResponse.data;
  }

  async getRepoPRs(owner: string, repoName: string, gitToken: string) {
    const prUrl = `https://api.github.com/repos/${owner}/${repoName}/pulls?state=all&per_page=100`;
    const prResponse = await axios.get(prUrl, {
      headers: { Authorization: `token ${gitToken}` },
    });

    const prs = prResponse.data;

    const prsWithDiffs = await Promise.all(
      prs.map(async (pr) => {
        try {
          const diffUrl = `https://api.github.com/repos/${owner}/${repoName}/pulls/${pr.number}/files`;
          const diffResponse = await axios.get(diffUrl, {
            headers: { Authorization: `token ${gitToken}` },
          });

          return {
            ...pr,
            prDiff: diffResponse.data,
          };
        } catch (error) {
          console.error(`Failed to fetch diff for PR #${pr.number}`, error);
          return {
            ...pr,
            prDiff: [],
          };
        }
      }),
    );

    return prsWithDiffs;
  }

  async getReposAndPRs(githubId: string) {
    const user = await this.userService.findByGithubId(githubId);
    if (!user || !user.gitToken) {
      throw new UnauthorizedException('GitHub token not found');
    }

    const gitToken = user.gitToken;

    // Check database first
    const cachedPRs = await this.userService.findPRsByGithubId(githubId);
    if (cachedPRs.length > 0) {
      return cachedPRs;
    }

    // Fetch from GitHub if no cached data
    const repos = await this.getUserRepos(githubId);
    const reposWithPRs = await Promise.all(
      repos.map(async (repo) => {
        const prs = await this.getRepoPRs(repo.owner.login, repo.name, gitToken);
        return prs;
      }),
    );

    const allPRs = reposWithPRs.flat();
    console.log(allPRs, "allPRs");

    // Save PRs to database
    const formattedPRs = await Promise.all(
      allPRs.map(async (pr) => {
        const prData = {
          id: pr.id,
          title: pr.title,
          body: pr.body,
          state: pr.state,
          number: pr.number,
          prDiff: pr.prDiff,
          head: pr.head
            ? {
              repo: pr.head.repo
                ? {
                  pushed_at: pr.head.repo.pushed_at,
                    name: pr.head.repo.name,
                  owner: pr.head.repo.owner ? { login: pr.head.repo.owner.login } : undefined,
                }
                : undefined,
            }
            : undefined,
          user: pr.user ? { login: pr.user.login } : undefined,
          reviewedStatus: PRReviewStatus.PENDING,
          githubId,
        };
        return this.userService.updatePR(pr.id, githubId, prData);
      }),
    );

    return formattedPRs;
  }

  async handleGithubWebhook(payload: any, event: string, signature: string) {
    const webhookSecret = this.configService.get<string>('WEBHOOK_SECRET');
    console.log(webhookSecret, "webhookSecret");

    if (!webhookSecret) {
      throw new UnauthorizedException('Webhook secret not configured');
    }
    console.log(JSON.stringify(payload), "SON.stringify(payload)");

    const computedSig = `sha256=${createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex')}`;

    if (signature !== computedSig) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    if (event === 'pull_request') {
      const pr = payload.pull_request;
      const githubId = await this.getGithubIdFromRepo(payload.repository);
      if (!githubId) {
        console.error('No userresearching user for repository');
        return { status: 'ignored', message: 'No user associated with repository' };
      }

      const prData = {
        id: pr.id,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        number: pr.number,
        prDiff: await this.fetchPRDiff(
          pr.repository.owner.login,
          pr.repository.name,
          pr.number,
          githubId,
        ),
        head: pr.head
          ? {
            repo: pr.head.repo
              ? {
                pushed_at: pr.head.repo.pushed_at,
                name: pr.head.repo.name,
                owner: pr.head.repo.owner ? { login: pr.head.repo.owner.login } : undefined,
              }
              : undefined,
          }
          : undefined,
        user: pr.user ? { login: pr.user.login } : undefined,
        reviewedStatus: PRReviewStatus.PENDING,
        githubId,
      };

      await this.userService.updatePR(pr.id, githubId, prData);
      return { status: 'success', message: 'PR processed and saved' };
    }

    return { status: 'ignored', message: 'Event not handled' };
  }

  async fetchPRDiff(owner: string, repoName: string, prNumber: number, githubId: string) {
    const user = await this.userService.findByGithubId(githubId);
    if (!user || !user.gitToken) {
      throw new UnauthorizedException('GitHub token not found');
    }

    const diffUrl = `https://api.github.com/repos/${owner}/${repoName}/pulls/${prNumber}/files`;
    const diffResponse = await axios.get(diffUrl, {
      headers: { Authorization: `token ${user.gitToken}` },
    });

    return diffResponse.data;
  }

  async getGithubIdFromRepo(repo: any): Promise<string | null> {
    const user = await this.userService.findByGithubId(repo.owner.id.toString());
    return user ? user.githubId : null;
  }
}