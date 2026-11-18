import { useSyncExternalStore } from "react";
import productNames from "./productNames.json";
import english from "./en.json";
import hongKong from "./zh-HK.json";

export const languages = ["en", "zh-Hans", "zh-Hant"] as const;
export type Language = typeof languages[number];
const storageKey = "pandamart-language";
const supported = (value: unknown): value is Language => languages.some((lang) => lang === value);
const locales = { en: "en-US", "zh-Hans": "zh-CN", "zh-Hant": "zh-HK" };
const dictionaries: Record<string, Record<string, string>> = { en: english, "zh-Hant": hongKong };
const listeners = new Set<() => void>();
let language: Language = "zh-Hans";

export const getLanguage = () => language;
export const getLocale = () => locales[language];

function activate(next: Language) {
  language = next;
  document.documentElement.lang = next === "zh-Hant" ? "zh-Hant-HK" : next;
  document.title = "PandaMart PMS · " + t("进销存管理系统");
  try { localStorage.setItem(storageKey, next); } catch { /* The URL still records the choice. */ }
  listeners.forEach((listener) => listener());
}

export function initialiseLanguage() {
  const read = () => {
    const url = new URL(window.location.href);
    const explicit = url.searchParams.get("lang") ?? new URLSearchParams(url.hash.split("?")[1]).get("lang");
    let saved: string | null = null;
    try { saved = localStorage.getItem(storageKey); } catch { /* Storage is optional. */ }
    activate(supported(explicit) ? explicit : supported(saved) ? saved : "zh-Hans");
  };
  read();
  window.addEventListener("popstate", read);
}

export function setLanguage(next: Language) {
  const url = new URL(window.location.href);
  url.searchParams.set("lang", next);
  history.replaceState(history.state, "", url);
  activate(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage);
}

export function t(key: string, ...values: unknown[]): string {
  const dictionary = dictionaries[language];
  const message = dictionary && Object.hasOwn(dictionary, key) ? dictionary[key] : key;
  return values.length ? message.replace(/\{(\d+)\}/g, (_, i: string) => String(values[Number(i)])) : message;
}

export function productName(zh: unknown, en: unknown): string {
  const chinese = String(zh ?? "");
  const englishName = String(en ?? "");
  if (language === "en") return englishName || chinese;
  if (language === "zh-Hant" && Object.hasOwn(productNames, chinese)) {
    return productNames[chinese as keyof typeof productNames];
  }
  return chinese || englishName;
}

const seededCategories = new Set(["蔬菜", "水果", "肉类", "冷冻食品", "干货", "饮料", "零食", "日用品", "豆腐制品", "其他", "叶菜类", "根茎类", "瓜果类", "豆类", "猪肉", "牛肉", "鸡鸭", "海鲜", "米面", "调味料", "罐头", "干货杂粮"]);

export function categoryName(value: string) {
  return seededCategories.has(value) ? t(value) : value;
}
