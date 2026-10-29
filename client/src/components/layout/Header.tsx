import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  ChevronDown,
  FileText,
  LogOut,
  Package,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getUnreadCount } from "../../api/notifications";
import { globalSearch } from "../../api/analytics";
import { useAuth } from "../../hooks/useAuth";
import { cn } from "../../utils/classnames";
import { APP_NAME } from "../../utils/constants";
import type { GlobalSearchResult } from "../../types";
import { Popover } from "../ui/Popover";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "../ui/DropdownMenu";

interface FlatResult {
  id: string;
  section: string;
  icon: LucideIcon;
  label: string;
  sub?: string;
  to: string;
}

export function Header() {
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  /* ── search state ──────────────────────────────────────── */
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let mounted = true;
    getUnreadCount()
      .then((res) => {
        if (mounted) setUnreadCount(res.count);
      })
      .catch(() => {
        if (mounted) setUnreadCount(0);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k" && isAdmin) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAdmin]);

  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        setResults(await globalSearch(q));
      } catch {
        setResults(null);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const flatResults = useMemo<FlatResult[]>(() => {
    if (!results) return [];
    const items: FlatResult[] = [];
    results.products.slice(0, 5).forEach((p) =>
      items.push({
        id: `p-${p.id}`,
        section: "产品",
        icon: Package,
        label: p.nameZh || p.nameEn,
        sub: p.sku || p.barcode || undefined,
        to: `/products?id=${p.id}`,
      })
    );
    results.invoices.slice(0, 5).forEach((inv) =>
      items.push({
        id: `i-${inv.id}`,
        section: "发票",
        icon: FileText,
        label: inv.invoiceNumber,
        sub: inv.supplierName || undefined,
        to: `/invoices?id=${inv.id}`,
      })
    );
    results.suppliers.slice(0, 5).forEach((s) =>
      items.push({
        id: `s-${s.id}`,
        section: "供应商",
        icon: Building2,
        label: s.name,
        sub: s.code || s.phone || undefined,
        to: `/suppliers?id=${s.id}`,
      })
    );
    return items;
  }, [results]);

  const selectResult = useCallback(
    (item: FlatResult) => {
      setOpen(false);
      setQuery("");
      setResults(null);
      navigate(item.to);
    },
    [navigate]
  );

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (flatResults.length === 0 ? -1 : (index + 1) % flatResults.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        flatResults.length === 0 ? -1 : (index - 1 + flatResults.length) % flatResults.length
      );
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && flatResults[activeIndex]) {
        event.preventDefault();
        selectResult(flatResults[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showPanel = open && Boolean(query.trim());
  const sections = Array.from(new Set(flatResults.map((item) => item.section)));
  let runningIndex = -1;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-7">
        {/* Mobile identity — the sidebar carries this on desktop. */}
        <div className="flex items-center gap-2 lg:hidden">
          <img
            src="/logo-300x292.png"
            alt=""
            className="h-7 w-7 rounded-md bg-surface object-contain ring-1 ring-line"
          />
          <span className="hidden text-sm font-semibold text-ink sm:inline">{APP_NAME}</span>
        </div>

        {/* Search */}
        {isAdmin ? (
          <div ref={anchorRef} className="relative ml-0 min-w-0 flex-1 lg:ml-0 lg:max-w-md">
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              role="combobox"
              aria-expanded={showPanel}
              aria-controls="global-search-results"
              aria-autocomplete="list"
              aria-activedescendant={
                activeIndex >= 0 && flatResults[activeIndex]
                  ? `search-option-${flatResults[activeIndex].id}`
                  : undefined
              }
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(-1);
                doSearch(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onSearchKeyDown}
              placeholder="搜索产品、发票、供应商…"
              aria-label="全局搜索"
              className="h-9 w-full rounded-lg border border-line bg-surface-muted pl-9 pr-16 text-sm text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/20"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setResults(null);
                    setOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle hover:bg-surface-inset hover:text-ink"
                  aria-label="清除搜索"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : (
                <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-subtle sm:inline-flex">
                  Ctrl K
                </kbd>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigate("/notifications")}
            title="通知"
            aria-label={unreadCount > 0 ? `通知，${unreadCount} 条未读` : "通知"}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition-colors hover:bg-surface-inset hover:text-ink"
          >
            <Bell size={17} aria-hidden="true" />
            {unreadCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-surface"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>

          <div className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />

          <DropdownMenu
            label="账户菜单"
            trigger={(props) => (
              <button
                {...props}
                type="button"
                className="flex h-9 items-center gap-2 rounded-lg px-1.5 pr-2 text-left transition-colors hover:bg-surface-inset"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-meta font-semibold text-white">
                  {(user?.displayName || user?.username || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block max-w-[9rem] truncate text-body font-medium leading-tight text-ink">
                    {user?.displayName || user?.username}
                  </span>
                  <span className="block text-[10px] leading-tight text-ink-subtle">
                    {user?.role === "admin" ? "管理员" : "店员"}
                  </span>
                </span>
                <ChevronDown size={13} aria-hidden="true" className="hidden text-ink-subtle sm:block" />
              </button>
            )}
          >
            <DropdownMenuItem icon={Bell} onSelect={() => navigate("/notifications")}>
              通知中心
            </DropdownMenuItem>
            {isAdmin ? (
              <>
                <DropdownMenuItem icon={Settings} onSelect={() => navigate("/settings")}>
                  系统设置
                </DropdownMenuItem>
                <DropdownMenuItem icon={Users} onSelect={() => navigate("/users")}>
                  用户管理
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={LogOut}
              tone="danger"
              onSelect={async () => {
                await logout();
                navigate("/login");
              }}
            >
              退出登录
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      </div>

      <Popover
        open={showPanel}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        matchWidth
        ariaLabel="搜索结果"
        className="p-1.5"
        role="listbox"
      >
        <div id="global-search-results">
          {searching && flatResults.length === 0 ? (
            <p className="px-3 py-4 text-meta text-ink-subtle">搜索中…</p>
          ) : null}
          {!searching && results && flatResults.length === 0 ? (
            <p className="px-3 py-4 text-meta text-ink-subtle">未找到匹配结果</p>
          ) : null}

          {sections.map((section) => {
            const items = flatResults.filter((item) => item.section === section);
            return (
              <div key={section} className="py-0.5">
                <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                  {section}
                </p>
                {items.map((item) => {
                  runningIndex += 1;
                  const index = runningIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      id={`search-option-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectResult(item)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                        index === activeIndex ? "bg-surface-inset" : "hover:bg-surface-muted"
                      )}
                    >
                      <Icon size={15} aria-hidden="true" className="shrink-0 text-ink-subtle" />
                      <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
                        {item.label}
                      </span>
                      {item.sub ? (
                        <span className="max-w-[45%] truncate text-meta text-ink-subtle">{item.sub}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Popover>
    </header>
  );
}
