import { useId, type PropsWithChildren, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../utils/classnames";
import { useDialogA11y } from "../../hooks/useDialogA11y";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

interface ModalProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  size?: ModalSize;
  /** Legacy escape hatch for one-off widths; prefer `size`. */
  widthClassName?: string;
  bodyClassName?: string;
  footer?: ReactNode;
}

const sizeMap: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
  full: "max-w-[calc(100vw-1.5rem)]",
};

export function Modal({
  open,
  title,
  description,
  onClose,
  size = "xl",
  widthClassName,
  bodyClassName,
  footer,
  children,
}: PropsWithChildren<ModalProps>) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useDialogA11y(open, onClose);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-ink/45 p-3 backdrop-blur-[2px] sm:p-6 animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "mx-auto my-auto flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop outline-none animate-scale-in sm:max-h-[calc(100dvh-3rem)]",
          sizeMap[size],
          widthClassName
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-title font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-meta text-ink-subtle">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭对话框"
            className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-inset hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-muted/60 px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
