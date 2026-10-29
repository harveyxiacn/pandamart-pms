import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
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
  success: "border-success/25 bg-success-soft text-success",
  error: "border-danger/25 bg-danger-soft text-danger",
  info: "border-line bg-surface text-ink",
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
      // Cap the stack so a burst of API errors cannot cover the whole screen.
      setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
      window.setTimeout(() => remove(id), tone === "error" ? 5000 : 3500);
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
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-3 top-3 z-[200] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:top-6"
      >
        {toasts.map((toast) => {
          const Icon = toneIcon[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium shadow-pop animate-rise sm:w-[min(92vw,22rem)]",
                toneStyles[toast.tone]
              )}
            >
              <Icon size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="flex-1 break-words leading-5">{toast.message}</span>
              <button
                type="button"
                aria-label="关闭通知"
                className="shrink-0 rounded p-0.5 text-current/70 transition-colors hover:bg-black/5"
                onClick={() => remove(toast.id)}
              >
                <X size={15} aria-hidden="true" />
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
