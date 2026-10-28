import { Bell, Building2, FileText, LogOut, Package, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUnreadCount } from "../../api/notifications";
import { globalSearch } from "../../api/analytics";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import type { GlobalSearchResult } from "../../types";

export function Header() {
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  /* ── search state ──────────────────────────────────────── */
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let mounted = true;
    getUnreadCount()
      .then((res) => { if (mounted) setUnreadCount(res.count); })
      .catch(() => { if (mounted) setUnreadCount(0); });
    return () => { mounted = false; };
  }, []);

  /* ── keyboard shortcut: Ctrl+K or / ─────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── close dropdown on outside click ────────────────────── */
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults(null); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await globalSearch(q);
        setResults(data);
      } catch { setResults(null); }
      finally { setSearching(false); }
    }, 300);
  }, []);

  const totalHits = results
    ? results.products.length + results.invoices.length + results.suppliers.length
    : 0;

  return (
    <header className="sticky top-0 z-20 mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 backdrop-blur-md">
      {/* ── left: brand ─────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <img
          src="/logo-300x292.png"
          alt=""
          className="h-9 w-9 rounded-lg bg-surface object-contain p-1 ring-1 ring-line"
        />
        <div className="hidden sm:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
            PandaMart
          </p>
          <p className="text-sm font-semibold text-ink">
            {user?.displayName || user?.username} · {user?.role === "admin" ? "管理员" : "店员"}
          </p>
        </div>
      </div>

      {/* ── center: search bar（后端 /analytics/search 为 adminOnly，店员不展示搜索框）── */}
      {isAdmin ? (
      <div className="relative flex-1 max-w-md" ref={dropdownRef}>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); doSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="搜索产品、发票、供应商…"
            aria-label="全局搜索"
            className="w-full rounded-lg border border-line bg-surface-muted py-2 pl-9 pr-16 text-sm text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); setResults(null); setOpen(false); }}
                className="rounded p-0.5 text-slate-400 hover:text-slate-600"
                aria-label="清除搜索"
              >
                <X size={14} />
              </button>
            )}
            <kbd className="hidden sm:inline-flex rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
              Ctrl+K
            </kbd>
          </div>
        </div>

        {/* ── dropdown ──────────────────────────────────── */}
        {open && (query.trim() || searching) && (
          <div className="absolute left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {searching && (
              <p className="px-4 py-3 text-xs text-slate-400">搜索中…</p>
            )}
            {!searching && results && totalHits === 0 && (
              <p className="px-4 py-3 text-xs text-slate-400">未找到匹配结果</p>
            )}
            {!searching && results && totalHits > 0 && (
              <div className="py-1">
                {results.products.length > 0 && (
                  <SearchSection title="产品" icon={Package}>
                    {results.products.slice(0, 5).map((p) => (
                      <SearchItem
                        key={`p-${p.id}`}
                        label={p.nameZh || p.nameEn}
                        sub={p.sku || p.barcode || undefined}
                        onClick={() => { setOpen(false); navigate(`/products?id=${p.id}`); }}
                      />
                    ))}
                  </SearchSection>
                )}
                {results.invoices.length > 0 && (
                  <SearchSection title="发票" icon={FileText}>
                    {results.invoices.slice(0, 5).map((inv) => (
                      <SearchItem
                        key={`i-${inv.id}`}
                        label={inv.invoiceNumber}
                        sub={inv.supplierName || undefined}
                        onClick={() => { setOpen(false); navigate(`/invoices?id=${inv.id}`); }}
                      />
                    ))}
                  </SearchSection>
                )}
                {results.suppliers.length > 0 && (
                  <SearchSection title="供应商" icon={Building2}>
                    {results.suppliers.slice(0, 5).map((s) => (
                      <SearchItem
                        key={`s-${s.id}`}
                        label={s.name}
                        sub={s.code || s.phone || undefined}
                        onClick={() => { setOpen(false); navigate(`/suppliers?id=${s.id}`); }}
                      />
                    ))}
                  </SearchSection>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* ── right: actions ──────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          className="relative rounded-lg border border-line bg-surface p-2 text-ink-muted transition-colors hover:bg-surface-inset hover:text-ink"
          onClick={() => navigate("/notifications")}
          type="button"
          title="通知"
          aria-label={unreadCount > 0 ? `通知，${unreadCount} 条未读` : "通知"}
        >
          <Bell size={18} aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 min-w-5 rounded-full bg-danger px-1 text-center text-[10px] font-bold text-white"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
        <Badge tone="default" className="hidden sm:inline-flex">{user?.username}</Badge>
        <Button
          variant="ghost"
          onClick={async () => { await logout(); navigate("/login"); }}
        >
          <LogOut size={16} className="mr-1" />
          <span className="hidden sm:inline">退出</span>
        </Button>
      </div>
    </header>
  );
}

/* ── sub-components ──────────────────────────────────────── */

function SearchSection({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Icon size={12} aria-hidden="true" />
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SearchItem({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition hover:bg-slate-50"
    >
      <span className="truncate font-medium">{label}</span>
      {sub && <span className="truncate text-xs text-slate-400">{sub}</span>}
    </button>
  );
}
