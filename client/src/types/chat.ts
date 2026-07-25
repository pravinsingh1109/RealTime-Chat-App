export type ConversationKind = 'direct' | 'group';
export type MessageKind = 'text' | 'image' | 'system';
export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';

export interface User {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  about?: string;
  isOnline?: boolean;
  lastSeenAt?: string;
}

export interface Conversation {
  id: string;
  type: ConversationKind;
  name?: string;
  avatarUrl?: string;
  participants: User[];
  createdBy?: string;
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: string;
}

export interface Message {
  id: string;
  clientId?: string;
  conversationId: string;
  senderId: string;
  sender?: User;
  type: MessageKind;
  content: string;
  imageUrl?: string;
  createdAt: string;
  status: DeliveryStatus;
  seenBy: string[];
  optimistic?: boolean;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface PaginatedMessages {
  messages: Message[];
  nextCursor?: string;
}

export interface SocketAck {
  message?: unknown;
  error?: string;
}
