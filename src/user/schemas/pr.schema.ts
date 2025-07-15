import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PRReviewStatus } from '../dto/user.dto';

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

  @Prop({ type: Object })
  head?: Object;

  @Prop({ type: Object })
  user?: Object;

  @Prop({ enum: PRReviewStatus, default: PRReviewStatus.PENDING })
  reviewedStatus?: PRReviewStatus;

  @Prop({ required: true })
  githubId: string;

  @Prop({ type: Object })
  reviewData?: Object;
}


export const PullRequestSchema = SchemaFactory.createForClass(PullRequest);