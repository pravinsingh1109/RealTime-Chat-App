import bcrypt from 'bcryptjs';
import { HydratedDocument, Model, Schema, model } from 'mongoose';

export interface IUser {
  displayName: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(password: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    avatarUrl: {
      type: String,
      trim: true,
      maxlength: 500
    },
    lastSeen: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_document, returned: Record<string, unknown>) => {
        const id = returned._id;
        if (id && typeof id === 'object' && 'toString' in id) returned.id = id.toString();
        delete returned.passwordHash;
        delete returned.__v;
        delete returned._id;
      }
    }
  }
);

userSchema.index({ email: 1 }, { unique: true });

userSchema.methods.comparePassword = async function comparePassword(password: string): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash);
};

export const User: Model<IUser> = model<IUser>('User', userSchema);
