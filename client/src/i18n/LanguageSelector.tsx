import { languages, setLanguage, t, useLanguage, type Language } from "./index";

const names = { en: "English", "zh-Hans": "简体中文", "zh-Hant": "繁體中文（香港）" };

export function LanguageSelector() {
  const current = useLanguage();
  return (
    <select
      aria-label={t("语言")}
      value={current}
      onChange={(event) => setLanguage(event.target.value as Language)}
      className="max-w-[8rem] shrink-0 rounded-lg border border-line bg-surface px-1.5 py-2 text-meta text-ink"
    >
      {languages.map((lang) => <option key={lang} lang={lang} value={lang}>{names[lang]}</option>)}
    </select>
  );
}
