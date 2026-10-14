import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type AuthActionResult = {
  error: Error | null;
};

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
