"""Browser acceptance for the static demo. Requires Python Playwright and Chromium.

Run python scripts/check-pages-locales.py [Pages base URL]. Without a URL the
script serves client/dist-demo on an ephemeral loopback port.
"""
import json
import re
import sys
from decimal import Decimal
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / "client/src/i18n"
CATALOGS = {lang: json.loads((I18N / filename).read_text("utf-8"))
            for lang, filename in [("en", "en.json"), ("zh-Hant", "zh-HK.json")]}
ROUTES = ["invoices/scan", "invoices", "inventory", "sales", "batches", "products",
          "suppliers", "notifications", "ai-assistant", "payables", "stocktake",
          "analytics", "exports", "audit-logs", "settings", "users"]


class PagesHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        return super().translate_path(path.removeprefix("/pandamart-pms"))

    def log_message(self, *args):
        pass


def numeric(text):
    return Decimal(re.search(r"[\d,]+(?:\.\d+)?", text).group().replace(",", ""))


def check(browser, base, lang, width):
    context = browser.new_context(viewport={"width": width, "height": 844 if width == 390 else 960},
                                  is_mobile=width == 390, has_touch=width == 390)
    p = context.new_page()
    errors = []
    p.on("pageerror", lambda error: errors.append(str(error)))
    names = CATALOGS.get(lang, {})
    def tr(key):
        return names.get(key, key)
    url = base + "?lang=" + lang
    if lang == "en":
        p.goto(base + "?lang=zh-Hans")
        expect(p.locator("#login-username")).to_be_visible()
    p.goto(url + "#/inventory")
    expect(p.locator("#login-username")).to_be_visible()
    p.locator("#login-password").fill("invalid-demo-password")
    p.locator("button[type=submit]").click()
    expect(p.get_by_role("alert")).to_have_text(tr("用户名或密码错误"))
    p.get_by_role("button", name=re.compile("admin", re.I)).last.click()
    p.locator("button[type=submit]").click()
    expect(p.get_by_role("heading", name=tr("库存管理"), exact=True)).to_be_visible()
    # Start a clean session and enter through the portfolio URL.
    context.close()
    context = browser.new_context(viewport={"width": width, "height": 844 if width == 390 else 960},
                                  is_mobile=width == 390, has_touch=width == 390)
    p = context.new_page()
    p.on("pageerror", lambda error: errors.append(str(error)))
    p.goto(url)
    expect(p.get_by_role("heading", name=tr("登录系统"), exact=True)).to_be_visible()
    p.get_by_role("button", name=re.compile("admin$|admin", re.I)).last.click()
    expect(p.locator("#login-username")).to_have_value("admin")
    p.locator("button[type=submit]").click()
    expect(p.get_by_role("heading", name=tr("运营概览"))).to_be_visible()
    p.reload()
    expect(p.get_by_role("heading", name=tr("运营概览"))).to_be_visible()
    p.goto(url + "#/invoices")
    p.get_by_role("button", name="INV-PEND-002", exact=True).click()
    dialog = p.get_by_role("dialog")
    first = dialog.locator("tbody tr").first
    expect(first).to_contain_text("Soy Sauce 1.8L")
    quantity = numeric(first.locator("td").nth(6).inner_text())
    invoice_price = numeric(first.locator("td").nth(8).inner_text())
    total = Decimal(dialog.locator("input[type=number]").nth(2).input_value())
    assert total == Decimal("113.25")
    expect(dialog.get_by_text(tr("一致"), exact=True)).to_have_count(3)
    dialog.get_by_role("button", name=tr("进入编辑"), exact=True).click()
    dialog.locator("textarea").fill("QA 草稿 123")
    other = "zh-Hant" if lang == "en" else "en"
    dialog.locator("select").first.select_option(other)
    expect(dialog.locator("textarea")).to_have_value("QA 草稿 123")
    dialog.locator("select").first.select_option(lang)
    expect(dialog.locator("textarea")).to_have_value("QA 草稿 123")
    dialog.get_by_role("button", name=tr("退出编辑"), exact=True).click()

    # Read the prior confirmed price in the product history before receiving.
    lookup = context.new_page()
    lookup.goto(url + "#/products")
    lookup.get_by_label(tr("搜索产品"), exact=True).fill("DRY-002")
    row = lookup.locator("tbody tr").filter(has_text="DRY-002")
    row.get_by_role("button").click()
    lookup.get_by_text(tr("价格趋势"), exact=True).last.click()
    prices = lookup.get_by_role("dialog").locator("tbody tr")
    expect(prices.first).to_be_visible()
    previous = numeric(prices.last.locator("td").nth(1).inner_text())
    def on_hand():
        lookup.goto(url + "#/inventory")
        lookup.get_by_label(tr("搜索库存"), exact=True).fill("DRY-002")
        record = lookup.locator("tbody tr").filter(has_text="DRY-002")
        return numeric(record.locator("td").nth(1).inner_text())
    before = on_hand()
    dialog.get_by_role("button", name=tr("确认入库"), exact=True).click()
    expect(dialog.get_by_text(tr("发票已确认入库"), exact=True)).to_be_visible()
    lookup.reload()
    after = on_hand()
    assert after == before + quantity, (before, quantity, after)
    p.goto(url + "#/invoices?id=62")
    expect(dialog.get_by_role("heading", name=re.compile("INV-PEND-002"))).to_be_visible()
    expect(dialog.get_by_text(tr("已确认"), exact=True)).to_be_visible()
    p.reload()
    expect(dialog.get_by_role("heading", name=re.compile("INV-PEND-002"))).to_be_visible()

    for route in ROUTES:
        p.goto(url + "#/" + route)
        expect(p.locator("main h1")).to_be_visible()
        assert p.evaluate("document.documentElement.lang") == ("zh-Hant-HK" if lang == "zh-Hant" else lang)
    p.goto(base + "#/inventory")
    expect(p.get_by_role("heading", name=tr("库存管理"), exact=True)).to_be_visible()
    assert not errors, errors
    context.close()
    result = (total, previous, invoice_price, before, quantity, after)
    print(lang, width, "USD total / previous price / invoiced price / before / received / after:",
          *result, flush=True)
    return result


if __name__ == "__main__":
    if len(sys.argv) > 1:
        base = sys.argv[1].rstrip("/") + "/"
    else:
        handler = partial(PagesHandler, directory=ROOT / "client/dist-demo")
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_port}/pandamart-pms/"
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        outcomes = [check(browser, base, language, width) for width in (1440, 390)
                    for language in ("en", "zh-Hans", "zh-Hant")]
        assert len(set(outcomes)) == 1, outcomes
