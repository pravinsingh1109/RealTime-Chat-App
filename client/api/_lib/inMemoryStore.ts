import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
  save(): Promise<MockUser>;
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
  save(): Promise<MockConversation>;
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
  save(): Promise<MockMessage>;
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

if (!globalThis.__inMemoryUsers) globalThis.__inMemoryUsers = users;
if (!globalThis.__inMemoryConversations) globalThis.__inMemoryConversations = conversations;
if (!globalThis.__inMemoryMessages) globalThis.__inMemoryMessages = messages;

const dbFilePath = path.join(os.tmpdir(), 'pulse-chat-db-v1.json');

function buildUserObj(u: any): MockUser {
  const _id = typeof u._id === 'string' ? new mongoose.Types.ObjectId(u._id) : (u._id || new mongoose.Types.ObjectId());
  const now = new Date();
  const created = u.createdAt ? new Date(u.createdAt) : now;
  const updated = u.updatedAt ? new Date(u.updatedAt) : now;
  const lastSeen = u.lastSeen ? new Date(u.lastSeen) : now;

  const doc: MockUser = {
    _id,
    id: _id.toString(),
    displayName: u.displayName,
    email: String(u.email).toLowerCase(),
    passwordHash: u.passwordHash,
    avatarUrl: u.avatarUrl || '',
    lastSeen,
    createdAt: created,
    updatedAt: updated,
    async comparePassword(pwd: string) {
      if (u.passwordHash === '$2a$12$demoPasswordHashPlaceholder') return true;
      return bcrypt.compare(pwd, u.passwordHash);
    },
    async save() {
      doc.updatedAt = new Date();
      savePersistedData();
      return doc;
    },
    toObject() {
      return {
        id: _id.toString(),
        _id,
        displayName: u.displayName,
        email: String(u.email).toLowerCase(),
        avatarUrl: u.avatarUrl || '',
        lastSeen: doc.lastSeen,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
    toJSON() {
      return this.toObject();
    },
  };
  return doc;
}

function buildConvObj(c: any): MockConversation {
  const _id = typeof c._id === 'string' ? new mongoose.Types.ObjectId(c._id) : (c._id || new mongoose.Types.ObjectId());
  const now = new Date();
  const created = c.createdAt ? new Date(c.createdAt) : now;
  const updated = c.updatedAt ? new Date(c.updatedAt) : now;

  const members = (c.members || []).map((m: any) =>
    typeof m === 'string' ? new mongoose.Types.ObjectId(m) : (m._id || m)
  );

  const doc: MockConversation = {
    _id,
    id: _id.toString(),
    kind: c.kind,
    members,
    directKey: c.directKey,
    group: c.group,
    lastMessage: c.lastMessage,
    createdAt: created,
    updatedAt: updated,
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
    async save() {
      doc.updatedAt = new Date();
      savePersistedData();
      return doc;
    },
    toObject() {
      return {
        id: _id.toString(),
        _id,
        kind: c.kind,
        members: doc.members,
        directKey: c.directKey,
        group: c.group,
        lastMessage: doc.lastMessage,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  };
  return doc;
}

function buildMsgObj(m: any): MockMessage {
  const _id = typeof m._id === 'string' ? new mongoose.Types.ObjectId(m._id) : (m._id || new mongoose.Types.ObjectId());
  const now = new Date();
  const created = m.createdAt ? new Date(m.createdAt) : now;
  const updated = m.updatedAt ? new Date(m.updatedAt) : now;

  const convId = typeof m.conversation === 'string' ? new mongoose.Types.ObjectId(m.conversation) : (m.conversation._id || m.conversation);
  const senderId = typeof m.sender === 'string' ? new mongoose.Types.ObjectId(m.sender) : (m.sender._id || m.sender);
  const readBy = (m.readBy || []).map((r: any) => ({
    user: typeof r.user === 'string' ? new mongoose.Types.ObjectId(r.user) : (r.user._id || r.user),
    readAt: r.readAt ? new Date(r.readAt) : now,
  }));

  const msgDoc: MockMessage = {
    _id,
    id: _id.toString(),
    conversation: convId,
    sender: senderId,
    kind: m.kind || 'text',
    content: m.content,
    imageUrl: m.imageUrl,
    clientMessageId: m.clientMessageId,
    readBy,
    createdAt: created,
    updatedAt: updated,
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
    async save() {
      msgDoc.updatedAt = new Date();
      savePersistedData();
      return msgDoc;
    },
    toObject() {
      return {
        id: _id.toString(),
        _id,
        conversation: convId,
        sender: msgDoc.sender,
        kind: m.kind || 'text',
        content: m.content,
        imageUrl: m.imageUrl,
        clientMessageId: m.clientMessageId,
        readBy,
        createdAt: msgDoc.createdAt,
        updatedAt: msgDoc.updatedAt,
      };
    },
  };
  return msgDoc;
}

function loadPersistedData() {
  try {
    if (fs.existsSync(dbFilePath)) {
      const fileContent = fs.readFileSync(dbFilePath, 'utf-8');
      if (fileContent) {
        const parsed = JSON.parse(fileContent);
        if (Array.isArray(parsed.users)) {
          for (const u of parsed.users) {
            if (!users.some(ex => ex._id.toString() === u._id || ex.email.toLowerCase() === String(u.email).toLowerCase())) {
              users.push(buildUserObj(u));
            }
          }
        }
        if (Array.isArray(parsed.conversations)) {
          for (const c of parsed.conversations) {
            if (!conversations.some(ex => ex._id.toString() === c._id)) {
              conversations.push(buildConvObj(c));
            }
          }
        }
        if (Array.isArray(parsed.messages)) {
          for (const m of parsed.messages) {
            if (!messages.some(ex => ex._id.toString() === m._id)) {
              messages.push(buildMsgObj(m));
            }
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }
}

function savePersistedData() {
  try {
    const data = {
      users: users.map(u => ({
        _id: u._id.toString(),
        displayName: u.displayName,
        email: u.email,
        passwordHash: u.passwordHash,
        avatarUrl: u.avatarUrl,
        lastSeen: u.lastSeen,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      conversations: conversations.map(c => ({
        _id: c._id.toString(),
        kind: c.kind,
        members: c.members.map(m => (m as any)._id?.toString() || m.toString()),
        directKey: c.directKey,
        group: c.group,
        lastMessage: (c.lastMessage as any)?._id?.toString() || c.lastMessage?.toString(),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      messages: messages.map(m => ({
        _id: m._id.toString(),
        conversation: (m.conversation as any)._id?.toString() || m.conversation.toString(),
        sender: (m.sender as any)._id?.toString() || m.sender.toString(),
        kind: m.kind,
        content: m.content,
        imageUrl: m.imageUrl,
        clientMessageId: m.clientMessageId,
        readBy: m.readBy.map(r => ({ user: r.user.toString(), readAt: r.readAt })),
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    };
    fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

if (users.length === 0) {
  const defaultDemoUsers = [
    { displayName: 'Alex Rivera', email: 'alex@pulse.chat' },
    { displayName: 'Sarah Chen', email: 'sarah@pulse.chat' },
    { displayName: 'Jordan Lee', email: 'jordan@pulse.chat' },
  ];
  for (const d of defaultDemoUsers) {
    users.push(buildUserObj({
      displayName: d.displayName,
      email: d.email,
      passwordHash: '$2a$12$demoPasswordHashPlaceholder',
    }));
  }
  savePersistedData();
} else {
  loadPersistedData();
}

export function enableInMemoryDb() {
  globalThis.__isInMemoryDbActive = true;
  loadPersistedData();
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
    loadPersistedData();
    const found = users.find(u => {
      if (filter.email && u.email.toLowerCase() === filter.email.toLowerCase()) return true;
      if (filter._id && u._id.toString() === filter._id.toString()) return true;
      return false;
    });
    return found ? { _id: found._id } : null;
  },

  async create(data: { displayName: string; email: string; passwordHash: string; avatarUrl?: string }) {
    loadPersistedData();
    const userDoc = buildUserObj(data);
    users.push(userDoc);
    savePersistedData();
    return userDoc;
  },

  findOne(filter: { email?: string; _id?: any }) {
    loadPersistedData();
    const found = users.find(u => {
      if (filter.email && u.email.toLowerCase() === String(filter.email).toLowerCase()) return true;
      if (filter._id && u._id.toString() === String(filter._id)) return true;
      return false;
    }) || null;
    return createChainableQuery(found);
  },

  findById(id: any) {
    loadPersistedData();
    const idStr = id?.toString?.() || String(id);
    const found = users.find(u => u._id.toString() === idStr || u.id === idStr) || null;
    return createChainableQuery(found);
  },

  find(filter: Record<string, any> = {}) {
    loadPersistedData();
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
    loadPersistedData();
    const idStr = id?.toString?.() || String(id);
    const user = users.find(u => u._id.toString() === idStr || u.id === idStr);
    if (user) {
      if (update.lastSeen) user.lastSeen = new Date(update.lastSeen);
      if (update.displayName) user.displayName = update.displayName;
      if (update.avatarUrl !== undefined) user.avatarUrl = update.avatarUrl;
      user.updatedAt = new Date();
      savePersistedData();
    }
    return user || null;
  },
};

export const inMemoryConversationStore = {
  find(filter: Record<string, any> = {}) {
    loadPersistedData();
    let res = [...conversations];
    if (filter.members) {
      const memberId = filter.members.toString();
      res = res.filter(c => c.members.some(m => (m as any)._id?.toString() === memberId || m.toString() === memberId));
    }
    return createChainableQuery(res);
  },

  findOne(filter: Record<string, any> = {}) {
    loadPersistedData();
    const found = conversations.find(c => {
      if (filter.directKey && c.directKey === filter.directKey) return true;
      if (filter._id && c._id.toString() === filter._id.toString()) return true;
      return false;
    }) || null;
    return createChainableQuery(found);
  },

  findById(id: any) {
    loadPersistedData();
    const idStr = id?.toString?.() || String(id);
    const found = conversations.find(c => c._id.toString() === idStr || c.id === idStr) || null;
    return createChainableQuery(found);
  },

  async create(data: any) {
    loadPersistedData();
    const doc = buildConvObj(data);
    conversations.push(doc);
    savePersistedData();
    return doc;
  },

  async findByIdAndUpdate(id: any, update: any, _options?: any) {
    loadPersistedData();
    const idStr = id?.toString?.() || String(id);
    const conv = conversations.find(c => c._id.toString() === idStr || c.id === idStr);
    if (conv) {
      if (update.lastMessage) conv.lastMessage = update.lastMessage;
      if (update.group) conv.group = { ...conv.group, ...update.group };
      conv.updatedAt = new Date();
      savePersistedData();
    }
    return conv || null;
  },

  async deleteOne(filter: Record<string, any>) {
    loadPersistedData();
    const idx = conversations.findIndex(c => {
      if (filter._id && c._id.toString() === filter._id.toString()) return true;
      return false;
    });
    if (idx !== -1) {
      conversations.splice(idx, 1);
      savePersistedData();
    }
    return { deletedCount: idx !== -1 ? 1 : 0 };
  },
};

export const inMemoryMessageStore = {
  find(filter: Record<string, any> = {}) {
    loadPersistedData();
    let res = [...messages];
    if (filter.conversation) {
      const convId = filter.conversation.toString();
      res = res.filter(m => m.conversation.toString() === convId);
    }
    return createChainableQuery(res);
  },

  findOne(filter: Record<string, any> = {}) {
    loadPersistedData();
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
    loadPersistedData();
    const msgDoc = buildMsgObj(data);
    messages.push(msgDoc);
    savePersistedData();
    return msgDoc;
  },

  async countDocuments(filter: Record<string, any> = {}) {
    loadPersistedData();
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
    loadPersistedData();
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
    if (count > 0) savePersistedData();
    return { modifiedCount: count };
  },
};
