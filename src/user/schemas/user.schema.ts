import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true }) 
export class User {
  @Prop({ required: true })
  githubId: string;

  @Prop()
  name: string;

  @Prop()
  email: string;

  @Prop()
  avatar: string;

  @Prop({ default: 'developer' })
  role: string;

  @Prop()
  gitToken: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
