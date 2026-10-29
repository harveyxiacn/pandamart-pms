import { useState } from "react";
import { Info, RotateCcw } from "lucide-react";
import { DEMO_MODE } from "../../demo/constants";
import { resetDemoData } from "../../demo";

export function DemoBanner() {
  const [resetting, setResetting] = useState(false);

  if (!DEMO_MODE) return null;

  const handleReset = async () => {
    const ok = window.confirm(
      "重置演示数据？当前浏览器中的修改都会恢复为初始演示数据。"
    );
    if (!ok) return;
    setResetting(true);
    await resetDemoData();
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-accent-soft/70 px-4 py-1.5 text-meta text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <Info size={13} aria-hidden="true" />
        公开演示环境：数据由浏览器本地生成，可放心操作
      </span>
      <button
        type="button"
        onClick={() => void handleReset()}
        disabled={resetting}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-accent transition-colors hover:bg-surface disabled:opacity-60"
      >
        <RotateCcw size={12} aria-hidden="true" />
        {resetting ? "重置中…" : "重置演示数据"}
      </button>
    </div>
  );
}
