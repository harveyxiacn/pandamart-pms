import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/classnames";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** Align the panel's left or right edge with the anchor's. */
  align?: "start" | "end";
  /** Match the trigger width (search fields, date inputs). */
  matchWidth?: boolean;
  className?: string;
  role?: "dialog" | "menu" | "listbox";
  ariaLabel?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * A fixed-position layer anchored to an element.
 *
 * Rendered in a portal so table wrappers with `overflow-x-auto` and modal
 * bodies with their own scroll container cannot clip it. Position is measured
 * after mount and re-measured on scroll/resize, and it flips above the anchor
 * when there is not enough room below.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  align = "start",
  matchWidth = false,
  className,
  role = "dialog",
  ariaLabel,
  onKeyDown,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const margin = 8;
    const gap = 6;
    const rect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const width = matchWidth ? rect.width : panelRect.width;
    const height = panelRect.height;

    let left = align === "end" ? rect.right - width : rect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

    const below = rect.bottom + gap;
    const fitsBelow = below + height <= window.innerHeight - margin;
    const above = rect.top - gap - height;
    const top = fitsBelow || above < margin ? below : above;

    setStyle({
      top: Math.round(top),
      left: Math.round(left),
      width: matchWidth ? Math.round(width) : undefined,
      maxHeight: Math.max(160, Math.min(height, window.innerHeight - top - margin)),
    });
  }, [align, anchorRef, matchWidth]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    reposition();
    const raf = requestAnimationFrame(reposition);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      const focusWasInside = panelRef.current?.contains(document.activeElement) ?? false;
      onClose();
      if (focusWasInside) anchorRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role={role}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      style={{ ...style, visibility: style ? "visible" : "hidden" }}
      className={cn(
        "fixed z-[120] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop animate-scale-in",
        className
      )}
    >
      {children}
    </div>,
    document.body
  );
}
