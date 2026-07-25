import { MessageCircleMore } from 'lucide-react';

interface BrandMarkProps {
  compact?: boolean;
  inverted?: boolean;
}

export function BrandMark({ compact = false, inverted = false }: BrandMarkProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`grid size-10 place-items-center rounded-2xl shadow-sm ${inverted ? 'bg-white/16 text-white ring-1 ring-white/20' : 'bg-brand-600 text-white'}`}>
        <MessageCircleMore className="size-5" strokeWidth={2.35} aria-hidden="true" />
      </div>
      {!compact && (
        <span className={`text-xl font-extrabold tracking-[-0.05em] ${inverted ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
          pulse<span className={inverted ? 'text-brand-200' : 'text-brand-600'}>·</span>
        </span>
      )}
    </div>
  );
}
