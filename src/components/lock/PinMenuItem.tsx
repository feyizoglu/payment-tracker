"use client";

import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import PinSettings from "./PinSettings";

export default function PinMenuItem() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
      >
        <KeyRound className="w-4 h-4" />
        {t.pinTitle}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{t.pinTitle}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.cancel} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <PinSettings onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
