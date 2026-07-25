import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCheck, CircleUserRound, LogOut, Menu, MessageCirclePlus, Moon, Paperclip, Plus, Search, SendHorizonal, SmilePlus, Sun, UsersRound, X } from 'lucide-react';
import { chatApi } from './api/chat';
import { assetUrl } from './api/http';
import { AuthScreen } from './components/auth/AuthScreen';
import { Avatar } from './components/Avatar';
import { BrandMark } from './components/BrandMark';
import { LoadingScreen } from './components/LoadingScreen';
import { useAuth } from './context/AuthContext';
import { useChat } from './hooks/useChat';
import { conversationAvatar, conversationOnline, conversationTitle, lastMessagePreview, messageTime, shortTime } from './lib/format';
import type { Conversation, Message, User } from './types/chat';

const EMOJIS = ['🙂', '😂', '❤️', '👍', '🎉', '🔥', '😮', '🙏'];

function ThemeButton(): React.JSX.Element {
  const [dark, setDark] = useState(() => localStorage.getItem('pulse.theme') !== 'light');
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('pulse.theme', dark ? 'dark' : 'light'); }, [dark]);
  return <button onClick={() => setDark((value) => !value)} className="icon-button" aria-label="Toggle color theme">{dark ? <Sun /> : <Moon />}</button>;
}

function ConversationItem({ conversation, currentUser, active, onClick }: { conversation: Conversation; currentUser: User; active: boolean; onClick: () => void }): React.JSX.Element {
  const title = conversationTitle(conversation, currentUser.id);
  const online = conversationOnline(conversation, currentUser.id);
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${active ? 'bg-brand-50 dark:bg-brand-950/45' : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'}`}>
    <Avatar name={title} src={assetUrl(conversationAvatar(conversation, currentUser.id))} online={online} />
    <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{title}</span><span className="shrink-0 text-[11px] text-slate-400">{shortTime(conversation.lastMessage?.createdAt ?? conversation.updatedAt)}</span></span><span className="mt-0.5 flex items-center justify-between gap-2"><span className="truncate text-xs text-slate-500 dark:text-slate-400">{lastMessagePreview(conversation.lastMessage, currentUser.id)}</span>{conversation.unreadCount > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}</span></span>
  </button>;
}

function Composer({ conversationId, sendText, sendImage, setTyping, isUploading }: { conversationId: string; sendText: (id: string, text: string) => Promise<void>; sendImage: (id: string, file: File, caption?: string) => Promise<void>; setTyping: (id: string, value: boolean) => void; isUploading: boolean }): React.JSX.Element {
  const [value, setValue] = useState(''); const [emojisOpen, setEmojisOpen] = useState(false); const fileRef = useRef<HTMLInputElement>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!value.trim()) return; await sendText(conversationId, value); setValue(''); setTyping(conversationId, false); };
  const attach = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; try { await sendImage(conversationId, file, value); setValue(''); } finally { event.target.value = ''; } };
  return <form onSubmit={(event) => void submit(event)} className="relative flex items-end gap-2 border-t border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-5">
    {emojisOpen && <div className="absolute bottom-[4.75rem] left-3 grid grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-card dark:border-slate-700 dark:bg-slate-800">{EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => setValue((text) => text + emoji)} className="rounded-lg p-2 text-lg hover:bg-slate-100 dark:hover:bg-slate-700">{emoji}</button>)}</div>}
    <input ref={fileRef} onChange={(event) => void attach(event)} accept="image/jpeg,image/png,image/gif,image/webp" type="file" className="hidden" />
    <button type="button" onClick={() => fileRef.current?.click()} className="icon-button shrink-0" aria-label="Attach image"><Paperclip /></button>
    <button type="button" onClick={() => setEmojisOpen((open) => !open)} className="icon-button shrink-0" aria-label="Choose emoji"><SmilePlus /></button>
    <textarea value={value} onChange={(event) => { setValue(event.target.value); setTyping(conversationId, Boolean(event.target.value.trim())); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(event); } }} rows={1} placeholder={isUploading ? 'Uploading image…' : 'Write a message'} className="min-h-11 max-h-28 flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand-300 dark:bg-slate-800" />
    <button disabled={isUploading || !value.trim()} className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45" aria-label="Send message"><SendHorizonal className="size-4" /></button>
  </form>;
}

