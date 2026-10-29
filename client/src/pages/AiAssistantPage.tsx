import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  Lightbulb,
  MessageSquareText,
  Package,
  RefreshCw,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import {
  getAiInsights,
  getAiReorderAdvice,
  getAssistantKnowledge,
  getAssistantReport,
  getAssistantStatus,
  sendAiChat,
  type AssistantAlert,
  type AssistantKnowledge,
  type AssistantMode,
  type AssistantStatus,
} from "../api/ai";
import { PageHeader } from "../components/ui/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Textarea } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDateTime } from "../utils/formatters";
import { cn } from "../utils/classnames";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  engine?: "local" | "llm";
  intent?: string;
  suggestions?: string[];
  fallback?: string;
};

const MODE_STORAGE_KEY = "pandamart-assistant-mode";

const quickQuestions = [
  "哪些商品需要补货？",
  "当前库存预警有哪些？",
  "有临期或过期批次吗？",
  "近 30 天毛利怎么样？",
  "生姜还有多少库存？",
];

const intentLabels: Record<string, string> = {
  greeting: "问候",
  help: "能力说明",
  overview: "资料库概览",
  alerts: "库存预警",
  low_stock: "低库存",
  reorder: "补货建议",
  expiring: "保质期",
  sales: "销售",
  profit: "毛利",
  purchase: "采购",
  price_change: "价格波动",
  supplier: "供应商",
  payables: "应付账款",
  slow_mover: "滞销",
  pending_invoice: "待确认发票",
  product_lookup: "单品查询",
  unknown: "通用回答",
};

const alertTypeLabels: Record<string, string> = {
  stockout_risk: "库存风险",
  price_spike: "价格波动",
  pending_invoice: "待处理发票",
  expiring_batch: "临期批次",
  slow_mover: "滞销商品",
  payables: "应付账款",
};

const severityMeta = {
  high: { tone: "danger" as const, icon: AlertTriangle, label: "紧急" },
  medium: { tone: "warning" as const, icon: Clock, label: "提醒" },
  low: { tone: "default" as const, icon: CheckCircle2, label: "提示" },
};

function readStoredMode(): AssistantMode | null {
  try {
    const value = localStorage.getItem(MODE_STORAGE_KEY);
    return value === "local" || value === "llm" || value === "auto" ? value : null;
  } catch {
    return null;
  }
}

function storeMode(mode: AssistantMode): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // private mode / blocked storage: the switch still works for this session
  }
}

function initialMode(status: AssistantStatus | null, stored: AssistantMode | null): AssistantMode {
  if (stored === "llm" && status && !status.llmConfigured) return "local";
  if (stored) return stored;
  if (status?.mode === "llm") return "llm";
  if (status?.mode === "auto" && status.llmConfigured) return "llm";
  return "local";
}

