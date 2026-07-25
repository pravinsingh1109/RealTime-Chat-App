import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { inMemoryConversationStore, isInMemoryDbActive } from '../inMemoryStore.js';

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

const groupDetailsSchema = new mongoose.Schema<IGroupDetails>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    avatarUrl: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema<IConversation>(
  {
    kind: { type: String, enum: ['direct', 'group'], required: true },
    members: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
      required: true,
      validate: {
        validator: (members: Types.ObjectId[]) => members.length >= 2 && members.length <= 100,
        message: 'A conversation must have between 2 and 100 members.',
      },
    },
    directKey: { type: String, unique: true, sparse: true },
    group: { type: groupDetailsSchema, required: false },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
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

const realConversationModel: Model<IConversation> = (mongoose.models.Conversation as Model<IConversation>) || mongoose.model<IConversation>('Conversation', conversationSchema);

export const Conversation: Model<IConversation> = new Proxy(realConversationModel, {
  get(target, prop, receiver) {
    if (isInMemoryDbActive() && prop in inMemoryConversationStore) {
      return (inMemoryConversationStore as any)[prop];
    }
    return Reflect.get(target, prop, receiver);
  },
});


