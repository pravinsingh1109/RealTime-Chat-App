import { BrandMark } from './BrandMark';

export function LoadingScreen(): React.JSX.Element {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 px-6 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-5">
        <BrandMark />
        <div className="flex gap-1.5" aria-label="Loading">
          <span className="size-2 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.22s]" />
          <span className="size-2 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.11s]" />
          <span className="size-2 animate-bounce rounded-full bg-brand-500" />
        </div>
      </div>
    </div>
  );
}
