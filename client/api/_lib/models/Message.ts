import { HydratedDocument, Model, Schema, Types, models, model } from 'mongoose';

export type MessageKind = 'text' | 'image' | 'system';

export interface IReadReceipt {
  user: Types.ObjectId;
  readAt: Date;
}

export interface IMessage {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  kind: MessageKind;
  content?: string;
  imageUrl?: string;
  clientMessageId?: string;
  readBy: IReadReceipt[];
  createdAt: Date;
  updatedAt: Date;
}

export type MessageDocument = HydratedDocument<IMessage>;

const readReceiptSchema = new Schema<IReadReceipt>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, required: true },
  },
  { _id: false }
);

const messageSchema = new Schema<IMessage>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['text', 'image', 'system'], required: true, default: 'text' },
    content: { type: String, trim: true, maxlength: 4_000 },
    imageUrl: { type: String, trim: true },
    clientMessageId: { type: String, trim: true, maxlength: 100 },
    readBy: { type: [readReceiptSchema], default: [] },
  },
  { timestamps: true }
);

messageSchema.pre('validate', function validateMessage(next) {
  if (this.kind === 'text' && !this.content?.trim()) {
    this.invalidate('content', 'Text messages require content.');
  }

  if (this.kind === 'image' && !this.imageUrl) {
    this.invalidate('imageUrl', 'Image messages require an image URL.');
  }

  next();
});

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index(
  { conversation: 1, sender: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMessageId: { $type: 'string' } },
  }
);

export const Message: Model<IMessage> = (models.Message as Model<IMessage>) || model<IMessage>('Message', messageSchema);
