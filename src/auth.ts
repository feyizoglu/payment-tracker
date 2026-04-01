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
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      // Upsert user into our users table
      await supabase.from("users").upsert(
        {
          email: user.email,
          name: user.name,
          avatar_url: user.image,
        },
        { onConflict: "email" }
      );
      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        const { data } = await supabase
          .from("users")
          .select("id")
          .eq("email", session.user.email)
          .single();
        if (data) {
          (session.user as any).id = data.id;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
