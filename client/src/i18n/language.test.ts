import { afterEach, describe, expect, it } from "vitest";
import english from "./en.json";
import hongKong from "./zh-HK.json";
import { initialiseLanguage, getLanguage, setLanguage, t } from "./index";
import { notificationMessage } from "./notifications";

afterEach(() => {
  setLanguage("zh-Hans");
  localStorage.clear();
  history.replaceState(null, "", "/");
});

describe("language selection and messages", () => {
  it("uses an explicit language ahead of storage and keeps the invoice route and history state", () => {
    localStorage.setItem("pandamart-language", "zh-Hans");
    history.replaceState({ idx: 7 }, "", "/?lang=en#/invoices?id=62");
    initialiseLanguage();
    expect(getLanguage()).toBe("en");
    setLanguage("zh-Hant");
    expect(location.hash).toBe("#/invoices?id=62");
    expect(history.state).toEqual({ idx: 7 });
    expect(document.documentElement.lang).toBe("zh-Hant-HK");
    expect(t("确认入库")).toBe("確認收貨");
  });

  it("uses the saved preference for legacy links", () => {
    localStorage.setItem("pandamart-language", "en");
    history.replaceState(null, "", "/#/inventory");
    initialiseLanguage();
    expect(t("库存")).toBe("Stock");
  });

  it("preserves interpolated supplier names and original notification data", () => {
    setLanguage("en");
    expect(t("发票号 {0} 已存在", "登录系统-$&-{1}")).toBe("Invoice 登录系统-$&-{1} already exists");
    expect(notificationMessage("测试商店 库存仅剩 3，低于安全库存 4")).toBe("测试商店: only 3 on hand, below safety stock of 4.");
  });

  it("keeps the catalogues and their interpolation slots in sync", () => {
    expect(Object.keys(english).sort()).toEqual(Object.keys(hongKong).sort());
    const slots = (value: string) => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
    for (const [key, translated] of Object.entries(english)) {
      expect(slots(translated), key).toEqual(slots(key));
      expect(slots(hongKong[key as keyof typeof hongKong]), key).toEqual(slots(key));
    }
  });
});
