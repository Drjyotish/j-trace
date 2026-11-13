"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LOCALES, type Locale } from "@/lib/playbook";
import { LOCALE_NAMES, translate } from "@/lib/i18n";

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nValue>({ locale: "en", setLocale: () => {}, t: (k) => translate("en", k) });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("jt_locale");
    } catch {
      /* storage unavailable */
    }
    const fromBrowser = navigator.language?.slice(0, 2);
    const pick = (LOCALES as string[]).includes(saved ?? "") ? saved : (LOCALES as string[]).includes(fromBrowser) ? fromBrowser : "en";
    setLocaleState(pick as Locale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem("jt_locale", l);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(Ctx);
}

export function LanguageSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="lang" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)} lang={l}>
          {LOCALE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
