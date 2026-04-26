import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AuthUser } from '@/types/auth';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  rememberMe: boolean;
  hydrated: boolean;
  setAuth: (user: AuthUser, token: string, refreshToken?: string | null, rememberMe?: boolean) => void;
  updateUser: (userPatch: Partial<AuthUser>) => void;
  clearAuth: () => void;
  setHydrated: (hydrated: boolean) => void;
  isAuthenticated: () => boolean;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      rememberMe: false,
      hydrated: false,
      setAuth: (user, token, refreshToken = null, rememberMe = false) => set({ user, token, refreshToken, rememberMe }),
      updateUser: (userPatch) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userPatch } : state.user,
        })),
      clearAuth: () => set({ user: null, token: null, refreshToken: null, rememberMe: false }),
      setHydrated: (hydrated) => set({ hydrated }),
      isAuthenticated: () => Boolean(get().user && get().token),
      hasRole: (role) => get().user?.roles?.some((currentRole) => currentRole.name === role) ?? false,
    }),
    {
      name: 'ai-pro-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        rememberMe: state.rememberMe,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
