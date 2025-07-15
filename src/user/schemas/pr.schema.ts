// src/user/schemas/pr.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PRDocument = HydratedDocument<PullRequest>;

@Schema({ timestamps: true })
export class PullRequest {
  @Prop({ required: true })
  id: number;

  @Prop()
  title?: string;

  @Prop()
  body?: string;

  @Prop()
  state?: string;

  @Prop()
  number?: number;

  @Prop({ type: [Object] })
  prDiff?: Array<object>;

  @Prop({
    type: {
      repo: {
        pushed_at: String,
        name: String,
        full_name: String,
        owner: { login: String },
        private: Boolean,
      },
    },
  })
  head?: {
    repo?: {
      pushed_at?: string;
      name?: string;
      full_name?: string;
      owner?: { login?: string };
      private?: boolean;
    };
  };

  @Prop({ type: { login: String } })
  user?: { login?: string };

  @Prop({ default: 'pending' })
  reviewedStatus: string;

  @Prop({ required: true })
  githubId: string;
}

export const PullRequestSchema = SchemaFactory.createForClass(PullRequest);

PullRequestSchema.index({ githubId: 1, 'head.repo.pushed_at': -1 });