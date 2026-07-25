import type { Conversation, Message, User } from '../types/chat';

export function initials(name?: string): string {
  if (!name) return '?';
  const pieces = name.trim().split(/\s+/).filter(Boolean);
  return pieces.slice(0, 2).map((piece) => piece[0]?.toUpperCase()).join('') || '?';
}

export function conversationTitle(conversation: Conversation, currentUserId: string): string {
  if (conversation.type === 'group') return conversation.name || 'Untitled group';
  const other = conversation.participants.find((participant) => participant.id !== currentUserId);
  return other?.name || 'You';
}

export function conversationAvatar(conversation: Conversation, currentUserId: string): string | undefined {
  if (conversation.avatarUrl) return conversation.avatarUrl;
  if (conversation.type === 'group') return undefined;
  return conversation.participants.find((participant) => participant.id !== currentUserId)?.avatarUrl;
}

export function conversationOnline(conversation: Conversation, currentUserId: string): boolean {
  return conversation.type === 'direct'
    && Boolean(conversation.participants.find((participant) => participant.id !== currentUserId)?.isOnline);
}

export function shortTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  const daysAgo = Math.floor((now.valueOf() - date.valueOf()) / 86_400_000);
  if (daysAgo < 7) return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date);
}

export function messageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function lastMessagePreview(message?: Message, currentUserId?: string): string {
  if (!message) return 'No messages yet';
  const prefix = currentUserId && message.senderId === currentUserId ? 'You: ' : '';
  if (message.type === 'image') return `${prefix}📷 Photo`;
  if (message.type === 'system') return message.content;
  return `${prefix}${message.content}`;
}

export function userColor(user: Pick<User, 'id' | 'name'>): string {
  const palette = ['#0f766e', '#2563eb', '#7c3aed', '#c2410c', '#be185d', '#0369a1'];
  const seed = Array.from(user.id || user.name).reduce((total, character) => total + character.charCodeAt(0), 0);
  return palette[seed % palette.length] ?? palette[0];
}

export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((left, right) => {
    const leftTime = new Date(left.lastMessage?.createdAt ?? left.updatedAt).valueOf();
    const rightTime = new Date(right.lastMessage?.createdAt ?? right.updatedAt).valueOf();
    return rightTime - leftTime;
  });
}
