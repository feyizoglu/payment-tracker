"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CreditCard, Users, Calendar, TrendingDown } from "lucide-react";
import { useLang } from "@/lib/i18n";

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <CreditCard className="w-7 h-7 text-blue-600" />
          <span className="text-xl font-bold text-gray-900">PayTrack</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "tr" : "en")}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            {lang === "en" ? "🇹🇷 TR" : "🇬🇧 EN"}
          </button>
          <button
            onClick={() => signIn("google")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition"
          >
            <GoogleIcon />
            {t.signIn}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
          <span>{t.teamPaymentTracking}</span>
        </div>
        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
          {t.heroTitle1}
          <br />
          <span className="text-blue-600">{t.heroTitle2}</span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">{t.heroDesc}</p>
        <button
          onClick={() => signIn("google")}
          className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-blue-600 text-white font-semibold text-lg shadow-lg hover:bg-blue-700 transition"
        >
          <GoogleIcon white />
          {t.getStarted}
        </button>
      </main>

      <section className="max-w-5xl mx-auto px-6 pb-24 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { icon: <CreditCard className="w-6 h-6 text-blue-500" />, title: t.featureAddTitle, desc: t.featureAddDesc },
          { icon: <Calendar className="w-6 h-6 text-green-500" />, title: t.featureMonthlyTitle, desc: t.featureMonthlyDesc },
          { icon: <TrendingDown className="w-6 h-6 text-purple-500" />, title: t.featureTrackTitle, desc: t.featureTrackDesc },
          { icon: <Users className="w-6 h-6 text-orange-500" />, title: t.featureTeamTitle, desc: t.featureTeamDesc },
        ].map((f) => (
          <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="mb-3">{f.icon}</div>
            <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
            <p className="text-sm text-gray-500">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function GoogleIcon({ white }: { white?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill={white ? "#fff" : "#4285F4"} />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill={white ? "#ddd" : "#34A853"} />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill={white ? "#ddd" : "#FBBC05"} />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill={white ? "#ddd" : "#EA4335"} />
    </svg>
  );
}