export default function AiAssistantPage() {
  const toast = useToast();
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [knowledge, setKnowledge] = useState<AssistantKnowledge | null>(null);
  const [loadingKnowledge, setLoadingKnowledge] = useState(true);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [mode, setMode] = useState<AssistantMode>("local");
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState("");
  const [reportEngine, setReportEngine] = useState<"local" | "llm" | null>(null);
  const [reportLoading, setReportLoading] = useState<"week" | "month" | null>(null);
  const [advice, setAdvice] = useState("");
  const [adviceLoading, setAdviceLoading] = useState(false);

  const loadKnowledge = useCallback(
    async (refresh = false) => {
      setLoadingKnowledge(true);
      setKnowledgeError(null);
      try {
        const data = await getAssistantKnowledge(refresh);
        setKnowledge(data);
      } catch (err: unknown) {
        setKnowledgeError(err instanceof Error ? err.message : "资料库整理失败");
      } finally {
        setLoadingKnowledge(false);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [statusResult, knowledgeResult] = await Promise.all([
          getAssistantStatus(),
          getAssistantKnowledge(),
        ]);
        if (cancelled) return;
        setStatus(statusResult);
        setKnowledge(knowledgeResult);
        setMode(initialMode(statusResult, readStoredMode()));
      } catch (err: unknown) {
        if (cancelled) return;
        setKnowledgeError(err instanceof Error ? err.message : "无法连接智能助手");
      } finally {
        if (!cancelled) setLoadingKnowledge(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = knowledge?.summary;
  const alerts = knowledge?.alerts ?? [];
  const hasLlm = Boolean(status?.llmConfigured);

  const engineLabel = useMemo(() => {
    if (mode === "llm") {
      return status?.provider
        ? `LLM · ${status.provider.name}（${status.provider.model}）`
        : "LLM 增强";
    }
    return "本地资料库引擎 · 无需 LLM";
  }, [mode, status]);

  const pickMode = (next: AssistantMode) => {
    if (next === mode) return;
    setMode(next);
    storeMode(next);
    setChat([]);
    setConversationId(null);
    setReport("");
    setReportEngine(null);
  };

  const send = async (text?: string) => {
    const content = (text ?? message).trim();
    if (!content || sending) return;
    setSending(true);
    setChat((prev) => [...prev, { role: "user", content }]);
    setMessage("");
    try {
      const result = await sendAiChat(content, conversationId, mode);
      setConversationId(result.conversationId);
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply,
          engine: result.engine,
          intent: result.intent,
          suggestions: result.suggestions,
          fallback: result.fallback
            ? `LLM 调用失败，已自动切换到本地资料库：${result.fallback.reason}`
            : undefined,
        },
      ]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "智能助手请求失败");
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "抱歉，这次请求没有成功。本地模式不依赖外部服务，可稍后重试；LLM 模式请到「系统设置」检查 AI 提供商。",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const generateReport = async (period: "week" | "month") => {
    setReportLoading(period);
    try {
      if (mode === "llm") {
        const result = await getAiInsights(period);
        setReport(
          result.summary +
            (result.alerts.length
              ? "\n\n" + result.alerts.map((item) => `- [${item.type}] ${item.message}`).join("\n")
              : "")
        );
        setReportEngine("llm");
      } else {
        const result = await getAssistantReport(period);
        setReport(
          result.summary +
            (result.alerts.length
              ? "\n\n" + result.alerts.map((item) => `- ${item.message}`).join("\n")
              : "")
        );
        setReportEngine("local");
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : mode === "llm"
            ? "生成经营洞察失败"
            : "生成本地简报失败"
      );
    } finally {
      setReportLoading(null);
    }
  };

  const generateAdvice = async () => {
    setAdviceLoading(true);
    try {
      const result = await getAiReorderAdvice(undefined, "下周有社区活动，客流可能增加");
      setAdvice(result.advice);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "生成补货建议失败");
    } finally {
      setAdviceLoading(false);
    }
  };

  const refreshKnowledge = async () => {
    await loadKnowledge(true);
    toast.success("资料库已按最新仓库数据重新整理");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="智能经营"
        title="智能助手"
        description="默认使用本地资料库引擎：把最新库存、批次、销售、采购和应付数据整理成可检索的资料库，无需 LLM 即可回答问题和生成库存预警。配置 AI 提供商后可切换到 LLM 增强模式。"
        meta={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Database size={13} aria-hidden="true" />
              {engineLabel}
            </span>
            {summary ? (
              <>
                <span aria-hidden="true">·</span>
                <span>资料库同步于 {formatDateTime(summary.generatedAt)}</span>
              </>
            ) : null}
            {hasLlm ? (
              <>
                <span aria-hidden="true">·</span>
                <span>LLM 已配置，可切换增强模式</span>
              </>
            ) : (
              <>
                <span aria-hidden="true">·</span>
                <span>未配置 LLM，本地模式完整可用</span>
              </>
            )}
          </span>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={RefreshCw}
            loading={loadingKnowledge}
            onClick={() => void refreshKnowledge()}
          >
            刷新资料库
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card padded={false} className="flex min-h-[32rem] flex-col overflow-hidden">
          <div className="border-b border-line px-5 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <MessageSquareText size={16} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-body-lg font-semibold text-ink">智能对话</h2>
                  <p className="text-meta text-ink-subtle">
                    库存、补货、保质期、销售、采购、供应商与应付都能直接问
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <SegmentedControl
                  size="sm"
                  label="回答引擎"
                  value={mode}
                  onChange={pickMode}
                  options={[
                    { value: "local", label: "本地智能", icon: Database },
                    {
                      value: "llm",
                      label: "LLM 增强",
                      icon: Sparkles,
                      disabled: !hasLlm,
                      title: hasLlm
                        ? "使用系统设置的 AI 提供商"
                        : "请先在「系统设置」配置 AI 提供商",
                    },
                  ]}
                />
                <span className="text-[11px] text-ink-subtle">
                  {mode === "local" ? "规则引擎 · 结果可复现 · 不产生外部费用" : "由大模型组织回答，失败会自动降级到本地"}
                </span>
              </div>
            </div>
          </div>

          <div
            role="log"
            aria-live="polite"
            aria-label="对话记录"
            className="min-h-[20rem] flex-1 space-y-4 overflow-y-auto bg-surface-muted/40 px-4 py-4 sm:px-5"
          >
            {chat.length === 0 ? (
              <div className="flex h-full min-h-[18rem] flex-col items-center justify-center gap-3 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-ink-subtle ring-1 ring-line">
                  <Sparkles size={20} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-body font-medium text-ink">不用 LLM，也能问经营数据</p>
                  <p className="mt-0.5 max-w-md text-meta text-ink-subtle">
                    资料库已整理当前仓库状态。试试补货、临期、毛利或直接问某个商品还有多少库存。
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {quickQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => void send(question)}
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-meta text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.map((item, index) => (
                <ChatBubble
                  key={index}
                  item={item}
                  onSuggestion={(suggestion) => void send(suggestion)}
                />
              ))
            )}
            {sending ? (
              <div className="flex items-center gap-2 text-meta text-ink-subtle">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Bot size={14} aria-hidden="true" />
                </span>
                {mode === "llm" ? "LLM 正在查询数据并组织回答…" : "正在检索本地资料库…"}
              </div>
            ) : null}
          </div>

          <form
            className="border-t border-line bg-surface p-3 sm:p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label htmlFor="ai-message" className="sr-only">
              输入问题
            </label>
            <div className="flex items-end gap-2">
              <Textarea
                id="ai-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                maxLength={2000}
                placeholder="例如：哪些商品需要补货？临期批次有哪些？生姜还有多少库存？"
                className="min-h-[3.25rem] resize-none"
              />
              <Button
                type="submit"
                leadingIcon={Send}
                loading={sending}
                disabled={sending || !message.trim()}
                className="h-[3.25rem] shrink-0"
              >
                发送
              </Button>
            </div>
            <p className="mt-1.5 text-meta text-ink-subtle">
              本地回答全部来自系统实时数据；涉及金额与库存请回到对应模块核对。
            </p>
          </form>
        </Card>

        <div className="space-y-4">
          <KnowledgeCard
            knowledge={knowledge}
            loading={loadingKnowledge}
            error={knowledgeError}
            onRetry={() => void loadKnowledge(true)}
          />
          <AlertsCard alerts={alerts} loading={loadingKnowledge} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader
            title="经营简报"
            description={
              mode === "llm"
                ? "由 LLM 汇总区间内的销售、采购与库存异常。"
                : "由本地规则生成，不调用任何外部模型。"
            }
            action={
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={reportLoading === "week"}
                  onClick={() => void generateReport("week")}
                >
                  周报
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={RefreshCw}
                  loading={reportLoading === "month"}
                  onClick={() => void generateReport("month")}
                >
                  生成月报
                </Button>
              </div>
            }
          />
          <div className="mt-4 min-h-[14rem] flex-1 rounded-lg border border-line bg-surface-muted p-3.5">
            {report ? (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone={reportEngine === "llm" ? "info" : "success"} size="sm">
                    {reportEngine === "llm" ? "LLM" : "本地规则"}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap text-body leading-6 text-ink-muted">{report}</p>
              </>
            ) : (
              <p className="text-meta text-ink-subtle">
                点击「周报」或「生成月报」。{mode === "local" ? "本地引擎会基于资料库直接汇总，无需 LLM。" : "LLM 会汇总销售、采购与库存异常。"}
              </p>
            )}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="补货清单"
            description={
              mode === "llm"
                ? "本地资料库按缺口与消耗估算；可让 LLM 进一步解读。"
                : "按安全库存缺口与近 4 周消耗估算，随时可用。"
            }
            action={
              mode === "llm" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={Lightbulb}
                  loading={adviceLoading}
                  onClick={() => void generateAdvice()}
                >
                  LLM 解读
                </Button>
              ) : (
                <Link
                  to="/inventory?alertOnly=true"
                  className="text-meta font-medium text-accent hover:underline"
                >
                  查看库存
                </Link>
              )
            }
          />
          <div className="mt-4 min-h-[14rem] flex-1">
            {advice ? (
              <p className="mb-3 whitespace-pre-wrap rounded-lg border border-line bg-surface-muted p-3.5 text-body leading-6 text-ink-muted">
                {advice}
              </p>
            ) : null}
            <ReorderList items={summary?.reorderTop ?? []} loading={loadingKnowledge} />
          </div>
        </Card>
      </section>
    </div>
  );
}

/* ── sub-components ───────────────────────────────────────── */

function ChatBubble({
  item,
  onSuggestion,
}: {
  item: ChatMessage;
  onSuggestion: (suggestion: string) => void;
}) {
  const isUser = item.role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-ink text-white" : "bg-accent-soft text-accent"
        )}
        aria-hidden="true"
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </span>
      <div className={cn("max-w-[48rem]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-xl px-3.5 py-2.5 text-body leading-6",
            isUser
              ? "rounded-tr-sm bg-ink text-white"
              : "rounded-tl-sm border border-line bg-surface text-ink"
          )}
        >
          <span className="sr-only">{isUser ? "你：" : "助手："}</span>
          <p className="whitespace-pre-wrap break-words">{item.content}</p>
        </div>
        {!isUser && (item.engine || item.intent || item.fallback) ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-subtle">
            {item.engine ? (
              <Badge size="sm" tone={item.engine === "llm" ? "info" : "success"}>
                {item.engine === "llm" ? "LLM" : "本地资料库"}
              </Badge>
            ) : null}
            {item.intent ? <span>{intentLabels[item.intent] ?? item.intent}</span> : null}
            {item.fallback ? <span className="text-warning">{item.fallback}</span> : null}
          </div>
        ) : null}
        {!isUser && item.suggestions && item.suggestions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggestion(suggestion)}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function KnowledgeCard({
  knowledge,
  loading,
  error,
  onRetry,
}: {
  knowledge: AssistantKnowledge | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const summary = knowledge?.summary;
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <BookOpen size={16} className="text-accent" aria-hidden="true" />
            资料库
          </span>
        }
        description="实时仓库数据整理成的可检索快照"
      />
      {error ? (
        <div className="mt-4 rounded-lg border border-danger/20 bg-danger-soft p-3">
          <p className="text-meta text-danger">{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
            重试
          </Button>
        </div>
      ) : loading && !summary ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat label="商品" value={String(summary.productCount)} />
            <MiniStat
              label="低于安全线"
              value={String(summary.lowStockCount)}
              tone={summary.lowStockCount > 0 ? "danger" : "success"}
            />
            <MiniStat
              label="已缺货"
              value={String(summary.zeroStockCount)}
              tone={summary.zeroStockCount > 0 ? "danger" : "success"}
            />
            <MiniStat
              label="临期 / 过期"
              value={`${summary.expiringCount} / ${summary.expiredCount}`}
              tone={summary.expiredCount > 0 ? "danger" : summary.expiringCount > 0 ? "warning" : "success"}
            />
            <MiniStat
              label="待确认发票"
              value={String(summary.pendingInvoices)}
              tone={summary.pendingInvoices > 0 ? "warning" : "success"}
            />
            <MiniStat
              label="应付未结"
              value={formatCurrency(summary.payablesOutstanding)}
              tone={summary.payablesOutstanding > 0 ? "warning" : "success"}
            />
          </div>

          <div className="mt-3 space-y-1.5 rounded-lg border border-line bg-surface-muted p-3 text-meta text-ink-muted">
            <p>
              <span className="text-ink-subtle">销售：</span>
              近 7 天 {formatCurrency(summary.sales7.revenue)}（{summary.sales7.orderCount} 单，毛利率{" "}
              {summary.sales7.margin.toFixed(1)}%）
            </p>
            <p>
              <span className="text-ink-subtle">近 30 天：</span>
              {formatCurrency(summary.sales30.revenue)}（{summary.sales30.orderCount} 单）
            </p>
            <p>
              <span className="text-ink-subtle">采购：</span>
              近 30 天 {formatCurrency(summary.purchase30.totalAmount)}（
              {summary.purchase30.invoiceCount} 张发票）
            </p>
          </div>

          {summary.reorderTop.length > 0 ? (
            <div className="mt-3">
              <p className="text-label font-semibold text-ink-subtle">补货 TOP 3</p>
              <ul className="mt-1.5 space-y-1">
                {summary.reorderTop.slice(0, 3).map((item) => (
                  <li key={item.productId} className="flex items-center justify-between gap-2 text-meta">
                    <span className="truncate text-ink-muted">
                      {item.nameZh || item.nameEn}
                    </span>
                    <span className="shrink-0 tabular font-medium text-ink">
                      +{formatQty(item.suggestedQuantity)} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-3 text-[11px] text-ink-subtle">
            同步于 {formatDateTime(summary.generatedAt)} · 写操作会立即刷新，只读缓存 60 秒
          </p>
        </>
      ) : null}
    </Card>
  );
}

function AlertsCard({ alerts, loading }: { alerts: AssistantAlert[]; loading: boolean }) {
  return (
    <Card padded={false}>
      <div className="px-5 pb-2 pt-5">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <AlertTriangle size={16} className="text-warning" aria-hidden="true" />
              库存预警
            </span>
          }
          description="本地规则实时生成"
          action={<Badge size="sm">{alerts.length} 项</Badge>}
        />
      </div>
      {loading && alerts.length === 0 ? (
        <div className="space-y-2 px-5 pb-5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          size="sm"
          icon={CheckCircle2}
          title="没有需要处理的预警"
          description="库存、批次、发票与应付均正常。"
        />
      ) : (
        <ul className="divide-y divide-line">
          {alerts.map((alert) => {
            const meta = severityMeta[alert.severity] ?? severityMeta.low;
            const Icon = meta.icon;
            return (
              <li key={alert.id}>
                <Link to={alert.link} className="flex items-start gap-2.5 px-5 py-3 transition-colors hover:bg-surface-muted/60">
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      alert.severity === "high"
                        ? "bg-danger-soft text-danger"
                        : alert.severity === "medium"
                          ? "bg-warning-soft text-warning"
                          : "bg-surface-inset text-ink-muted"
                    )}
                  >
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-meta font-medium text-ink">{alert.title}</span>
                      <Badge size="sm" tone={meta.tone}>
                        {alertTypeLabels[alert.type] ?? alert.type}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-5 text-ink-muted">{alert.message}</p>
                  </div>
                  <ArrowRight size={14} className="mt-1 shrink-0 text-ink-subtle" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "text-ink",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
      <p className="text-[11px] text-ink-subtle">{label}</p>
      <p className={cn("mt-0.5 truncate text-body font-semibold tabular", toneClass)}>{value}</p>
    </div>
  );
}

function ReorderList({
  items,
  loading,
}: {
  items: AssistantKnowledge["summary"]["reorderTop"];
  loading: boolean;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={Package}
        title="库存充足"
        description="当前没有低于安全库存的商品。"
      />
    );
  }
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {items.map((item) => (
        <li key={item.productId} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-body font-medium text-ink">
                {item.nameZh || item.nameEn}
              </span>
              {item.urgency === "high" ? (
                <Badge size="sm" tone="danger">
                  紧急
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-ink-subtle">
              现有 {formatQty(item.quantity)} / 安全线 {formatQty(item.safeStock)} {item.unit}
              {item.supplierName ? ` · ${item.supplierName}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-body font-semibold tabular text-ink">
              +{formatQty(item.suggestedQuantity)} {item.unit}
            </p>
            <p className="text-[11px] text-ink-subtle">
              {item.estimatedCost > 0 ? formatCurrency(item.estimatedCost) : "—"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatQty(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}
