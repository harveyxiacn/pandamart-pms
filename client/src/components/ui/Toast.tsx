import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "../../utils/classnames";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const toneStyles: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-line bg-danger-soft text-danger",
  info: "border-slate-200 bg-white text-ink",
};

const toneIcon: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, tone, message }]);
      window.setTimeout(() => remove(id), 3000);
    },
    [remove]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message: string) => push("success", message),
      error: (message: string) => push("error", message),
      info: (message: string) => push("info", message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-3 top-3 z-[200] flex w-[min(92vw,22rem)] flex-col gap-2 sm:right-6 sm:top-6">
        {toasts.map((toast) => {
          const Icon = toneIcon[toast.tone];
          return (
            <div
              key={toast.id}
              role="alert"
              className={cn(
                "pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-card animate-rise",
                toneStyles[toast.tone]
              )}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <span className="flex-1 break-words">{toast.message}</span>
              <button
                type="button"
                aria-label="关闭"
                className="shrink-0 rounded p-0.5 text-current/70 transition hover:bg-black/5"
                onClick={() => remove(toast.id)}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

const fallbackToast: ToastApi = {
  // eslint-disable-next-line no-console
  success: (message: string) => console.info("[toast:success]", message),
  // eslint-disable-next-line no-console
  error: (message: string) => console.error("[toast:error]", message),
  // eslint-disable-next-line no-console
  info: (message: string) => console.info("[toast:info]", message),
};

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? fallbackToast;
}
