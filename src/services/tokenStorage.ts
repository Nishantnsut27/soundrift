const TOKEN_KEY = 'notify_auth_token';
const REMEMBER_KEY = 'notify_remember_me';

export function getStoredToken(): string | null {
  const remember = localStorage.getItem(REMEMBER_KEY) === 'true';
  if (remember) {
    return localStorage.getItem(TOKEN_KEY);
  }
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function isRememberMe(): boolean {
  return localStorage.getItem(REMEMBER_KEY) === 'true';
}
