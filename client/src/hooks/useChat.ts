import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { chatApi, normalizeConversation, normalizeMessage } from '../api/chat';
import { assetUrl, request } from '../api/http';
import { sortConversations } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Conversation, Message, MessageKind, User } from '../types/chat';

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

export function useChat(_token: string, currentUser: User): ChatState & ChatActions {
  const [state, setState] = useState<ChatState>(initialState);
  const activeConversationIdRef = useRef<string | null>(null);
  const typingTimerRef = useRef<number | undefined>(undefined);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const userChannelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

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
    void loadMessages(conversationId);
  }, [loadMessages]);

  // Supabase Realtime setup for presence and broadcast messages
  useEffect(() => {
    if (!supabase) {
      setState((current) => ({ ...current, socketConnected: true }));
      return;
    }

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

    const onConversationUpdate = (payload: unknown) => {
      const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      if (raw.conversation) {
        const conversation = normalizeConversation(raw.conversation);
        updateConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      }
    };

    // Presence Channel setup
    const presenceChannel = supabase.channel('online-users', {
      config: { presence: { key: currentUser.id } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = presenceChannel.presenceState();
        const onlineIds = Object.keys(presenceState);
        onOnlineUsers(onlineIds);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        onPresence({ userId: key, isOnline: true });
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        onPresence({ userId: key, isOnline: false });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ userId: currentUser.id, onlineAt: new Date().toISOString() });
          setState((current) => ({ ...current, socketConnected: true }));
        }
      });
    presenceChannelRef.current = presenceChannel;

    // User Channel setup
    const userChannel = supabase.channel(`user:${currentUser.id}`);
    userChannel
      .on('broadcast', { event: 'message:new' }, ({ payload }) => onMessage(payload))
      .on('broadcast', { event: 'typing:update' }, ({ payload }) => onTyping(payload))
      .on('broadcast', { event: 'message:seen' }, ({ payload }) => onSeen(payload))
      .on('broadcast', { event: 'conversation:update' }, ({ payload }) => onConversationUpdate(payload))
      .subscribe();
    userChannelRef.current = userChannel;

    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (presenceChannelRef.current) void presenceChannelRef.current.unsubscribe();
      if (userChannelRef.current) void userChannelRef.current.unsubscribe();
      presenceChannelRef.current = null;
      userChannelRef.current = null;
    };
  }, [currentUser, updateConversations]);

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

    try {
      const rawMessage = await request<unknown>(`/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: {
          kind: type,
          content,
          imageUrl,
          clientMessageId: clientId,
        },
      });

      const record = rawMessage && typeof rawMessage === 'object' ? rawMessage as Record<string, unknown> : {};
      const message = normalizeMessage(record.message ?? rawMessage);
      addOrReplaceMessage(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Message not sent.';
      markFailed(clientId, conversationId, message);
    }
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
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);

    if (supabase) {
      const activeConv = stateRef.current.conversations.find((c) => c.id === conversationId);
      if (activeConv) {
        const otherMembers = activeConv.participants.filter((p) => p.id !== currentUser.id);
        for (const member of otherMembers) {
          const channel = supabase.channel(`user:${member.id}`);
          void channel.send({
            type: 'broadcast',
            event: 'typing:update',
            payload: {
              conversationId,
              user: { id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl },
              isTyping,
            },
          });
        }
      }
    }

    if (isTyping) {
      typingTimerRef.current = window.setTimeout(() => {
        if (supabase) {
          const activeConv = stateRef.current.conversations.find((c) => c.id === conversationId);
          if (activeConv) {
            const otherMembers = activeConv.participants.filter((p) => p.id !== currentUser.id);
            for (const member of otherMembers) {
              const channel = supabase.channel(`user:${member.id}`);
              void channel.send({
                type: 'broadcast',
                event: 'typing:update',
                payload: {
                  conversationId,
                  user: { id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl },
                  isTyping: false,
                },
              });
            }
          }
        }
      }, 1500);
    }
  }, [currentUser]);

  const markSeen = useCallback(async (conversationId: string) => {
    const ids = state.messagesByConversation[conversationId]
      ?.filter((message) => message.senderId !== currentUser.id && message.status !== 'seen')
      .map((message) => message.id) ?? [];
    if (!ids.length) return;

    setState((current) => ({
      ...current,
      messagesByConversation: {
        ...current.messagesByConversation,
        [conversationId]: (current.messagesByConversation[conversationId] ?? []).map((message) => (
          message.senderId === currentUser.id ? message : { ...message, status: 'seen' }
        )),
      },
    }));

    try {
      await request<unknown>(`/conversations/${conversationId}/read`, {
        method: 'POST',
        body: { messageId: ids[ids.length - 1] },
      });
    } catch {
      // Ignore read receipt errors silently
    }
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
    await sendPayload(message.conversationId, message.content, message.type, message.imageUrl, message.clientId);
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
