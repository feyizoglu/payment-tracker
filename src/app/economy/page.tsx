"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Asset, Currency, FiatCurrency, GoldType, ExchangeRates, Team } from "@/types";
import { useLang } from "@/lib/i18n";
import {
  CreditCard,
  LogOut,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Plus,
  Trash2,
  Pencil,
  Landmark,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import TeamPanel from "@/components/TeamPanel";

// ── Constants ─────────────────────────────────────────────────────────────────

const FIAT_CURRENCIES: FiatCurrency[] = ["USD", "EUR", "GBP", "TRY"];

const GOLD_TYPES: { value: GoldType; labelKey: string; unit: "gr" | "adet" }[] = [
  { value: "BILEZIK",      labelKey: "goldBilezik",     unit: "gr"   },
  { value: "GRAM_ALTIN",   labelKey: "goldGram",        unit: "gr"   },
  { value: "CEYREK_ALTIN", labelKey: "goldCeyrek",      unit: "adet" },
  { value: "YARIM_ALTIN",  labelKey: "goldYarim",       unit: "adet" },
  { value: "TAM_ALTIN",    labelKey: "goldTam",         unit: "adet" },
];

const FIAT_SYMBOLS: Record<FiatCurrency, string> = {
  USD: "$", EUR: "€", GBP: "£", TRY: "₺",
};

function isGoldType(c: Currency): c is GoldType {
  return ["BILEZIK", "GRAM_ALTIN", "CEYREK_ALTIN", "YARIM_ALTIN", "TAM_ALTIN"].includes(c);
}

function goldUnit(c: GoldType): "gr" | "adet" {
  return (c === "BILEZIK" || c === "GRAM_ALTIN") ? "gr" : "adet";
}

function formatAmount(amount: number, currency: Currency): string {
  if (isGoldType(currency)) {
    const unit = goldUnit(currency);
    return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unit}`;
  }
  const sym = FIAT_SYMBOLS[currency as FiatCurrency];
  return `${sym}${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPreferred(amount: number, currency: FiatCurrency): string {
  const sym = FIAT_SYMBOLS[currency];
  return `${sym}${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Converts any currency/gold amount to USD using the rates object
function toUSD(amount: number, currency: Currency, rates: ExchangeRates): number {
  return amount * rates[currency];
}

// Converts USD to a fiat preferred currency
function fromUSD(usd: number, target: FiatCurrency, rates: ExchangeRates): number {
  return usd / rates[target];
}

function groupByBank(assets: Asset[]): { bankName: string; assets: Asset[] }[] {
  const map = new Map<string, Asset[]>();
  for (const a of assets) {
    const list = map.get(a.bank_name) ?? [];
    list.push(a);
    map.set(a.bank_name, list);
  }
  return Array.from(map.entries()).map(([bankName, assets]) => ({ bankName, assets }));
}

const PALETTE = ["#3B82F6","#8B5CF6","#F59E0B","#EF4444","#10B981","#EC4899","#F97316","#14B8A6"];
function hashColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Economy() {
  const { data: session, status } = useSession();
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesStatus, setRatesStatus] = useState<"idle" | "ok" | "error">("idle");

  const [preferredCurrency, setPreferredCurrency] = useState<FiatCurrency>("USD");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const [showAddForm, setShowAddForm] = useState(false);
  const [addToBankName, setAddToBankName] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTeamsPanel, setShowTeamsPanel] = useState(false);
  const [showManualGold, setShowManualGold] = useState(false);
  const [myColor, setMyColor] = useState<string | null>(null);

  // Persist preferred currency + restore cached rates
  useEffect(() => {
    const saved = localStorage.getItem("economy_preferred_currency") as FiatCurrency | null;
    if (saved && FIAT_CURRENCIES.includes(saved)) setPreferredCurrency(saved);

    const cachedRates = localStorage.getItem("economy_rates");
    if (cachedRates) {
      try {
        setRates(JSON.parse(cachedRates));
        setRatesStatus("ok");
      } catch {
        // ignore malformed cache
      }
    }
  }, []);
  useEffect(() => {
    localStorage.setItem("economy_preferred_currency", preferredCurrency);
  }, [preferredCurrency]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  const fetchAssets = useCallback(async () => {
    const res = await fetch("/api/assets");
    if (res.ok) setAssets(await res.json());
  }, []);

  const fetchTeams = useCallback(async () => {
    const res = await fetch("/api/teams");
    if (res.ok) setTeams(await res.json());
  }, []);

  const fetchRates = useCallback(async () => {
    setRatesLoading(true);
    setRatesStatus("idle");
    try {
      const res = await fetch("/api/exchange-rates");
      if (res.ok) {
        const data = await res.json();
        if (data.error) setRatesStatus("error");
        else {
          setRates(data);
          setRatesStatus("ok");
          localStorage.setItem("economy_rates", JSON.stringify(data));
        }
      } else {
        setRatesStatus("error");
      }
    } catch {
      setRatesStatus("error");
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchAssets();
      fetchTeams();
    }
  }, [status, fetchAssets, fetchTeams]);

  useEffect(() => {
    if (teams.length > 0 && session?.user) {
      const uid = (session.user as any).id;
      for (const team of teams) {
        const me = team.members?.find((m) => m.user_id === uid);
        if (me?.user && (me.user as any).color) {
          setMyColor((me.user as any).color);
          break;
        }
      }
    }
  }, [teams, session]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const filteredAssets = assets.filter((a) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "personal") return !a.team_id;
    return a.team_id === activeFilter;
  });

  // Total in preferred currency (skip gold if rates unavailable)
  const totalInPreferred =
    rates
      ? filteredAssets.reduce((sum, asset) => {
          if (isGoldType(asset.currency) && rates.goldError) return sum;
          const usd = toUSD(asset.amount, asset.currency, rates);
          return sum + fromUSD(usd, preferredCurrency, rates);
        }, 0)
      : null;

  const filters = [
    { id: "all", label: t.all },
    { id: "personal", label: t.personal },
    ...teams.map((team) => ({ id: team.id, label: team.name })),
  ];

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-US", {
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-blue-600" />
              <span className="font-bold text-gray-900">PayTrack</span>
            </div>
            <nav className="flex items-center gap-1">
              <Link
                href="/dashboard"
                className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition font-medium"
              >
                {t.dashboard}
              </Link>
              <span className="px-3 py-1.5 rounded-lg text-sm text-green-700 bg-green-50 font-semibold">
                {t.economy}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === "en" ? "tr" : "en")}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              {lang === "en" ? "🇹🇷 TR" : "🇬🇧 EN"}
            </button>

            <button
              onClick={() => setShowTeamsPanel(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:block">{t.teams}</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
              >
                {session?.user?.image ? (
                  <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs">
                    {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
                  </div>
                )}
                <span className="hidden sm:block truncate max-w-[120px]">
                  {session?.user?.name ?? session?.user?.email}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-900 truncate">{session?.user?.name}</p>
                    <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    {t.signOut}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Total + Controls */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6">
          <div className="flex-1 bg-green-50 rounded-xl p-4">
            <p className="text-xs font-medium text-green-700 opacity-70 mb-1">{t.totalAssets}</p>
            <p className="text-3xl font-bold text-green-700">
              {rates && totalInPreferred !== null
                ? formatPreferred(totalInPreferred, preferredCurrency)
                : "—"}
            </p>
            {rates?.goldError && (
              <p className="text-xs text-amber-500 mt-1">{t.goldError}</p>
            )}
            {!rates && (
              <p className="text-xs text-gray-400 mt-1">{t.refreshRates}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            {/* Preferred currency */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">{t.preferredCurrency}:</span>
              <div className="flex gap-1">
                {FIAT_CURRENCIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPreferredCurrency(c)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                      preferredCurrency === c
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-green-400 hover:text-green-700"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Refresh rates */}
            <div className="flex items-center gap-2">
              {rates && ratesStatus === "ok" && (
                <span className="text-xs text-gray-400">
                  {t.ratesLastUpdated}: {fmtTime(rates.fetchedAt)}
                </span>
              )}
              {ratesStatus === "error" && (
                <span className="text-xs text-red-500">{t.ratesError}</span>
              )}
              <button
                onClick={fetchRates}
                disabled={ratesLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${ratesLoading ? "animate-spin" : ""}`} />
                {t.refreshRates}
              </button>
              <button
                onClick={() => setShowManualGold(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 text-sm font-medium text-amber-700 hover:bg-amber-50 transition"
              >
                <Pencil className="w-4 h-4" />
                {t.enterGoldManually}
              </button>
            </div>
          </div>
        </div>

        {/* Filter chips + Add button */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                  activeFilter === f.id
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-green-300 hover:text-green-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t.addAsset}
          </button>
        </div>

        {/* Assets list */}
        {filteredAssets.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{t.noAssets}</p>
            <p className="text-sm mt-1">{t.noAssetsHint}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupByBank(filteredAssets).map(({ bankName, assets: bankAssets }) => {
              const currentUserId = (session?.user as any)?.id;
              return (
                <BankGroup
                  key={bankName}
                  bankName={bankName}
                  assets={bankAssets}
                  rates={rates}
                  preferredCurrency={preferredCurrency}
                  currentUserId={currentUserId}
                  teams={teams}
                  onUpdated={fetchAssets}
                  onDeleted={fetchAssets}
                  onAddToBank={() => { setAddToBankName(bankName); setShowAddForm(true); }}
                  t={t}
                />
              );
            })}
          </div>
        )}
      </main>

      {showManualGold && (
        <ManualGoldModal
          rates={rates}
          onClose={() => setShowManualGold(false)}
          onApply={(updatedRates) => {
            setRates(updatedRates);
            setRatesStatus("ok");
            localStorage.setItem("economy_rates", JSON.stringify(updatedRates));
            setShowManualGold(false);
          }}
          t={t}
        />
      )}

      {showAddForm && (
        <AddAssetForm
          teams={teams}
          currentUserId={(session?.user as any)?.id}
          defaultBankName={addToBankName ?? undefined}
          onClose={() => { setShowAddForm(false); setAddToBankName(null); }}
          onCreated={fetchAssets}
          t={t}
        />
      )}

      {showTeamsPanel && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                {t.manageTeams}
              </h2>
              <button
                onClick={() => setShowTeamsPanel(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-5">
              <TeamPanel
                teams={teams}
                currentUserId={(session?.user as any)?.id}
                currentUserColor={myColor}
                onCreated={() => { fetchTeams(); }}
                onColorChanged={(color) => setMyColor(color)}
              />
            </div>
          </div>
          <div className="fixed inset-0 bg-black/30 -z-10" onClick={() => setShowTeamsPanel(false)} />
        </div>
      )}

      {showUserMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
      )}
    </div>
  );
}

// ── Asset Card ────────────────────────────────────────────────────────────────

function getGoldLabel(currency: GoldType, t: any): string {
  const map: Record<GoldType, string> = {
    BILEZIK: t.goldBilezik,
    GRAM_ALTIN: t.goldGram,
    CEYREK_ALTIN: t.goldCeyrek,
    YARIM_ALTIN: t.goldYarim,
    TAM_ALTIN: t.goldTam,
  };
  return map[currency];
}

function getCurrencyLabel(currency: Currency, t: any): string {
  if (isGoldType(currency)) return getGoldLabel(currency, t);
  const labels: Record<FiatCurrency, string> = {
    USD: "US Dollar", EUR: "Euro", GBP: "British Pound", TRY: "Türk Lirası",
  };
  return labels[currency as FiatCurrency];
}

// ── Bank Group ────────────────────────────────────────────────────────────────

function BankGroup({
  bankName,
  assets,
  rates,
  preferredCurrency,
  currentUserId,
  teams,
  onUpdated,
  onDeleted,
  onAddToBank,
  t,
}: {
  bankName: string;
  assets: Asset[];
  rates: ExchangeRates | null;
  preferredCurrency: FiatCurrency;
  currentUserId?: string;
  teams: Team[];
  onUpdated: () => void;
  onDeleted: () => void;
  onAddToBank: () => void;
  t: any;
}) {
  const [expanded, setExpanded] = useState(true);

  const bankTotal = rates
    ? assets.reduce((sum, a) => {
        if (isGoldType(a.currency) && rates.goldError) return sum;
        return sum + fromUSD(toUSD(a.amount, a.currency, rates), preferredCurrency, rates);
      }, 0)
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Bank header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-gray-50 transition"
        onClick={() => setExpanded((v) => !v)}>
        <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center shrink-0">
          <Landmark className="w-4 h-4 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{bankName}</p>
          <p className="text-xs text-gray-400">{assets.length} {assets.length === 1 ? "hesap" : "hesap"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {bankTotal !== null && (
            <span className="text-sm font-bold text-green-700">
              {formatPreferred(bankTotal, preferredCurrency)}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onAddToBank(); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition"
            title={t.addAsset}
          >
            <Plus className="w-4 h-4" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Asset rows */}
      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {assets.map((asset) => {
            const isOwner = asset.user_id === currentUserId;
            const isTeamAdmin = asset.team_id
              ? teams.find((tm) => tm.id === asset.team_id)?.members?.find(
                  (m) => m.user_id === currentUserId
                )?.role === "owner"
              : false;
            return (
              <AssetRow
                key={asset.id}
                asset={asset}
                rates={rates}
                preferredCurrency={preferredCurrency}
                canManage={isOwner || isTeamAdmin}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
                t={t}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Asset Row ─────────────────────────────────────────────────────────────────

function AssetRow({
  asset,
  rates,
  preferredCurrency,
  canManage,
  onUpdated,
  onDeleted,
  t,
}: {
  asset: Asset;
  rates: ExchangeRates | null;
  preferredCurrency: FiatCurrency;
  canManage: boolean;
  onUpdated: () => void;
  onDeleted: () => void;
  t: any;
}) {
  const [deleting, setDeleting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const goldUnavailable = isGoldType(asset.currency) && rates?.goldError;

  let convertedValue: string | null = null;
  if (rates && !goldUnavailable && asset.currency !== preferredCurrency) {
    const usd = toUSD(asset.amount, asset.currency, rates);
    convertedValue = formatPreferred(fromUSD(usd, preferredCurrency, rates), preferredCurrency);
  }

  const owner = asset.user as any;
  const ownerColor = owner?.color ?? hashColor(asset.user_id);

  async function handleDelete() {
    if (!confirm(t.deleteAsset + "?")) return;
    setDeleting(true);
    await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Owner avatar */}
        <div className="shrink-0">
          {owner?.avatar_url ? (
            <img src={owner.avatar_url} alt="" className="w-7 h-7 rounded-full" />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: ownerColor }}
            >
              {(owner?.name ?? owner?.email ?? "?")[0].toUpperCase()}
            </div>
          )}
        </div>

        {/* Owner name + currency badge */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-700 truncate">
              {owner?.name ?? owner?.email ?? "—"}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-100">
              {getCurrencyLabel(asset.currency, t)}
            </span>
          </div>
        </div>

        {/* Amount + converted */}
        <div className="text-right shrink-0">
          <p className="font-semibold text-gray-900 text-sm">{formatAmount(asset.amount, asset.currency)}</p>
          {convertedValue && (
            <p className="text-xs text-gray-400 flex items-center justify-end gap-0.5">
              <TrendingUp className="w-3 h-3" />
              {convertedValue}
            </p>
          )}
          {goldUnavailable && (
            <p className="text-xs text-amber-500">{t.goldError}</p>
          )}
        </div>

        {/* Actions */}
        {canManage && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setShowEdit(true)}
              disabled={deleting}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition disabled:opacity-40"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {showEdit && (
        <EditAssetModal
          asset={asset}
          onClose={() => setShowEdit(false)}
          onSaved={() => { onUpdated(); setShowEdit(false); }}
          t={t}
        />
      )}
    </>
  );
}

// ── Edit Asset Modal ──────────────────────────────────────────────────────────

function EditAssetModal({
  asset,
  onClose,
  onSaved,
  t,
}: {
  asset: Asset;
  onClose: () => void;
  onSaved: () => void;
  t: any;
}) {
  const [bankName, setBankName] = useState(asset.bank_name);
  const [amount, setAmount] = useState(String(asset.amount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGold = isGoldType(asset.currency);
  const unit = isGold ? goldUnit(asset.currency as GoldType) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bank_name: bankName.trim(), amount: Number(amount) }),
    });
    if (res.ok) onSaved();
    else { const d = await res.json(); setError(d.error ?? "Error"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Pencil className="w-5 h-5 text-green-600" />
            {t.editAsset}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.bankName}</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {isGold ? `${t.amount} (${unit})` : t.amount}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                {isGold ? unit : FIAT_SYMBOLS[asset.currency as FiatCurrency]}
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="any"
                required
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition disabled:opacity-60"
            >
              {saving ? "…" : t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add Asset Form ─────────────────────────────────────────────────────────────

function AddAssetForm({
  teams,
  currentUserId,
  defaultBankName,
  onClose,
  onCreated,
  t,
}: {
  teams: Team[];
  currentUserId?: string;
  defaultBankName?: string;
  onClose: () => void;
  onCreated: () => void;
  t: any;
}) {
  const [bankName, setBankName] = useState(defaultBankName ?? "");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [teamId, setTeamId] = useState<string>("");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTeam = teams.find((tm) => tm.id === teamId);
  const isOwner = !!selectedTeam?.members?.some(
    (m) => m.user_id === currentUserId && m.role === "owner"
  );
  const otherMembers = selectedTeam?.members?.filter((m) => m.user_id !== currentUserId) ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bankName.trim() || !amount || Number(amount) <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_name: bankName.trim(),
          currency,
          amount: Number(amount),
          team_id: teamId || null,
          target_user_id: targetUserId || undefined,
        }),
      });
      if (res.ok) { onCreated(); onClose(); }
      else { const d = await res.json(); setError(d.error ?? "Error"); }
    } finally {
      setSaving(false);
    }
  }

  const isGold = isGoldType(currency);
  const unit = isGold ? goldUnit(currency as GoldType) : null;

  const amountLabel = isGold
    ? `${t.amount} (${unit})`
    : t.amount;

  const amountPrefix = isGold
    ? unit
    : FIAT_SYMBOLS[currency as FiatCurrency];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Landmark className="w-5 h-5 text-green-600" />
            {t.addAssetTitle}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Bank name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.bankName}</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder={t.bankNamePlaceholder}
              required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          {/* Currency — fiat */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.currency}</label>
            <div className="flex gap-2 flex-wrap">
              {FIAT_CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition ${
                    currency === c
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-green-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Gold types */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.goldTypeLabel}</label>
            <div className="flex flex-col gap-1.5">
              {GOLD_TYPES.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setCurrency(g.value)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm border transition ${
                    currency === g.value
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-gray-700 border-gray-200 hover:border-amber-400"
                  }`}
                >
                  <span className="font-medium">{(t as any)[g.labelKey]}</span>
                  <span className={`text-xs ${currency === g.value ? "text-amber-100" : "text-gray-400"}`}>
                    {g.unit}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{amountLabel}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                {amountPrefix}
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                min="0"
                step="any"
                required
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Team */}
          {teams.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.addToTeamAsset}</label>
              <select
                value={teamId}
                onChange={(e) => { setTeamId(e.target.value); setTargetUserId(""); }}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
              >
                <option value="">{t.personalOption}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Add for (admin only) */}
          {isOwner && otherMembers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.addFor}</label>
              <select
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
              >
                <option value="">{t.myself}</option>
                {otherMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {(m.user as any)?.name ?? (m.user as any)?.email ?? m.user_id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition disabled:opacity-60"
            >
              {saving ? t.addingAsset : t.addAsset}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Manual Gold Prices Modal ───────────────────────────────────────────────────

const GOLD_FIELDS: { key: GoldType; labelKey: string }[] = [
  { key: "GRAM_ALTIN",   labelKey: "goldGram"    },
  { key: "BILEZIK",      labelKey: "goldBilezik" },
  { key: "CEYREK_ALTIN", labelKey: "goldCeyrek"  },
  { key: "YARIM_ALTIN",  labelKey: "goldYarim"   },
  { key: "TAM_ALTIN",    labelKey: "goldTam"     },
];

function ManualGoldModal({
  rates,
  onClose,
  onApply,
  t,
}: {
  rates: ExchangeRates | null;
  onClose: () => void;
  onApply: (updated: ExchangeRates) => void;
  t: any;
}) {
  const tryRate = rates?.TRY ?? 0; // USD per 1 TRY

  const [values, setValues] = useState<Partial<Record<GoldType, string>>>(() => {
    if (!tryRate) return {};
    return Object.fromEntries(
      GOLD_FIELDS.map(({ key }) => [
        key,
        rates![key] ? String(Math.round(rates![key] / tryRate)) : "",
      ])
    ) as Partial<Record<GoldType, string>>;
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tryRate) return;

    const now = new Date().toISOString();
    const updated: ExchangeRates = {
      ...(rates!),
      fetchedAt: now,
      goldError: null,
    };

    for (const { key } of GOLD_FIELDS) {
      const raw = values[key];
      if (raw && raw.trim() !== "") {
        const tryPrice = parseFloat(raw.replace(",", "."));
        if (!isNaN(tryPrice) && tryPrice > 0) {
          updated[key] = tryPrice * tryRate;
        }
      }
    }

    onApply(updated);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-base">{t.manualGoldTitle}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!tryRate ? (
          <p className="text-sm text-red-500">{t.manualGoldNoTRY}</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">{t.manualGoldDesc}</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              {GOLD_FIELDS.map(({ key, labelKey }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t[labelKey]}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₺</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={values[key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              ))}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition"
                >
                  {t.manualGoldApply}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
