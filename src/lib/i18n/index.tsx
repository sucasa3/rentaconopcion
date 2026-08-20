/**
 * Lightweight language layer for the homeowner experience.
 *
 * Resolution order: saved profile language -> localStorage -> browser -> "en".
 * The saved value is read after hydration so SSR markup never mismatches.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/integrations/supabase/client";
import { en, type Dictionary, type TranslationKey } from "./en";
import { es } from "./es";

export type Language = "en" | "es";
export type { TranslationKey };

const DICTS: Record<Language, Dictionary> = { en, es };
const STORAGE_KEY = "sucasa.language";

export function isLanguage(v: unknown): v is Language {
  return v === "en" || v === "es";
}

function readStored(): Language | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(v) ? v : null;
  } catch {
    return null;
  }
}

function readBrowser(): Language | null {
  if (typeof navigator === "undefined") return null;
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : null;
}

export function translate(
  lang: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const raw = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
    vars[name] != null ? String(vars[name]) : m,
  );
}

type Ctx = {
  language: Language;
  setLanguage: (l: Language) => Promise<void>;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start at "en" so server and first client render agree.
  const [language, setLang] = useState<Language>("en");

  useEffect(() => {
    let alive = true;

    const local = readStored() ?? readBrowser();
    if (local && alive) setLang(local);

    // The signed-in profile wins over the device guess.
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive || !data.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("language")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      if (isLanguage(p?.language)) {
        setLang(p.language);
        try {
          window.localStorage.setItem(STORAGE_KEY, p.language);
        } catch {
          /* private mode */
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(async (next: Language) => {
    setLang(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ language: next })
      .eq("id", data.user.id);
    if (error) throw new Error(error.message);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      language,
      setLanguage,
      t: (key, vars) => translate(language, key, vars),
    }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): Ctx {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;
  // Safe fallback for anything rendered outside the provider (e.g. error pages).
  return {
    language: "en",
    setLanguage: async () => {},
    t: (key, vars) => translate("en", key, vars),
  };
}

/** Shorthand when a component only needs the translate function. */
export function useT() {
  return useLanguage().t;
}
