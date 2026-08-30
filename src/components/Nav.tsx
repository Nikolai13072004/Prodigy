import { auth } from "@/auth";
import { NavClient } from "@/components/NavClient";

export async function Nav() {
  const session = await auth();
  return (
    <NavClient
      displayName={session?.user?.name ?? null}
      email={session?.user?.email ?? null}
      role={session?.user?.role ?? null}
      roles={session?.user?.roles ?? []}
    />
  );
}
