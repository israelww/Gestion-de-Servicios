export type UserRole = 'Administrador' | 'Tecnico' | 'Usuario' | string;

const TOKEN_KEY = 'token';
const ROLE_KEY = 'rol';

export function setAuth(token: string, rol: UserRole) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, rol);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRole(): UserRole | null {
  return localStorage.getItem(ROLE_KEY);
}

