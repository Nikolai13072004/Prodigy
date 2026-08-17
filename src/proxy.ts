// Next.js 16 uses proxy.ts instead of middleware.ts. This still wires
// NextAuth's authorized callback into the route guard layer.
export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/((?!api/auth|api/health|api/upload|_next/static|_next/image|favicon.ico|uploads|branding).*)"],
};
