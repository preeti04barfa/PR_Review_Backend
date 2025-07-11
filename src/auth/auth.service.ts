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
async getAllUsersRepos(): Promise<any[]> {
    const users = await this.userService.findAll(); 
    const allRepos = [];

    for (const user of users) {
      const gitToken = user.gitToken;

      if (!gitToken) continue;

      try {
        const response = await axios.get('https://api.github.com/user/repos?per_page=100', {
          headers: {
            Authorization: `token ${gitToken}`,
          },
        });

        const repos = response.data.map(repo => ({
          user: user.githubId,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          url: repo.html_url,
        }));

        allRepos.push(...repos);
      } catch (error) {
        console.error(`Error fetching repos for user ${user.githubId}:`, error.response?.data || error.message);
      }
    }

    return allRepos;
  }
}
