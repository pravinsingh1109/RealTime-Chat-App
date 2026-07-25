import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { chatApi, normalizeMessage } from '../api/chat';
import { apiBaseUrl, assetUrl } from '../api/http';
import { sortConversations } from '../lib/format';
import type { Conversation, Message, MessageKind, SocketAck, User } from '../types/chat';

const socketUrl = import.meta.env.VITE_SOCKET_URL
  || (apiBaseUrl.startsWith('http') ? new URL(apiBaseUrl).origin : window.location.origin);

interface ChatState {
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  activeConversationId: string | null;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isUploading: boolean;
  socketConnected: boolean;
  error: string | null;
  typingByConversation: Record<string, User[]>;
}

const initialState: ChatState = {
  conversations: [],
  messagesByConversation: {},
  activeConversationId: null,
  isLoadingConversations: true,
  isLoadingMessages: false,
  isUploading: false,
  socketConnected: false,
  error: null,
  typingByConversation: {},
};

function makeClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((left, right) => new Date(left.createdAt).valueOf() - new Date(right.createdAt).valueOf());
}

function mergeMessage(existing: Message[], incoming: Message): Message[] {
  const index = existing.findIndex((message) => message.id === incoming.id
    || Boolean(incoming.clientId && message.clientId === incoming.clientId));
  const next = { ...incoming, optimistic: false };
  if (index < 0) return sortMessages([...existing, next]);
  const copy = [...existing];
  copy[index] = { ...copy[index], ...next, optimistic: false };
  return sortMessages(copy);
}

function conversationForMessage(conversation: Conversation, message: Message, currentUserId: string): Conversation {
  const wasUnread = message.senderId !== currentUserId;
  return {
    ...conversation,
    lastMessage: message,
    updatedAt: message.createdAt,
    unreadCount: wasUnread ? conversation.unreadCount + 1 : conversation.unreadCount,
  };
}

function normalizeTypingUser(value: unknown): User | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = String(raw.id ?? raw._id ?? raw.userId ?? '');
  if (!id) return null;
  return {
    id,
    name: String(raw.name ?? raw.username ?? 'Someone'),
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : undefined,
  };
}

export interface ChatActions {
  selectConversation: (conversationId: string) => void;
  createDirect: (participantId: string) => Promise<Conversation>;
  createGroup: (name: string, memberIds: string[]) => Promise<Conversation>;
  sendText: (conversationId: string, content: string) => Promise<void>;
  sendImage: (conversationId: string, file: File, caption?: string) => Promise<void>;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  markSeen: (conversationId: string) => void;
  retryMessage: (message: Message) => Promise<void>;
  clearError: () => void;
  refreshConversations: () => Promise<void>;
}

