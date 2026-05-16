import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "supervisor" | "student";
      color?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
