import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
// src/user/user.service.ts
import { PullRequest, PRDocument } from './schemas/pr.schema';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
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

  async geminiReviewPR(data: string) {
    try {
      const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY');
      const prompt = `
      You are a senior software engineer and expert code reviewer.

      Your task is to thoroughly review the following GitHub Pull Request (PR) diff and provide a detailed, structured, and strict review.

      The review must identify and explain:

      1. Code Quality (0–10):
        Is the code clean, modular, and maintainable?
        Are naming conventions and best practices followed?

      2. Security (0–10):
        Are there any vulnerabilities, unsafe functions, or insecure patterns?
        Is input validation, authentication, and authorization properly handled?

      3. Readability (0–10):
        Is the code easy to understand?
        Is it well-organized and properly commented?

      4. Performance (0–10):
        Is the code optimized and efficient?
        Are there any unnecessary computations or possible bottlenecks?

      5. Code Understanding (0–10):
        Does the code reflect the developer’s understanding of the problem and technology?
        Is the logic correct and appropriately implemented?

      6. Suggestions: [{"Improvement", "Code Example"},...]
      
      Output the review as a **raw JSON object**, exactly in the format below.  
      **Do not wrap the result in a string or markdown.**  
      **Do not include any commentary or explanation outside the JSON.**
      **Do not include any escape sequence or spaces or newlines. so that I can parse it using JSON.parse method**

      Now review this GitHub Pull Request diff:
      ${data}
      `;

  
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': geminiApiKey,
          },
        },
      );
      const result = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let formatResult = result
      .replace(/^```\s*/i, '')       // fallback if not labeled
      .replace(/^json\s*/i, '')   // remove opening json
        .replace(/\s*```$/, '')        // remove trailing ```
        .trim();
        return JSON.parse(formatResult)
    } catch (error) {
      console.error('Error in geminiReviewPR:', error?.message);
    }
  }

  async getCodeReview(
    githubId: string,
    repo: string,
    pr: number,
  ): Promise<any> {
    const user = await this.findByGithubId(githubId);
    if (!user || !user.gitToken) {
      throw new UnauthorizedException('GitHub token not found');
    }
    const gitToken = user.gitToken;

    const diffResp = await axios.get(
      `https://api.github.com/repos/${repo}/pulls/${pr}`,
      {
        headers: {
          Authorization: `token ${gitToken}`,
          Accept: 'application/vnd.github.v3.diff',
        },
      },
    );
    const reviewResp = await this.geminiReviewPR(diffResp?.data);
    if(reviewResp){
      return reviewResp;
    }
    throw new Error("Failed to review...")
  }
  async savePR(prData: Partial<PullRequest>): Promise<PRDocument> {
    const createdPR = new this.prModel(prData);
    return createdPR.save();
  }
  
  async findPRsByGithubId(githubId: string): Promise<PRDocument[]> {
    return this.prModel.find({ githubId }).exec();
  }
  
  async updatePR(id: number, githubId: string, updateData: Partial<PullRequest>): Promise<PRDocument | null> {
    return this.prModel
      .findOneAndUpdate({ id, githubId }, updateData, { new: true, upsert: true })
      .exec();
  }
}
