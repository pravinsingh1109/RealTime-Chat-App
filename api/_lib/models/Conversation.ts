import { HydratedDocument, Model, Schema, Types, models, model } from 'mongoose';

export type ConversationKind = 'direct' | 'group';

export interface IGroupDetails {
  name: string;
  description?: string;
  avatarUrl?: string;
  createdBy: Types.ObjectId;
}

export interface IConversation {
  kind: ConversationKind;
  members: Types.ObjectId[];
  directKey?: string;
  group?: IGroupDetails;
  lastMessage?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationDocument = HydratedDocument<IConversation>;

const groupDetailsSchema = new Schema<IGroupDetails>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    avatarUrl: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const conversationSchema = new Schema<IConversation>(
  {
    kind: { type: String, enum: ['direct', 'group'], required: true },
    members: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
      required: true,
      validate: {
        validator: (members: Types.ObjectId[]) => members.length >= 2 && members.length <= 100,
        message: 'A conversation must have between 2 and 100 members.',
      },
    },
    directKey: { type: String, unique: true, sparse: true },
    group: { type: groupDetailsSchema, required: false },
    lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' },
  },
  { timestamps: true }
);

conversationSchema.pre('validate', function validateConversation(next) {
  if (this.kind === 'direct') {
    if (this.members.length !== 2 || !this.directKey || this.group) {
      this.invalidate('kind', 'Direct conversations require exactly two members and a direct key.');
    }
  }

  if (this.kind === 'group' && !this.group) {
    this.invalidate('group', 'Group conversations require group details.');
  }

  next();
});

conversationSchema.index({ members: 1, updatedAt: -1 });

export const Conversation: Model<IConversation> = (models.Conversation as Model<IConversation>) || model<IConversation>('Conversation', conversationSchema);
