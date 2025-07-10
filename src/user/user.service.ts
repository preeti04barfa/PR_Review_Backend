import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument } from "./schemas/user.schema";

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findByGithubId(githubId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ githubId }).exec();
  }

  async create(userData: Partial<User>): Promise<UserDocument> {
    const createdUser = new this.userModel(userData);
    return createdUser.save(); // <- this returns UserDocument
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async updateGitToken(githubId: string, gitToken: string): Promise<UserDocument | null> {
    return this.userModel.findOneAndUpdate({ githubId }, { gitToken }, { new: true }).exec();
  }
}
