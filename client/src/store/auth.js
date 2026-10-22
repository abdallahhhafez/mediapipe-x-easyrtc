import { create } from 'zustand';
import { api, tokenStore } from '../lib/api';

export const useAuth = create((set) => ({
  user: null,
  token: tokenStore.get(),
  loading: Boolean(tokenStore.get()),

  async restore() {
    if (!tokenStore.get()) return set({ loading: false });
    try {
      const { user } = await api.get('/auth/me');
      set({ user, loading: false });
    } catch {
      tokenStore.clear();
      set({ user: null, token: null, loading: false });
    }
  },

  async login(email, password) {
    const { token, user } = await api.post('/auth/login', { email, password });
    tokenStore.set(token);
    set({ token, user, loading: false });
    return user;
  },

  logout() {
    tokenStore.clear();
    set({ user: null, token: null });
  },
}));

/** Where a signed-in user belongs. Patients never see the ward board. */
export const homeFor = (user) => (user?.role === 'patient' ? '/home' : '/station');
