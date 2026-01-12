import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { UserDocument } from '../user/schemas/user.schema';
import axios from 'axios';
import { createHmac } from 'crypto';

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

async getReposAndPRs(githubId: string, forceRefresh: boolean = false) {
  const user = await this.userService.findByGithubId(githubId);
  if (!user || !user.gitToken) {
    throw new UnauthorizedException('GitHub token not found');
  }

  const gitToken = user.gitToken;

  if (!forceRefresh) {
    const cachedPRs = await this.userService.findPRsByGithubId(githubId);
    if (cachedPRs.length > 0) {
      return cachedPRs;
    }
  }

  const repos = await this.getAllUserRepos(githubId, gitToken);
  const reposWithPRs = await Promise.all(
    repos.map(async (repo) => {
      const prs = await this.getRepoPRs(repo.owner.login, repo.name, gitToken);
      return prs;
    }),
  );

  const allPRs = reposWithPRs.flat();

  const formattedPRs = await Promise.all(
    allPRs.map(async (pr) => {
      const prData = {
        id: pr.id,
        title: pr.title || 'Untitled PR',
        body: pr.body || '',
        state: pr.state || 'unknown',
        number: pr.number,
        prDiff: pr.prDiff || [],
        head: pr.head
          ? {
              repo: pr.head.repo
                ? {
                    pushed_at: pr.head.repo.pushed_at,
                    name: pr.head.repo.name,
                    full_name: pr.head.repo.full_name,
                    owner: pr.head.repo.owner ? { login: pr.head.repo.owner.login } : undefined,
                  }
                : undefined,
            }
          : undefined,
        user: pr.user ? { login: pr.user.login } : undefined,
        reviewedStatus: 'pending',
        githubId,
      };
      return this.userService.updatePR(pr.id, githubId, prData);
    }),
  );

  return formattedPRs.sort((a, b) => {
    const dateA = a.head?.repo?.pushed_at ? new Date(a.head.repo.pushed_at).getTime() : 0;
    const dateB = b.head?.repo?.pushed_at ? new Date(b.head.repo.pushed_at).getTime() : 0;
    return dateB - dateA;
  });
}

async getAllUserRepos(githubId: string, gitToken: string) {
  const repos = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    try {
      const reposResponse = await axios.get(
        `https://api.github.com/user/repos?per_page=${perPage}&page=${page}`,
        {
          headers: { Authorization: `token ${gitToken}` },
        },
      );

      const fetchedRepos = reposResponse.data;
      repos.push(...fetchedRepos);

      if (fetchedRepos.length < perPage) {
        break;
      }
      page++;
    } catch (error) {
      console.error('Error fetching repositories:', error.response?.data || error.message);
      throw new UnauthorizedException('Failed to fetch repositories');
    }
  }

  return repos;
}

async handleGithubWebhook(payload: any, event: string, signature: string, rawBody: Buffer) {
  const webhookSecret = this.configService.get<string>('WEBHOOK_SECRET');
  if (!webhookSecret) {
    throw new UnauthorizedException('Webhook secret not configured');
  }

  const computedSig = `sha256=${createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex')}`;

  console.log('Computed signature:', computedSig);
  console.log('Received signature:', signature);

  if (signature !== computedSig) {
    throw new UnauthorizedException('Invalid webhook signature');
  }

  if (event === 'pull_request' && ['opened', 'edited', 'closed', 'reopened'].includes(payload.action)) {
    const pr = payload.pull_request;
    const githubId = await this.getGithubIdFromRepo(payload.repository);

    if (!githubId) {
      console.error('No user found for repository:', payload.repository?.owner?.id);
      return { status: 'ignored', message: 'No user associated with repository' };
    }

    const prData = {
      id: pr.id,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      number: pr.number,
      prDiff: await this.fetchPRDiff(
        payload.repository.owner.login,
        payload.repository.name,
        pr.number,
        githubId,
      ),
      head: pr.head
        ? {
            repo: pr.head.repo
              ? {
                  pushed_at: pr.head.repo.pushed_at,
                  name: pr.head.repo.name,
                   full_name:pr.head.repo.full_name,
                  owner: pr.head.repo.owner ? { login: pr.head.repo.owner.login } : undefined,
                }
              : undefined,
          }
        : undefined,
      user: pr.user ? { login: pr.user.login } : undefined,
      reviewedStatus: 'pending',
      githubId,
    };

    const savedPR = await this.userService.updatePR(pr.id, githubId, prData);
    return { status: 'success', message: 'PR processed and saved', data: savedPR };
  }

  return { status: 'ignored', message: 'Event not handled' };
}


  async fetchPRDiff(owner: string, repoName: string, prNumber: number, githubId: string) {
    const user = await this.userService.findByGithubId(githubId);
    if (!user || !user.gitToken) {
      throw new UnauthorizedException('GitHub token not found');
    }

    const diffUrl = `https://api.github.com/repos/${owner}/${repoName}/pulls/${prNumber}/files`;
    try {
      const diffResponse = await axios.get(diffUrl, {
        headers: { Authorization: `token ${user.gitToken}` },
      });
      return diffResponse.data;
    } catch (error) {
      console.error(`Failed to fetch diff for PR #${prNumber}:`, error.message);
      return [];
    }
  }

  async getGithubIdFromRepo(repo: any): Promise<string | null> {
    const githubId = repo?.owner?.id?.toString();
    const user = await this.userService.findByGithubId(githubId);
    return user ? user.githubId : null;
  }

  async getAllDevelopersSummary() {
  const allPRs = await this.userService.findAllPRs();

  if (!allPRs || allPRs.length === 0) {
    return [];
  }

  const developerMap = new Map<string, { 
    noOfPRs: number; 
    projects: Set<string>; 
  }>();

  allPRs.forEach((pr) => {
    const developer = pr?.head?.repo?.owner?.login;
    const project = pr?.head?.repo?.name;

    if (developer) {
      if (!developerMap.has(developer)) {
        developerMap.set(developer, { noOfPRs: 0, projects: new Set() });
      }

      const devData = developerMap.get(developer);
      devData.noOfPRs += 1; 
      if (project) devData.projects.add(project); 
    }
  });


return Array.from(developerMap.entries()).map(([developer, data], index) => ({
  id: index + 1,
  developer,
  noOfPRs: data.noOfPRs,
  noOfProjects: data.projects.size,
  projects: Array.from(data.projects), 
}));

  }}