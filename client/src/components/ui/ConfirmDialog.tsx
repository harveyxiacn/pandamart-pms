import { createContext, useCallback, useContext, useState, type PropsWithChildren } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (value: boolean) => void;
}

const initialState: ConfirmState = { open: false, title: "" };

export function ConfirmProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<ConfirmState>(initialState);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, open: true, resolve });
    });
  }, []);

  const settle = useCallback(
    (value: boolean) => {
      state.resolve?.(value);
      setState((prev) => ({ ...prev, open: false, resolve: undefined }));
    },
    [state]
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={state.open} title={state.title} onClose={() => settle(false)} widthClassName="max-w-md">
        <div className="space-y-4">
          {state.message ? <p className="text-sm text-slate-600">{state.message}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => settle(false)}>
              {state.cancelText || "取消"}
            </Button>
            <Button variant={state.danger ? "danger" : "primary"} onClick={() => settle(true)}>
              {state.confirmText || "确认"}
            </Button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (ctx) return ctx;
  return (options: ConfirmOptions) =>
    Promise.resolve(window.confirm(options.message ? `${options.title}\n${options.message}` : options.title));
}
