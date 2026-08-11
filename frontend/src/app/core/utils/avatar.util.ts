const AVATAR_COLOR_TOKEN_COUNT = 8;

export function getUserInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return (name.trim().slice(0, 2) || '?').toUpperCase();
}

/** Deterministic avatar color, resolved via the theme's --avatar-color-* tokens (see custom-theme.scss). */
export function getUserAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const tokenIndex = (hash % AVATAR_COLOR_TOKEN_COUNT) + 1;
  return `var(--avatar-color-${tokenIndex})`;
}
