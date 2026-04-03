import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      // Upsert user into our users table
      const { data, error } = await supabase.from("users").upsert(
        {
          email: user.email,
          name: user.name,
          avatar_url: user.image,
        },
        { onConflict: "email" }
      ).select("id").single();
      if (error) {
        console.error("signIn upsert error:", error);
      } else {
        console.log("signIn upsert success, user id:", data?.id);
      }
      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        const { data, error } = await supabase
          .from("users")
          .select("id")
          .eq("email", session.user.email)
          .single();
        if (error) {
          console.error("session user lookup error:", error);
        }
        if (data) {
          (session.user as any).id = data.id;
          console.log("session user id set:", data.id);
        } else {
          console.error("session: no user found for email:", session.user.email);
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
