import { useEffect, useRef, type PropsWithChildren } from "react";
import { Button } from "./Button";
import { cn } from "../../utils/classnames";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  widthClassName?: string;
  bodyClassName?: string;
}

// 可聚焦元素选择器（用于焦点陷阱与初始聚焦）
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  title,
  onClose,
  widthClassName,
  bodyClassName,
  children,
}: PropsWithChildren<ModalProps>) {
  // 对话框容器引用：用于焦点陷阱与初始聚焦
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const originOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  // 焦点管理：打开时记录触发元素并将焦点移入对话框，关闭时恢复焦点
  useEffect(() => {
    if (!open) return;
    // 记录打开前的焦点元素（触发者），关闭后用于恢复
    const trigger = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    const focusFirst = () => {
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        // 无可聚焦元素时聚焦容器本身（容器带 tabIndex=-1）
        dialog.focus();
      }
    };
    // 等待内容渲染后再聚焦
    focusFirst();

    // Tab / Shift+Tab 焦点陷阱
    const onTrapKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        // 没有可聚焦元素，焦点固定在容器上
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !dialog.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onTrapKeyDown);

    return () => {
      window.removeEventListener("keydown", onTrapKeyDown);
      // 关闭（open: true -> false 或卸载）时恢复焦点到触发元素
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/45 p-3 backdrop-blur-[1px] sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn("glass mx-auto w-full max-w-5xl overflow-hidden p-0 shadow-2xl outline-none", widthClassName)}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rose-100 bg-white/95 px-4 py-3">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
        <div className={cn("max-h-[80vh] overflow-y-auto px-4 py-4", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}
