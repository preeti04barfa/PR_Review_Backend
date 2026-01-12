// src/user/user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { PullRequest, PRDocument } from './schemas/pr.schema';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(PullRequest.name) private readonly prModel: Model<PRDocument>,
  ) {}

  async findByGithubId(githubId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ githubId }).exec();
  }

  async create(userData: Partial<User>): Promise<UserDocument> {
    const createdUser = new this.userModel(userData);
    return createdUser.save();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async updateGitToken(githubId: string, gitToken: string): Promise<UserDocument | null> {
    return this.userModel.findOneAndUpdate({ githubId }, { gitToken }, { new: true }).exec();
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().sort({ createdAt: -1 }).exec();
  }

  async savePR(prData: Partial<PullRequest>): Promise<PRDocument> {
    const createdPR = new this.prModel(prData);
    return createdPR.save();
  }

  async findPRsByGithubId(githubId: string): Promise<PRDocument[]> {
    return this.prModel.find({ githubId }).sort({ 'head.repo.pushed_at': -1 }).exec();
  }

  async updatePR(id: number, githubId: string, updateData: Partial<PullRequest>): Promise<PRDocument | null> {
    return this.prModel
      .findOneAndUpdate({ id, githubId }, updateData, { new: true, upsert: true })
      .exec();
  }
   async findAllPRs(): Promise<PRDocument[]> {
    return this.prModel.find().sort({ createdAt: -1 }).exec();
  }
}