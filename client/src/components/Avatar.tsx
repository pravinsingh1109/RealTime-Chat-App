import { assetUrl } from '../api/http';
import { initials, userColor } from '../lib/format';
import type { User } from '../types/chat';

interface AvatarProps {
  user?: Pick<User, 'id' | 'name' | 'avatarUrl' | 'isOnline'>;
  name?: string;
  src?: string;
  online?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'size-8 text-[10px]',
  md: 'size-10 text-xs',
  lg: 'size-12 text-sm',
  xl: 'size-20 text-xl',
};

export function Avatar({ user, name, src, online, size = 'md', className = '' }: AvatarProps): React.JSX.Element {
  const label = name ?? user?.name ?? 'Unknown';
  const image = assetUrl(src ?? user?.avatarUrl);
  const isOnline = online ?? user?.isOnline;
  const fallbackUser = { id: user?.id ?? label, name: label };

  return (
    <div className={`relative shrink-0 ${className}`} aria-label={label} title={label}>
      <div
        className={`${sizes[size]} grid place-items-center overflow-hidden rounded-full font-bold text-white ring-2 ring-white dark:ring-slate-900`}
        style={{ backgroundColor: userColor(fallbackUser) }}
      >
        {image ? <img className="size-full object-cover" src={image} alt="" /> : initials(label)}
      </div>
      {isOnline && (
        <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" aria-label="Online" />
      )}
    </div>
  );
}
