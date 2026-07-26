import { request } from './http';
import { normalizeUser } from './auth';
import type { Conversation, Message, PaginatedMessages, User } from '../types/chat';

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
  return value && typeof value === 'object' ? value as RawRecord : {};
}

function asId(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const record = asRecord(value);
  return String(record.id ?? record._id ?? '');
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => {
      const record = asRecord(item);
      return asId(record.userId ?? record.user ?? item);
    }).filter(Boolean)
    : [];
}

export function normalizeMessage(rawValue: unknown): Message {
  const raw = asRecord(rawValue);
  const senderRaw = raw.sender ?? raw.senderId;
  const senderRecord = asRecord(senderRaw);
  const sender = Object.keys(senderRecord).length ? normalizeUser(senderRecord) : undefined;
  const type = raw.type === 'image' || raw.kind === 'image' || raw.messageType === 'image' ? 'image'
    : raw.type === 'system' || raw.kind === 'system' || raw.messageType === 'system' ? 'system'
      : 'text';

  return {
    id: asId(raw.id ?? raw._id) || crypto.randomUUID(),
    clientId: asString(raw.clientId ?? raw.clientMessageId),
    conversationId: asId(raw.conversationId ?? raw.conversation ?? raw.chatId),
    senderId: sender?.id || asId(senderRaw),
    sender,
    type,
    content: asString(raw.content ?? raw.text ?? raw.body ?? raw.message) || '',
    imageUrl: asString(raw.imageUrl ?? raw.image ?? raw.mediaUrl),
    createdAt: asString(raw.createdAt ?? raw.sentAt) || new Date().toISOString(),
    status: raw.status === 'seen' || raw.status === 'delivered' || raw.status === 'failed' || raw.status === 'sending'
      ? raw.status
      : 'sent',
    seenBy: asStringArray(raw.seenBy ?? raw.readBy),
  };
}

export function normalizeConversation(rawValue: unknown): Conversation {
  const raw = asRecord(rawValue);
  const group = asRecord(raw.group);
  const rawParticipants = raw.participants ?? raw.members ?? raw.users ?? [];
  const participants = Array.isArray(rawParticipants)
    ? rawParticipants.map((participant) => normalizeUser(asRecord(asRecord(participant).user ?? participant))).filter((user) => user.id)
    : [];
  const lastMessageValue = raw.lastMessage ?? raw.latestMessage;
  const unread = raw.unreadCount ?? raw.unreadMessages ?? 0;

  return {
    id: asId(raw.id ?? raw._id),
    type: raw.type === 'group' || raw.kind === 'group' || raw.isGroup === true ? 'group' : 'direct',
    name: asString(raw.name ?? raw.title ?? group.name),
    avatarUrl: asString(raw.avatarUrl ?? raw.avatar ?? group.avatarUrl),
    participants,
    createdBy: asId(raw.createdBy),
    lastMessage: lastMessageValue ? normalizeMessage(lastMessageValue) : undefined,
    unreadCount: typeof unread === 'number' ? unread : Number(unread) || 0,
    updatedAt: asString(raw.updatedAt ?? raw.lastActivityAt) || new Date().toISOString(),
  };
}

function unwrapCollection(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const record = asRecord(raw);
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  const data = asRecord(record.data);
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  return [];
}

function unwrapItem(raw: unknown, keys: string[]): unknown {
  const record = asRecord(raw);
  for (const key of keys) {
    if (record[key]) return record[key];
  }
  const data = asRecord(record.data);
  for (const key of keys) {
    if (data[key]) return data[key];
  }
  return raw;
}

export const chatApi = {
  async listConversations(): Promise<Conversation[]> {
    const raw = await request<unknown>('/conversations');
    return unwrapCollection(raw, ['conversations', 'items']).map(normalizeConversation).filter((conversation) => conversation.id);
  },

  async getMessages(conversationId: string, cursor?: string): Promise<PaginatedMessages> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const raw = await request<unknown>(`/conversations/${conversationId}/messages${query}`);
    const record = asRecord(raw);
    const data = asRecord(record.data);
    return {
      messages: unwrapCollection(raw, ['messages', 'items']).map(normalizeMessage),
      nextCursor: asString(record.nextCursor ?? data.nextCursor ?? record.cursor ?? data.cursor),
    };
  },

  async createDirect(participantId: string): Promise<Conversation> {
    const raw = await request<unknown>('/conversations/direct', {
      method: 'POST',
      body: { participantId },
    });
    return normalizeConversation(unwrapItem(raw, ['conversation', 'chat']));
  },

  async createGroup(name: string, memberIds: string[]): Promise<Conversation> {
    const raw = await request<unknown>('/conversations/group', {
      method: 'POST',
      body: { name, memberIds },
    });
    return normalizeConversation(unwrapItem(raw, ['conversation', 'chat']));
  },

  async searchUsers(search: string): Promise<User[]> {
    const raw = await request<unknown>(`/users?search=${encodeURIComponent(search)}`);
    return unwrapCollection(raw, ['users', 'items']).map((user) => normalizeUser(asRecord(user))).filter((user) => user.id);
  },

  async uploadImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const raw = await request<unknown>('/uploads/image', {
            method: 'POST',
            body: { image: base64Data },
          });
          const record = asRecord(raw);
          const data = asRecord(record.data);
          const url = asString(record.url ?? record.imageUrl ?? data.url ?? data.imageUrl) || base64Data;
          resolve(url);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  },
};
