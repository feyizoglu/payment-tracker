"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type Lang = "en" | "tr";

const translations = {
  en: {
    // Landing
    teamPaymentTracking: "Team payment tracking",
    heroTitle1: "Track every installment,",
    heroTitle2: "never miss a payment",
    heroDesc: "Add credit payments with installment schedules. See exactly which payments are due each month — together with your team.",
    getStarted: "Get started with Google",
    signIn: "Sign in with Google",
    featureAddTitle: "Add Payments",
    featureAddDesc: "Log credit payments with amount, start date, and number of installments.",
    featureMonthlyTitle: "Monthly View",
    featureMonthlyDesc: "See all due payments grouped by month — past, current, and upcoming.",
    featureTrackTitle: "Track Progress",
    featureTrackDesc: "Mark installments as paid and monitor remaining balance over time.",
    featureTeamTitle: "Team Sharing",
    featureTeamDesc: "Create teams and invite members to share and manage payments together.",
    // Dashboard
    activePayments: "Active Payments",
    monthlyTotal: "Monthly Total",
    totalRemaining: "Total Remaining",
    all: "All",
    personal: "Personal",
    monthly: "Monthly",
    addPayment: "Add Payment",
    teams: "Teams",
    signOut: "Sign out",
    noPayments: "No payments found",
    noPaymentsHint: 'Click "Add Payment" to get started',
    // Calendar
    paid: "paid",
    total: "total",
    noPaymentsDay: "— no payments",
    installmentOf: "Installment",
    of: "of",
    // Payment Form
    addPaymentTitle: "Add Payment",
    paymentName: "Payment Name",
    paymentNamePlaceholder: "e.g. Car loan, Laptop installment",
    totalAmount: "Total Amount",
    firstPaymentDate: "First Payment Date",
    firstPaymentDateHint: "Each installment will be due on the same day of subsequent months.",
    numberOfInstallments: "Number of Installments",
    monthlyPayment: "Monthly payment",
    addToTeam: "Add to Team (optional)",
    personalOption: "Personal",
    cancel: "Cancel",
    adding: "Adding…",
    // Payment Card
    perMonth: "/mo",
    left: "left",
    delete: "Delete",
    deleteConfirm: 'Delete',
    // Teams Panel
    manageTeams: "Manage Teams",
    newTeamName: "New team name…",
    create: "Create",
    noTeams: "No teams yet. Create one above.",
    members: "members",
    member: "member",
    owner: "owner",
    invite: "Invite",
    invitePlaceholder: "member@email.com",
    inviting: "Inviting…",
  },
  tr: {
    // Landing
    teamPaymentTracking: "Takım ödeme takibi",
    heroTitle1: "Her taksiti takip et,",
    heroTitle2: "hiçbir ödemeyi kaçırma",
    heroDesc: "Kredi ödemelerini taksit planlarıyla ekle. Her ay hangi ödemelerin yapılması gerektiğini ekibinle birlikte görün.",
    getStarted: "Google ile başla",
    signIn: "Google ile giriş yap",
    featureAddTitle: "Ödeme Ekle",
    featureAddDesc: "Kredi ödemelerini tutar, başlangıç tarihi ve taksit sayısıyla kayıt et.",
    featureMonthlyTitle: "Aylık Görünüm",
    featureMonthlyDesc: "Tüm ödemeleri aylara göre gruplandırılmış şekilde gör.",
    featureTrackTitle: "İlerlemeyi Takip Et",
    featureTrackDesc: "Taksitleri ödendi olarak işaretle ve kalan bakiyeyi takip et.",
    featureTeamTitle: "Takım Paylaşımı",
    featureTeamDesc: "Takım oluştur ve üyeleri davet ederek ödemeleri birlikte yönetin.",
    // Dashboard
    activePayments: "Aktif Ödemeler",
    monthlyTotal: "Aylık Toplam",
    totalRemaining: "Kalan Toplam",
    all: "Tümü",
    personal: "Kişisel",
    monthly: "Aylık",
    addPayment: "Ödeme Ekle",
    teams: "Takımlar",
    signOut: "Çıkış yap",
    noPayments: "Ödeme bulunamadı",
    noPaymentsHint: '"Ödeme Ekle" butonuna tıklayarak başlayın',
    // Calendar
    paid: "ödendi",
    total: "toplam",
    noPaymentsDay: "— ödeme yok",
    installmentOf: "Taksit",
    of: "/",
    // Payment Form
    addPaymentTitle: "Ödeme Ekle",
    paymentName: "Ödeme Adı",
    paymentNamePlaceholder: "ör. Araba kredisi, Laptop taksiti",
    totalAmount: "Toplam Tutar",
    firstPaymentDate: "İlk Ödeme Tarihi",
    firstPaymentDateHint: "Her taksit, sonraki aylarda aynı gün ödenecektir.",
    numberOfInstallments: "Taksit Sayısı",
    monthlyPayment: "Aylık ödeme",
    addToTeam: "Takıma ekle (isteğe bağlı)",
    personalOption: "Kişisel",
    cancel: "İptal",
    adding: "Ekleniyor…",
    // Payment Card
    perMonth: "/ay",
    left: "kaldı",
    delete: "Sil",
    deleteConfirm: "Sil",
    // Teams Panel
    manageTeams: "Takımları Yönet",
    newTeamName: "Yeni takım adı…",
    create: "Oluştur",
    noTeams: "Henüz takım yok. Yukarıdan oluşturun.",
    members: "üye",
    member: "üye",
    owner: "sahip",
    invite: "Davet Et",
    invitePlaceholder: "uye@email.com",
    inviting: "Davet ediliyor…",
  },
};

type Translations = typeof translations.en;

const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translations;
}>({
  lang: "en",
  setLang: () => {},
  t: translations.en,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  return (
    <LangContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
