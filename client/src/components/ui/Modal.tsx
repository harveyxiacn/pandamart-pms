import { useEffect, type PropsWithChildren } from "react";
import { Button } from "./Button";
import { cn } from "../../utils/classnames";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  widthClassName?: string;
  bodyClassName?: string;
}

export function Modal({
  open,
  title,
  onClose,
  widthClassName,
  bodyClassName,
  children,
}: PropsWithChildren<ModalProps>) {
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/45 p-3 backdrop-blur-[1px] sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn("glass mx-auto w-full max-w-5xl overflow-hidden p-0 shadow-2xl", widthClassName)}
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
