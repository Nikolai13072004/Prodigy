import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    roles?: string[];
    permissions?: string[];
    avatarUrl?: string | null;
    twoFactorVerified?: boolean;
    twoFactorSetupRequired?: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: string;
      roles: string[];
      permissions: string[];
      avatarUrl?: string | null;
      twoFactorVerified?: boolean;
      twoFactorSetupRequired?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    roles?: string[];
    name?: string;
    avatarUrl?: string | null;
    permissions?: string[];
    twoFactorVerified?: boolean;
    twoFactorSetupRequired?: boolean;
    lastActivityAt?: number;
  }
}
