import { FormEvent, useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, MessageCircleMore, ShieldCheck, UserRound } from 'lucide-react';
import { BrandMark } from '../BrandMark';
import { useAuth } from '../../context/AuthContext';

type Mode = 'login' | 'register';

const assurances = [
  'Real-time messages, delivered privately',
  'Stay close to the people who matter',
  'Pick up any conversation where you left off',
];

export function AuthScreen(): React.JSX.Element {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isRegister) await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not sign you in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh bg-slate-50 p-3 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-[1280px] overflow-hidden rounded-[2rem] bg-white shadow-float dark:bg-slate-900 sm:min-h-[calc(100dvh-2.5rem)] lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden overflow-hidden bg-brand-800 p-10 text-white lg:flex lg:flex-col xl:p-14">
          <div className="absolute -left-24 top-24 size-72 rounded-full bg-brand-500/30 blur-3xl" />
          <div className="absolute -bottom-40 -right-28 size-[28rem] rounded-full border-[50px] border-brand-600/35" />
          <BrandMark inverted />
          <div className="relative my-auto max-w-md">
            <div className="mb-7 inline-flex size-16 items-center justify-center rounded-3xl bg-white/12 ring-1 ring-white/15">
              <MessageCircleMore className="size-8" />
            </div>
            <h1 className="text-5xl font-black leading-[1.04] tracking-[-0.06em] xl:text-6xl">Everyday conversations, beautifully present.</h1>
            <p className="mt-6 max-w-sm text-lg leading-7 text-brand-100">A calm space for the people, plans, and moments you want to keep close.</p>
            <ul className="mt-10 space-y-4 text-sm font-medium text-brand-50">
              {assurances.map((assurance) => (
                <li key={assurance} className="flex items-center gap-3">
                  <span className="grid size-5 place-items-center rounded-full bg-brand-400 text-brand-950"><Check className="size-3.5" strokeWidth={3} /></span>
                  {assurance}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-sm text-brand-200">Designed for meaningful connection.</p>
        </section>

        <section className="flex min-h-[calc(100dvh-1.5rem)] flex-col px-6 py-7 sm:px-12 sm:py-10 lg:min-h-0 lg:px-14 xl:px-20">
          <div className="flex items-center justify-between lg:hidden"><BrandMark /><span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">Private by design</span></div>
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 lg:py-0">
            <div className="mb-8">
              <div className="mb-4 hidden lg:block"><BrandMark compact /></div>
              <h2 className="text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">{isRegister ? 'Make your space yours.' : 'Welcome back.'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{isRegister ? 'Create an account and start a conversation in seconds.' : 'Sign in to continue your conversations.'}</p>
            </div>

            <div className="mb-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Authentication mode">
              <button type="button" role="tab" aria-selected={!isRegister} onClick={() => switchMode('login')} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${!isRegister ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>Sign in</button>
              <button type="button" role="tab" aria-selected={isRegister} onClick={() => switchMode('register')} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${isRegister ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>Create account</button>
            </div>

            <form className="space-y-4" onSubmit={submit} noValidate>
              {isRegister && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold">Your name</span>
                  <span className="relative block"><UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input required minLength={2} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="How should people know you?" className="auth-input pl-10" /></span>
                </label>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">Email address</span>
                <span className="relative block"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="auth-input pl-10" /></span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">Password</span>
                <span className="relative block"><LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input required minLength={8} type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? 'At least 8 characters' : 'Your password'} className="auth-input pl-10 pr-11" /><button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span>
              </label>
              {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300" role="alert">{error}</p>}
              <button disabled={isSubmitting} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-70" type="submit">{isSubmitting ? 'Just a moment…' : isRegister ? 'Create account' : 'Sign in'} {!isSubmitting && <ArrowRight className="size-4" />}</button>
            </form>
            <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs leading-5 text-slate-400"><ShieldCheck className="size-4 text-brand-600" /> Your messages stay between you and your people.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