export function useChat(token: string, currentUser: User): ChatState & ChatActions {
  const [state, setState] = useState<ChatState>(initialState);
  const socketRef = useRef<Socket | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const typingTimerRef = useRef<number | undefined>(undefined);

  const updateConversations = useCallback((updater: (current: Conversation[]) => Conversation[]) => {
    setState((current) => ({ ...current, conversations: sortConversations(updater(current.conversations)) }));
  }, []);

  const refreshConversations = useCallback(async () => {
    setState((current) => ({ ...current, isLoadingConversations: true, error: null }));
    try {
      const conversations = await chatApi.listConversations();
      setState((current) => ({
        ...current,
        conversations: sortConversations(conversations),
        activeConversationId: current.activeConversationId ?? conversations[0]?.id ?? null,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Could not load your conversations.',
      }));
    } finally {
      setState((current) => ({ ...current, isLoadingConversations: false }));
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setState((current) => ({ ...current, isLoadingMessages: true }));
    try {
      const page = await chatApi.getMessages(conversationId);
      setState((current) => ({
        ...current,
        messagesByConversation: {
          ...current.messagesByConversation,
          [conversationId]: sortMessages(page.messages),
        },
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Could not load messages.',
      }));
    } finally {
      setState((current) => ({ ...current, isLoadingMessages: false }));
    }
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    const conversationId = state.activeConversationId;
    if (!conversationId || activeConversationIdRef.current === conversationId) return;
    activeConversationIdRef.current = conversationId;
    socketRef.current?.emit('conversation:join', { conversationId });
    void loadMessages(conversationId);
  }, [state.activeConversationId, loadMessages]);

  const selectConversation = useCallback((conversationId: string) => {
    activeConversationIdRef.current = conversationId;
    setState((current) => ({
      ...current,
      activeConversationId: conversationId,
      conversations: current.conversations.map((conversation) => (
        conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
      )),
    }));
    socketRef.current?.emit('conversation:join', { conversationId });
    void loadMessages(conversationId);
  }, [loadMessages]);

  useEffect(() => {
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    socketRef.current = socket;

    const onConnect = () => {
      setState((current) => ({ ...current, socketConnected: true }));
      if (activeConversationIdRef.current) {
        socket.emit('conversation:join', { conversationId: activeConversationIdRef.current });
      }
    };
    const onDisconnect = () => setState((current) => ({ ...current, socketConnected: false }));

    const onMessage = (payload: unknown) => {
      const message = normalizeMessage(payload);
      if (!message.conversationId) return;
      setState((current) => ({
        ...current,
        messagesByConversation: {
          ...current.messagesByConversation,
          [message.conversationId]: mergeMessage(current.messagesByConversation[message.conversationId] ?? [], message),
        },
        conversations: sortConversations(current.conversations.map((conversation) => {
          if (conversation.id !== message.conversationId) return conversation;
          const updated = conversationForMessage(conversation, message, currentUser.id);
          return conversation.id === activeConversationIdRef.current
            ? { ...updated, unreadCount: 0 }
            : updated;
        })),
      }));
    };

    const onTyping = (payload: unknown, forcedState?: boolean) => {
      const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const conversationId = String(raw.conversationId ?? raw.chatId ?? '');
      const user = normalizeTypingUser(raw.user ?? raw);
      const isTyping = forcedState ?? Boolean(raw.isTyping ?? true);
      if (!conversationId || !user || user.id === currentUser.id) return;
      setState((current) => {
        const typing = current.typingByConversation[conversationId] ?? [];
        const nextTyping = isTyping
          ? [...typing.filter((item) => item.id !== user.id), user]
          : typing.filter((item) => item.id !== user.id);
        return {
          ...current,
          typingByConversation: { ...current.typingByConversation, [conversationId]: nextTyping },
        };
      });
    };

    const onPresence = (payload: unknown) => {
      const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const userId = String(raw.userId ?? raw.id ?? raw._id ?? '');
      const isOnline = Boolean(raw.isOnline ?? raw.online);
      if (!userId) return;
      updateConversations((conversations) => conversations.map((conversation) => ({
        ...conversation,
        participants: conversation.participants.map((participant) => (
          participant.id === userId ? { ...participant, isOnline } : participant
        )),
      })));
    };

    const onOnlineUsers = (userIds: unknown) => {
      if (!Array.isArray(userIds)) return;
      const online = new Set(userIds.map((id) => String(id)));
      updateConversations((conversations) => conversations.map((conversation) => ({
        ...conversation,
        participants: conversation.participants.map((participant) => ({
          ...participant,
          isOnline: online.has(participant.id),
        })),
      })));
    };

    const onSeen = (payload: unknown) => {
      const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const conversationId = String(raw.conversationId ?? raw.chatId ?? '');
      const messageId = String(raw.messageId ?? raw.id ?? '');
      const seenBy = String(raw.userId ?? raw.seenBy ?? '');
      if (!conversationId) return;
      setState((current) => ({
        ...current,
        messagesByConversation: {
          ...current.messagesByConversation,
          [conversationId]: (current.messagesByConversation[conversationId] ?? []).map((message) => (
            !messageId || message.id === messageId
              ? {
                ...message,
                status: message.senderId === currentUser.id ? 'seen' : message.status,
                seenBy: seenBy && !message.seenBy.includes(seenBy) ? [...message.seenBy, seenBy] : message.seenBy,
              }
              : message
          )),
        },
      }));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message:new', onMessage);
    socket.on('new-message', onMessage);
    socket.on('newMessage', onMessage);
    socket.on('typing:update', onTyping);
    socket.on('typing:start', (payload: unknown) => onTyping(payload, true));
    socket.on('typing:stop', (payload: unknown) => onTyping(payload, false));
    socket.on('presence:update', onPresence);
    socket.on('online-users', onOnlineUsers);
    socket.on('message:seen', onSeen);

    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentUser.id, token, updateConversations]);

  const addOrReplaceMessage = useCallback((message: Message) => {
    setState((current) => ({
      ...current,
      messagesByConversation: {
        ...current.messagesByConversation,
        [message.conversationId]: mergeMessage(current.messagesByConversation[message.conversationId] ?? [], message),
      },
      conversations: sortConversations(current.conversations.map((conversation) => (
        conversation.id === message.conversationId
          ? conversationForMessage(conversation, message, currentUser.id)
          : conversation
      ))),
    }));
  }, [currentUser.id]);

  const markFailed = useCallback((clientId: string, conversationId: string, message: string) => {
    setState((current) => ({
      ...current,
      error: message,
      messagesByConversation: {
        ...current.messagesByConversation,
        [conversationId]: (current.messagesByConversation[conversationId] ?? []).map((item) => (
          item.clientId === clientId ? { ...item, status: 'failed', optimistic: false } : item
        )),
      },
    }));
  }, []);

  const sendPayload = useCallback(async (
    conversationId: string,
    content: string,
    type: MessageKind,
    imageUrl?: string,
    retryClientId?: string,
  ) => {
    const socket = socketRef.current;
    const clientId = retryClientId ?? makeClientId();
    const optimistic: Message = {
      id: `optimistic-${clientId}`,
      clientId,
      conversationId,
      senderId: currentUser.id,
      sender: currentUser,
      type,
      content,
      imageUrl: assetUrl(imageUrl),
      createdAt: new Date().toISOString(),
      status: 'sending',
      seenBy: [],
      optimistic: true,
    };
    addOrReplaceMessage(optimistic);

    if (!socket?.connected) {
      markFailed(clientId, conversationId, 'Message not sent — you are offline.');
      return;
    }

    socket.emit('message:send', {
      conversationId,
      content,
      type,
      imageUrl,
      clientId,
    }, (ack: SocketAck | unknown) => {
      const response = ack as SocketAck | undefined;
      if (response?.error) {
        markFailed(clientId, conversationId, response.error);
        return;
      }
      if (response?.message) {
        addOrReplaceMessage(normalizeMessage(response.message));
        return;
      }
      setState((current) => ({
        ...current,
        messagesByConversation: {
          ...current.messagesByConversation,
          [conversationId]: (current.messagesByConversation[conversationId] ?? []).map((message) => (
            message.clientId === clientId && message.status === 'sending'
              ? { ...message, status: 'sent', optimistic: false }
              : message
          )),
        },
      }));
    });
  }, [addOrReplaceMessage, currentUser, markFailed]);

  const sendText = useCallback(async (conversationId: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    await sendPayload(conversationId, trimmed, 'text');
  }, [sendPayload]);

  const sendImage = useCallback(async (conversationId: string, file: File, caption = '') => {
    setState((current) => ({ ...current, isUploading: true, error: null }));
    try {
      const imageUrl = await chatApi.uploadImage(file);
      await sendPayload(conversationId, caption.trim(), 'image', imageUrl);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'The image could not be uploaded.',
      }));
      throw error;
    } finally {
      setState((current) => ({ ...current, isUploading: false }));
    }
  }, [sendPayload]);

  const setTyping = useCallback((conversationId: string, isTyping: boolean) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    socket.emit('typing:update', { conversationId, isTyping });
    if (isTyping) {
      typingTimerRef.current = window.setTimeout(() => {
        socket.emit('typing:update', { conversationId, isTyping: false });
      }, 1200);
    }
  }, []);

  const markSeen = useCallback((conversationId: string) => {
    const ids = state.messagesByConversation[conversationId]
      ?.filter((message) => message.senderId !== currentUser.id && message.status !== 'seen')
      .map((message) => message.id) ?? [];
    if (!ids.length) return;
    socketRef.current?.emit('message:seen', { conversationId, messageIds: ids });
    setState((current) => ({
      ...current,
      messagesByConversation: {
        ...current.messagesByConversation,
        [conversationId]: (current.messagesByConversation[conversationId] ?? []).map((message) => (
          message.senderId === currentUser.id ? message : { ...message, status: 'seen' }
        )),
      },
    }));
  }, [currentUser.id, state.messagesByConversation]);

  const createDirect = useCallback(async (participantId: string) => {
    const conversation = await chatApi.createDirect(participantId);
    updateConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    selectConversation(conversation.id);
    return conversation;
  }, [selectConversation, updateConversations]);

  const createGroup = useCallback(async (name: string, memberIds: string[]) => {
    const conversation = await chatApi.createGroup(name, memberIds);
    updateConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    selectConversation(conversation.id);
    return conversation;
  }, [selectConversation, updateConversations]);

  const retryMessage = useCallback(async (message: Message) => {
    await sendPayload(message.conversationId, message.content, message.type, message.imageUrl);
  }, [sendPayload]);

  const clearError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  return useMemo(() => ({
    ...state,
    selectConversation,
    createDirect,
    createGroup,
    sendText,
    sendImage,
    setTyping,
    markSeen,
    retryMessage,
    clearError,
    refreshConversations,
  }), [state, selectConversation, createDirect, createGroup, sendText, sendImage, setTyping, markSeen, retryMessage, clearError, refreshConversations]);
}
