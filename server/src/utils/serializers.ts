import type { Types } from 'mongoose';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  if (value && typeof value === 'object' && 'toObject' in value && typeof value.toObject === 'function') {
    return value.toObject() as UnknownRecord;
  }

  return (value ?? {}) as UnknownRecord;
}

export function serializeId(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && '_id' in value) {
    return serializeId((value as UnknownRecord)._id);
  }

  return String(value as Types.ObjectId);
}

export function serializeUser(value: unknown): {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  lastSeen?: Date | string;
  createdAt?: Date | string;
} {
  const user = asRecord(value);
  const serialized = {
    id: serializeId(user._id ?? user.id),
    displayName: String(user.displayName ?? '')
  } as {
    id: string;
    displayName: string;
    email?: string;
    avatarUrl?: string;
    lastSeen?: Date | string;
    createdAt?: Date | string;
  };

  if (typeof user.email === 'string') serialized.email = user.email;
  if (typeof user.avatarUrl === 'string') serialized.avatarUrl = user.avatarUrl;
  if (user.lastSeen instanceof Date || typeof user.lastSeen === 'string') serialized.lastSeen = user.lastSeen;
  if (user.createdAt instanceof Date || typeof user.createdAt === 'string') serialized.createdAt = user.createdAt;

  return serialized;
}

export function serializeMessage(value: unknown): {
  id: string;
  conversationId: string;
  sender: ReturnType<typeof serializeUser> | string;
  kind: string;
  content?: string;
  imageUrl?: string;
  clientMessageId?: string;
  readBy: Array<{ userId: string; readAt: Date | string }>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
} {
  const message = asRecord(value);
  const rawSender = message.sender;
  const sender = rawSender && typeof rawSender === 'object' && 'displayName' in rawSender
    ? serializeUser(rawSender)
    : serializeId(rawSender);
  const rawReadBy = Array.isArray(message.readBy) ? message.readBy : [];

  const serialized = {
    id: serializeId(message._id ?? message.id),
    conversationId: serializeId(message.conversation),
    sender,
    kind: String(message.kind ?? 'text'),
    readBy: rawReadBy.map((receipt) => {
      const entry = asRecord(receipt);
      return {
        userId: serializeId(entry.user),
        readAt: entry.readAt as Date | string
      };
    })
  } as {
    id: string;
    conversationId: string;
    sender: ReturnType<typeof serializeUser> | string;
    kind: string;
    content?: string;
    imageUrl?: string;
    clientMessageId?: string;
    readBy: Array<{ userId: string; readAt: Date | string }>;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  if (typeof message.content === 'string') serialized.content = message.content;
  if (typeof message.imageUrl === 'string') serialized.imageUrl = message.imageUrl;
  if (typeof message.clientMessageId === 'string') serialized.clientMessageId = message.clientMessageId;
  if (message.createdAt instanceof Date || typeof message.createdAt === 'string') serialized.createdAt = message.createdAt;
  if (message.updatedAt instanceof Date || typeof message.updatedAt === 'string') serialized.updatedAt = message.updatedAt;

  return serialized;
}

export function serializeConversation(value: unknown): {
  id: string;
  kind: string;
  members: Array<ReturnType<typeof serializeUser> | string>;
  group?: { name: string; description?: string; avatarUrl?: string; createdBy: string };
  lastMessage?: ReturnType<typeof serializeMessage> | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
} {
  const conversation = asRecord(value);
  const rawGroup = conversation.group ? asRecord(conversation.group) : undefined;
  const rawMembers = Array.isArray(conversation.members) ? conversation.members : [];
  const rawLastMessage = conversation.lastMessage;
  const serialized = {
    id: serializeId(conversation._id ?? conversation.id),
    kind: String(conversation.kind),
    members: rawMembers.map((member) => {
      return member && typeof member === 'object' && 'displayName' in member
        ? serializeUser(member)
        : serializeId(member);
    })
  } as {
    id: string;
    kind: string;
    members: Array<ReturnType<typeof serializeUser> | string>;
    group?: { name: string; description?: string; avatarUrl?: string; createdBy: string };
    lastMessage?: ReturnType<typeof serializeMessage> | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  if (rawGroup) {
    const group = {
      name: String(rawGroup.name ?? ''),
      createdBy: serializeId(rawGroup.createdBy)
    } as { name: string; description?: string; avatarUrl?: string; createdBy: string };
    if (typeof rawGroup.description === 'string') group.description = rawGroup.description;
    if (typeof rawGroup.avatarUrl === 'string') group.avatarUrl = rawGroup.avatarUrl;
    serialized.group = group;
  }

  if (rawLastMessage) {
    serialized.lastMessage = typeof rawLastMessage === 'object' && 'kind' in rawLastMessage
      ? serializeMessage(rawLastMessage)
      : serializeId(rawLastMessage);
  }
  if (conversation.createdAt instanceof Date || typeof conversation.createdAt === 'string') serialized.createdAt = conversation.createdAt;
  if (conversation.updatedAt instanceof Date || typeof conversation.updatedAt === 'string') serialized.updatedAt = conversation.updatedAt;

  return serialized;
}
