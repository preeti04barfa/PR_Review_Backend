import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserService } from "../user/user.service";
import { UserDocument } from "../user/schemas/user.schema";

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
console.log(userId,"userId");

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
}
