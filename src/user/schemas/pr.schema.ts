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

  @Prop({ type: Object })
  head?: Object;

  @Prop({ type: Object })
  user?: Object;

  @Prop({ default: 'pending' }) 
  reviewedStatus: string;

  @Prop({ required: true })
  githubId: string; 
}


export const PullRequestSchema = SchemaFactory.createForClass(PullRequest);