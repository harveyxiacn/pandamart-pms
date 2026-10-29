import { useId, type PropsWithChildren, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../utils/classnames";
import { useDialogA11y } from "../../hooks/useDialogA11y";

interface DrawerProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  /** Right sheet on desktop, bottom sheet on phones. */
  widthClassName?: string;
  bodyClassName?: string;
}

/**
 * Side panel for create/edit flows. On narrow screens it becomes a bottom
 * sheet, which keeps the form reachable one-handed and clear of the keyboard.
 */
export function Drawer({
  open,
  title,
  description,
  onClose,
  footer,
  widthClassName,
  bodyClassName,
  children,
}: PropsWithChildren<DrawerProps>) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useDialogA11y(open, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-ink/45 backdrop-blur-[2px] animate-fade-in">
      <div
        className="absolute inset-0"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-pop outline-none animate-sheet-up",
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:rounded-none sm:border-l sm:border-t-0 sm:animate-sheet-in",
          widthClassName ?? "sm:max-w-[30rem]"
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
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
            aria-label="关闭面板"
            className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-inset hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>

        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
