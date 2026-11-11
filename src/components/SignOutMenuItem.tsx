"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { signOutWithPushCleanup } from "@/lib/web-push-client";

export default function SignOutMenuItem() {
  const { t } = useLang();
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setFailed(false);
    try {
      await signOutWithPushCleanup();
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <button
        onClick={signOut}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition"
      >
        <LogOut className="w-4 h-4" />
        {t.signOut}
      </button>
      {failed && (
        <p role="alert" className="px-3 pb-2 text-sm text-red-600">
          {t.loadFailed}
        </p>
      )}
    </>
  );
}
