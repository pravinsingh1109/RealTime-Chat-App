import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

export interface MockUser {
  _id: mongoose.Types.ObjectId;
  id: string;
  displayName: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(pwd: string): Promise<boolean>;
  toObject(): Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

export interface MockConversation {
  _id: mongoose.Types.ObjectId;
  id: string;
  kind: 'direct' | 'group';
  members: Array<mongoose.Types.ObjectId | MockUser>;
  directKey?: string;
  group?: {
    name: string;
    description?: string;
    avatarUrl?: string;
    createdBy: mongoose.Types.ObjectId;
  };
  lastMessage?: mongoose.Types.ObjectId | MockMessage;
  createdAt: Date;
  updatedAt: Date;
  populate(spec?: any): Promise<MockConversation>;
  toObject(): Record<string, unknown>;
}

export interface MockMessage {
  _id: mongoose.Types.ObjectId;
  id: string;
  conversation: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId | MockUser;
  kind: 'text' | 'image' | 'system';
  content?: string;
  imageUrl?: string;
  clientMessageId?: string;
  readBy: Array<{ user: mongoose.Types.ObjectId; readAt: Date }>;
  createdAt: Date;
  updatedAt: Date;
  populate(field: any, select?: string): Promise<MockMessage>;
  toObject(): Record<string, unknown>;
}

declare global {
  var __inMemoryUsers: MockUser[] | undefined;
  var __inMemoryConversations: MockConversation[] | undefined;
  var __inMemoryMessages: MockMessage[] | undefined;
  var __isInMemoryDbActive: boolean | undefined;
}

const users: MockUser[] = globalThis.__inMemoryUsers ?? [];
const conversations: MockConversation[] = globalThis.__inMemoryConversations ?? [];
const messages: MockMessage[] = globalThis.__inMemoryMessages ?? [];

if (!globalThis.__inMemoryUsers) {
  globalThis.__inMemoryUsers = users;
  const defaultDemoUsers = [
    { displayName: 'Alex Rivera', email: 'alex@pulse.chat' },
    { displayName: 'Sarah Chen', email: 'sarah@pulse.chat' },
    { displayName: 'Jordan Lee', email: 'jordan@pulse.chat' },
  ];
  for (const d of defaultDemoUsers) {
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();
    users.push({
      _id,
      id: _id.toString(),
      displayName: d.displayName,
      email: d.email.toLowerCase(),
      passwordHash: '$2a$12$demoPasswordHashPlaceholder',
      avatarUrl: '',
      lastSeen: now,
      createdAt: now,
      updatedAt: now,
      async comparePassword() { return true; },
      toObject() {
        return {
          id: _id.toString(),
          _id,
          displayName: d.displayName,
          email: d.email.toLowerCase(),
          avatarUrl: '',
          lastSeen: now,
          createdAt: now,
          updatedAt: now,
        };
      },
      toJSON() { return this.toObject(); },
    });
  }
}
if (!globalThis.__inMemoryConversations) globalThis.__inMemoryConversations = conversations;
if (!globalThis.__inMemoryMessages) globalThis.__inMemoryMessages = messages;

export function enableInMemoryDb() {
  globalThis.__isInMemoryDbActive = true;
}

export function isInMemoryDbActive(): boolean {
  return !!globalThis.__isInMemoryDbActive;
}

function createChainableQuery<T>(result: T) {
  const obj = {
    select() { return obj; },
    sort() { return obj; },
    limit() { return obj; },
    populate() { return obj; },
    lean() { return obj; },
    exec: async () => result,
    then: (resolve: (v: T) => void, reject?: (reason: any) => void) => Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

export const inMemoryUserStore = {
  async exists(filter: { email?: string; _id?: any }) {
    const found = users.find(u => {
      if (filter.email && u.email.toLowerCase() === filter.email.toLowerCase()) return true;
      if (filter._id && u._id.toString() === filter._id.toString()) return true;
      return false;
    });
    return found ? { _id: found._id } : null;
  },

  async create(data: { displayName: string; email: string; passwordHash: string; avatarUrl?: string }) {
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();
    const userDoc: MockUser = {
      _id,
      id: _id.toString(),
      displayName: data.displayName,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      avatarUrl: data.avatarUrl || '',
      lastSeen: now,
      createdAt: now,
      updatedAt: now,
      async comparePassword(pwd: string) {
        return bcrypt.compare(pwd, data.passwordHash);
      },
      toObject() {
        return {
          id: _id.toString(),
          _id,
          displayName: data.displayName,
          email: data.email.toLowerCase(),
          avatarUrl: data.avatarUrl || '',
          lastSeen: now,
          createdAt: now,
          updatedAt: now,
        };
      },
      toJSON() {
        return this.toObject();
      },
    };
    users.push(userDoc);
    return userDoc;
  },

  findOne(filter: { email?: string; _id?: any }) {
    const found = users.find(u => {
      if (filter.email && u.email.toLowerCase() === String(filter.email).toLowerCase()) return true;
      if (filter._id && u._id.toString() === String(filter._id)) return true;
      return false;
    }) || null;
    return createChainableQuery(found);
  },

  findById(id: any) {
    const idStr = id?.toString?.() || String(id);
    const found = users.find(u => u._id.toString() === idStr || u.id === idStr) || null;
    return createChainableQuery(found);
  },

  find(filter: Record<string, any> = {}) {
    let res = [...users];

    if (filter._id?.$ne) {
      const neId = filter._id.$ne.toString();
      res = res.filter(u => u._id.toString() !== neId && u.id !== neId);
    }

    if (filter.$or && Array.isArray(filter.$or)) {
      let searchTerm = '';
      for (const cond of filter.$or) {
        if (cond.displayName?.$regex) searchTerm = cond.displayName.$regex;
        else if (cond.email?.$regex) searchTerm = cond.email.$regex;
      }
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        res = res.filter(u =>
          u.displayName.toLowerCase().includes(lower) ||
          u.email.toLowerCase().includes(lower)
        );
      }
    }

    return createChainableQuery(res);
  },

  async findByIdAndUpdate(id: any, update: any, _options?: any) {
    const idStr = id?.toString?.() || String(id);
    const user = users.find(u => u._id.toString() === idStr || u.id === idStr);
    if (user) {
      if (update.lastSeen) user.lastSeen = new Date(update.lastSeen);
      if (update.displayName) user.displayName = update.displayName;
      if (update.avatarUrl !== undefined) user.avatarUrl = update.avatarUrl;
      user.updatedAt = new Date();
    }
    return user || null;
  },
};

export const inMemoryConversationStore = {
  find(filter: Record<string, any> = {}) {
    let res = [...conversations];
    if (filter.members) {
      const memberId = filter.members.toString();
      res = res.filter(c => c.members.some(m => (m as any)._id?.toString() === memberId || m.toString() === memberId));
    }
    return createChainableQuery(res);
  },

  findOne(filter: Record<string, any> = {}) {
    const found = conversations.find(c => {
      if (filter.directKey && c.directKey === filter.directKey) return true;
      if (filter._id && c._id.toString() === filter._id.toString()) return true;
      return false;
    }) || null;
    return createChainableQuery(found);
  },

  findById(id: any) {
    const idStr = id?.toString?.() || String(id);
    const found = conversations.find(c => c._id.toString() === idStr || c.id === idStr) || null;
    return createChainableQuery(found);
  },

  async create(data: any) {
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();
    const members = (data.members || []).map((m: any) =>
      typeof m === 'string' ? new mongoose.Types.ObjectId(m) : (m._id || m)
    );
    const doc: MockConversation = {
      _id,
      id: _id.toString(),
      kind: data.kind,
      members,
      directKey: data.directKey,
      group: data.group,
      lastMessage: data.lastMessage,
      createdAt: now,
      updatedAt: now,
      async populate(_spec?: any) {
        const populatedMembers = doc.members.map(m => {
          const mStr = (m as any)._id?.toString() || m.toString();
          const u = users.find(user => user._id.toString() === mStr || user.id === mStr);
          return u || m;
        });
        doc.members = populatedMembers;

        if (doc.lastMessage) {
          const lmStr = (doc.lastMessage as any)._id?.toString() || doc.lastMessage.toString();
          const lm = messages.find(msg => msg._id.toString() === lmStr || msg.id === lmStr);
          if (lm) {
            await lm.populate('sender');
            doc.lastMessage = lm;
          }
        }
        return doc;
      },
      toObject() {
        return {
          id: _id.toString(),
          _id,
          kind: data.kind,
          members: doc.members,
          directKey: data.directKey,
          group: data.group,
          lastMessage: doc.lastMessage,
          createdAt: now,
          updatedAt: now,
        };
      },
    };
    conversations.push(doc);
    return doc;
  },

  async findByIdAndUpdate(id: any, update: any, _options?: any) {
    const idStr = id?.toString?.() || String(id);
    const conv = conversations.find(c => c._id.toString() === idStr || c.id === idStr);
    if (conv) {
      if (update.lastMessage) conv.lastMessage = update.lastMessage;
      if (update.group) conv.group = { ...conv.group, ...update.group };
      conv.updatedAt = new Date();
    }
    return conv || null;
  },

  async deleteOne(filter: Record<string, any>) {
    const idx = conversations.findIndex(c => {
      if (filter._id && c._id.toString() === filter._id.toString()) return true;
      return false;
    });
    if (idx !== -1) conversations.splice(idx, 1);
    return { deletedCount: idx !== -1 ? 1 : 0 };
  },
};

export const inMemoryMessageStore = {
  find(filter: Record<string, any> = {}) {
    let res = [...messages];
    if (filter.conversation) {
      const convId = filter.conversation.toString();
      res = res.filter(m => m.conversation.toString() === convId);
    }
    return createChainableQuery(res);
  },

  findOne(filter: Record<string, any> = {}) {
    const found = messages.find(m => {
      if (filter._id && m._id.toString() === filter._id.toString()) return true;
      if (filter.conversation && filter.sender && filter.clientMessageId) {
        return (
          m.conversation.toString() === filter.conversation.toString() &&
          m.sender.toString() === filter.sender.toString() &&
          m.clientMessageId === filter.clientMessageId
        );
      }
      return false;
    }) || null;
    return createChainableQuery(found);
  },

  async create(data: any) {
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();
    const convId = typeof data.conversation === 'string' ? new mongoose.Types.ObjectId(data.conversation) : (data.conversation._id || data.conversation);
    const senderId = typeof data.sender === 'string' ? new mongoose.Types.ObjectId(data.sender) : (data.sender._id || data.sender);
    const readBy = (data.readBy || []).map((r: any) => ({
      user: typeof r.user === 'string' ? new mongoose.Types.ObjectId(r.user) : (r.user._id || r.user),
      readAt: r.readAt || now,
    }));

    const msgDoc: MockMessage = {
      _id,
      id: _id.toString(),
      conversation: convId,
      sender: senderId,
      kind: data.kind || 'text',
      content: data.content,
      imageUrl: data.imageUrl,
      clientMessageId: data.clientMessageId,
      readBy,
      createdAt: now,
      updatedAt: now,
      async populate(field: any, _select?: string) {
        if (field === 'sender' || (typeof field === 'object' && field.path === 'sender')) {
          const sStr = (msgDoc.sender as any)._id?.toString() || msgDoc.sender.toString();
          const senderUser = users.find(u => u._id.toString() === sStr || u.id === sStr);
          if (senderUser) {
            msgDoc.sender = senderUser;
          }
        }
        return msgDoc;
      },
      toObject() {
        return {
          id: _id.toString(),
          _id,
          conversation: convId,
          sender: msgDoc.sender,
          kind: data.kind || 'text',
          content: data.content,
          imageUrl: data.imageUrl,
          clientMessageId: data.clientMessageId,
          readBy,
          createdAt: now,
          updatedAt: now,
        };
      },
    };
    messages.push(msgDoc);
    return msgDoc;
  },

  async countDocuments(filter: Record<string, any> = {}) {
    let res = [...messages];
    if (filter.conversation) {
      const convId = filter.conversation.toString();
      res = res.filter(m => m.conversation.toString() === convId);
    }
    if (filter.sender?.$ne) {
      const neSender = filter.sender.$ne.toString();
      res = res.filter(m => {
        const sStr = (m.sender as any)._id?.toString() || m.sender.toString();
        return sStr !== neSender;
      });
    }
    if (filter['readBy.user']?.$ne) {
      const neReadBy = filter['readBy.user'].$ne.toString();
      res = res.filter(m => !m.readBy.some(r => r.user.toString() === neReadBy));
    }
    return res.length;
  },

  async updateMany(filter: Record<string, any>, update: any) {
    let count = 0;
    for (const msg of messages) {
      let matches = true;
      if (filter.conversation && msg.conversation.toString() !== filter.conversation.toString()) matches = false;

      if (matches) {
        if (update.$push?.readBy) {
          const pushItem = update.$push.readBy;
          const uId = typeof pushItem.user === 'string' ? new mongoose.Types.ObjectId(pushItem.user) : pushItem.user;
          if (!msg.readBy.some(r => r.user.toString() === uId.toString())) {
            msg.readBy.push({ user: uId, readAt: pushItem.readAt || new Date() });
          }
        }
        count++;
      }
    }
    return { modifiedCount: count };
  },
};
