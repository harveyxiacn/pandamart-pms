import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/classnames";
import { Popover } from "./Popover";

interface TriggerProps {
  ref: (node: HTMLButtonElement | null) => void;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
}

interface DropdownMenuProps {
  trigger: (props: TriggerProps) => React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  label: string;
  className?: string;
}

const MenuContext = createContext<{ close: () => void }>({ close: () => undefined });

const FOCUSABLE_ITEM = '[role="menuitem"]:not([disabled])';

export function DropdownMenu({
  trigger,
  children,
  align = "end",
  label,
  className,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      close();
      return;
    }
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_ITEM));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    switch (event.key) {
      case "ArrowDown":
        next = items[(index + 1) % items.length];
        break;
      case "ArrowUp":
        next = items[(index - 1 + items.length) % items.length];
        break;
      case "Home":
        next = items[0];
        break;
      case "End":
        next = items[items.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    next?.focus();
  };

  return (
    <>
      {trigger({
        ref: (node) => {
          anchorRef.current = node;
        },
        onClick: () => setOpen((value) => !value),
        onKeyDown: (event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
      })}
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        align={align}
        role="menu"
        ariaLabel={label}
        onKeyDown={onKeyDown}
        className={cn("min-w-[11rem] p-1", className)}
      >
        <MenuContext.Provider value={{ close }}>
          <MenuBody>{children}</MenuBody>
        </MenuContext.Provider>
      </Popover>
    </>
  );
}

/** Focuses the first menu item when the menu opens (WAI-ARIA menu pattern). */
function MenuBody({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLElement>(FOCUSABLE_ITEM)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref}>{children}</div>;
}

interface DropdownMenuItemProps {
  children: React.ReactNode;
  icon?: LucideIcon;
  onSelect?: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  shortcut?: string;
}

export function DropdownMenuItem({
  children,
  icon: Icon,
  onSelect,
  tone = "default",
  disabled,
  shortcut,
}: DropdownMenuItemProps) {
  const { close } = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      onClick={() => {
        close();
        onSelect?.();
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-body transition-colors",
        "focus-visible:bg-surface-inset focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-45",
        tone === "danger"
          ? "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft"
          : "text-ink hover:bg-surface-inset"
      )}
    >
      {Icon ? <Icon size={15} className="shrink-0 opacity-70" aria-hidden="true" /> : null}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? (
        <kbd className="ml-2 rounded border border-line bg-surface-muted px-1 font-mono text-[10px] text-ink-subtle">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-2 text-label font-semibold uppercase tracking-wider text-ink-subtle">
      {children}
    </p>
  );
}