function NewConversationDialog({ onClose, onDirect, onGroup }: { onClose: () => void; onDirect: (id: string) => Promise<unknown>; onGroup: (name: string, ids: string[]) => Promise<unknown> }): React.JSX.Element {
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [search, setSearch] = useState(''); const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]); const [name, setName] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => { if (search.trim()) void chatApi.searchUsers(search).then(setUsers).catch(() => setUsers([])); else setUsers([]); }, 220); return () => window.clearTimeout(timer); }, [search]);
  const choose = async (user: User) => {
    setError('');
    if (mode === 'group') { setSelected((list) => list.some((item) => item.id === user.id) ? list.filter((item) => item.id !== user.id) : [...list, user]); return; }
    setLoading(true); try { await onDirect(user.id); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create conversation.'); } finally { setLoading(false); }
  };
  const createGroup = async () => {
    if (!name.trim() || !selected.length) { setError('Choose a name and at least one member.'); return; }
    setLoading(true); try { await onGroup(name.trim(), selected.map((user) => user.id)); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create group.'); } finally { setLoading(false); }
  };
  return <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
    <section className="w-full max-w-md rounded-3xl bg-white p-5 shadow-float dark:bg-slate-900">
      <header className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Start a conversation</h2><p className="text-xs text-slate-500">Find people by name or email.</p></div><button onClick={onClose} className="icon-button"><X /></button></header>
      <div className="mt-5 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800"><button onClick={() => setMode('direct')} className={`flex-1 rounded-lg py-2 text-sm font-bold ${mode === 'direct' ? 'bg-white dark:bg-slate-700' : 'text-slate-500'}`}>Direct</button><button onClick={() => setMode('group')} className={`flex-1 rounded-lg py-2 text-sm font-bold ${mode === 'group' ? 'bg-white dark:bg-slate-700' : 'text-slate-500'}`}>Group</button></div>
      {mode === 'group' && <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Group name" className="field mt-4" />}
      {mode === 'group' && selected.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{selected.map((user) => <button key={user.id} onClick={() => setSelected((list) => list.filter((item) => item.id !== user.id))} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-200">{user.name} x</button>)}</div>}
      <label className="relative mt-4 block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people" className="field pl-9" /></label>
      <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">{users.map((user) => <button key={user.id} disabled={loading} onClick={() => void choose(user)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><Avatar name={user.name} src={assetUrl(user.avatarUrl)} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{user.name}</span><span className="block truncate text-xs text-slate-500">{user.email}</span></span>{mode === 'group' && <Plus className="size-4 text-brand-600" />}</button>)}{search && !users.length && <p className="p-4 text-center text-sm text-slate-500">No people found.</p>}</div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}{mode === 'group' && <button disabled={loading} onClick={() => void createGroup()} className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">Create group</button>}
    </section>
  </div>;
}

function ChatWorkspace({ session }: { session: { token: string; user: User } }): React.JSX.Element {
  const { logout } = useAuth(); const chat = useChat(session.token, session.user); const [sidebar, setSidebar] = useState(false); const [dialog, setDialog] = useState(false); const messagesEnd = useRef<HTMLDivElement>(null); const markSeenRef = useRef(chat.markSeen);
  const active = chat.conversations.find((item) => item.id === chat.activeConversationId) ?? null;
  const messages = active ? chat.messagesByConversation[active.id] ?? [] : [];
  const typing = active ? chat.typingByConversation[active.id] ?? [] : [];
  const activeId = active?.id;
  useEffect(() => { markSeenRef.current = chat.markSeen; }, [chat.markSeen]);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }); if (activeId) markSeenRef.current(activeId); }, [activeId, messages.length]);
  const title = active ? conversationTitle(active, session.user.id) : '';
  const otherOnline = active ? conversationOnline(active, session.user.id) : false;
  return <main className="h-dvh bg-slate-100 p-0 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-4"><div className="mx-auto flex h-full max-w-[1600px] overflow-hidden bg-white shadow-card dark:bg-slate-900 sm:rounded-3xl"><aside className={`${sidebar ? 'flex' : 'hidden'} absolute inset-y-0 left-0 z-20 w-[86%] max-w-sm flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:static md:flex md:w-[360px] lg:w-[390px]`}><header className="flex items-center justify-between p-4"><BrandMark compact /><div className="flex gap-1"><ThemeButton /><button onClick={() => setDialog(true)} className="icon-button" aria-label="New conversation"><MessageCirclePlus /></button><button onClick={logout} className="icon-button" aria-label="Log out"><LogOut /></button></div></header><div className="px-3 pb-3"><div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-slate-400 dark:bg-slate-800"><Search className="size-4" /><span className="text-sm">Your conversations</span></div></div><div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{chat.isLoadingConversations ? <p className="p-5 text-center text-sm text-slate-500">Loading conversations…</p> : chat.conversations.length ? chat.conversations.map((conversation) => <ConversationItem key={conversation.id} conversation={conversation} currentUser={session.user} active={conversation.id === active?.id} onClick={() => { chat.selectConversation(conversation.id); setSidebar(false); }} />) : <div className="px-8 py-14 text-center"><CircleUserRound className="mx-auto size-10 text-brand-500" /><h2 className="mt-4 font-bold">No conversations yet</h2><p className="mt-1 text-sm text-slate-500">Start one with someone you know.</p><button onClick={() => setDialog(true)} className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white">New conversation</button></div>}</div></aside><section className="flex min-w-0 flex-1 flex-col">{active ? <><header className="flex h-[73px] items-center gap-3 border-b border-slate-200 px-3 dark:border-slate-800 sm:px-5"><button onClick={() => setSidebar(true)} className="icon-button md:hidden" aria-label="Open conversations"><Menu /></button><Avatar name={title} src={assetUrl(conversationAvatar(active, session.user.id))} online={otherOnline} size="sm" /><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-extrabold">{title}</h1><p className="truncate text-xs text-slate-500">{typing.length ? `${typing.map((user) => user.name).join(', ')} typing…` : active.type === 'group' ? `${active.participants.length} members` : otherOnline ? 'Online' : 'Offline'}</p></div><span className={`size-2 rounded-full ${chat.socketConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} title={chat.socketConnected ? 'Realtime connected' : 'Connecting'} /></header><div className="chat-bg min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-7">{chat.isLoadingMessages && !messages.length && <p className="text-center text-sm text-slate-500">Loading messages…</p>}{messages.map((message) => <MessageBubble key={message.id} message={message} own={message.senderId === session.user.id} retry={() => void chat.retryMessage(message)} />)}<div ref={messagesEnd} /></div><Composer conversationId={active.id} sendText={chat.sendText} sendImage={chat.sendImage} setTyping={chat.setTyping} isUploading={chat.isUploading} /></> : <div className="grid flex-1 place-items-center p-8 text-center"><div><div className="mx-auto grid size-16 place-items-center rounded-3xl bg-brand-100 text-brand-700 dark:bg-brand-950"><UsersRound /></div><h1 className="mt-5 text-2xl font-extrabold">Your conversations, in one place.</h1><p className="mt-2 max-w-sm text-sm text-slate-500">Choose a conversation or start a new one to send a message.</p><button onClick={() => setDialog(true)} className="mt-5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white"><MessageCirclePlus className="mr-2 inline size-4" />Start a conversation</button></div></div>}</section></div>{chat.error && <button onClick={chat.clearError} className="fixed bottom-5 right-5 z-40 max-w-sm rounded-xl bg-rose-600 px-4 py-3 text-left text-sm font-semibold text-white shadow-lg">{chat.error} <X className="ml-2 inline size-4" /></button>}{dialog && <NewConversationDialog onClose={() => setDialog(false)} onDirect={chat.createDirect} onGroup={chat.createGroup} />}</main>;
}

function MessageBubble({ message, own, retry }: { message: Message; own: boolean; retry: () => void }): React.JSX.Element {
  return <div className={`mb-2 flex ${own ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[68%] ${own ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-white dark:bg-slate-800'}`}>{message.imageUrl && <img className="mb-2 max-h-72 w-full rounded-xl object-cover" src={assetUrl(message.imageUrl)} alt="Shared attachment" />}{message.content && <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.content}</p>}<div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${own ? 'text-brand-100' : 'text-slate-400'}`}><span>{messageTime(message.createdAt)}</span>{own && <CheckCheck className={`size-3.5 ${message.status === 'seen' ? 'text-sky-200' : ''}`} />}{message.status === 'failed' && <button onClick={retry} className="ml-1 underline">Retry</button>}</div></div></div>;
}

export function App(): React.JSX.Element {
  const { session, isBootstrapping } = useAuth();
  if (isBootstrapping) return <LoadingScreen />;
  return session ? <ChatWorkspace session={session} /> : <AuthScreen />;
}
