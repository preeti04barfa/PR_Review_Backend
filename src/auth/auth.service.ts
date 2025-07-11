import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserService } from "../user/user.service";
import { UserDocument } from "../user/schemas/user.schema";
import axios from 'axios';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async validateGithubUser(profile: any, accessToken: string): Promise<UserDocument> {
    const { id, username, displayName, emails, photos } = profile;

    let user = await this.userService.findByGithubId(id);

    if (!user) {
      user = await this.userService.create({
        githubId: id,
        name: displayName || username,
        email: emails?.[0]?.value || "",
        avatar: photos?.[0]?.value || "",
        role: "developer",
        gitToken: accessToken,
      });
    } else {
      const updatedUser = await this.userService.updateGitToken(id, accessToken);
      if (!updatedUser) {
        throw new UnauthorizedException("Failed to update user token");
      }
      user = updatedUser;
    }

    return user;
  }

  async login(user: UserDocument) {
    console.log("|hiii");
    
    const userId = user._id?.toString(); 
    if (!userId) {
      throw new UnauthorizedException("User ID is missing");
    }

    const payload = {
      sub: userId,
      githubId: user.githubId,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: this.jwtService.sign(payload, { expiresIn: "30d" }),
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
      throw new UnauthorizedException("User not found");
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
    })
  );

  return prsWithDiffs;
}



  async getReposAndPRs(githubId: string) {
    const user = await this.userService.findByGithubId(githubId);
    if (!user || !user.gitToken) {
      throw new UnauthorizedException('GitHub token not found');
    }

    const gitToken = user.gitToken;

    const repos = await this.getUserRepos(githubId);


   const reposWithPRs = await Promise.all(
  repos.map(async (repo) => {
    const prs = await this.getRepoPRs(repo.owner.login, repo.name, gitToken);
    return prs; // return PR array only
  }),
);
const allPRs = reposWithPRs.flat();

return allPRs; 
  }


}
