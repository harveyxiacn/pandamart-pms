import { useState } from "react";
import {
  Bot,
  Lightbulb,
  MessageSquareText,
  RefreshCw,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { getAiInsights, getAiReorderAdvice, sendAiChat } from "../api/ai";
import { PageHeader } from "../components/ui/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Textarea } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { cn } from "../utils/classnames";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const suggestions = [
  "最近一个月哪些商品涨价最多？",
  "哪些商品需要尽快补货？",
  "这个月毛利下降的原因是什么？",
];

export default function AiAssistantPage() {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [insight, setInsight] = useState<string>("");
  const [reorderAdvice, setReorderAdvice] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState<"week" | "month" | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);

  const send = async (text?: string) => {
    const content = (text ?? message).trim();
    if (!content || loading) return;
    setLoading(true);
    setChat((prev) => [...prev, { role: "user", content }]);
    setMessage("");
    try {
      const result = await sendAiChat(content, conversationId);
      setConversationId(result.conversationId);
      setChat((prev) => [...prev, { role: "assistant", content: result.reply }]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "AI 对话失败");
      setChat((prev) => [
        ...prev,
        { role: "assistant", content: "抱歉，这次请求没有成功。请稍后重试，或在系统设置中检查 AI 提供商。" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const generateInsight = async (period: "week" | "month") => {
    setInsightLoading(period);
    try {
      const result = await getAiInsights(period);
      setInsight(
        result.summary +
          (result.alerts.length
            ? "\n\n" + result.alerts.map((a) => `- [${a.type}] ${a.message}`).join("\n")
            : "")
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "生成经营洞察失败");
    } finally {
      setInsightLoading(null);
    }
  };

  const generateAdvice = async () => {
    setAdviceLoading(true);
    try {
      const result = await getAiReorderAdvice(undefined, "下周有社区活动，客流可能增加");
      setReorderAdvice(result.advice);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "生成补货建议失败");
    } finally {
      setAdviceLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI 助手"
        description="用自然语言查询库存与经营数据，生成周报和补货建议。结果仅供参考，请结合实际情况判断。"
        meta="由系统设置的默认 AI 提供商回答"
      />

      <Card padded={false} className="flex flex-col overflow-hidden">
        <div className="border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <MessageSquareText size={16} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-body-lg font-semibold text-ink">智能对话</h2>
              <p className="text-meta text-ink-subtle">支持库存、价格波动与补货建议等问答</p>
            </div>
          </div>
        </div>

        <div
          role="log"
          aria-live="polite"
          aria-label="对话记录"
          className="min-h-[18rem] flex-1 space-y-4 overflow-y-auto bg-surface-muted/40 px-4 py-4 sm:px-5"
        >
          {chat.length === 0 ? (
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-ink-subtle ring-1 ring-line">
                <Sparkles size={20} aria-hidden="true" />
              </span>
              <div>
                <p className="text-body font-medium text-ink">问点什么试试</p>
                <p className="mt-0.5 text-meta text-ink-subtle">
                  可以直接问数据，例如「上周采购额最高的供应商是谁」。
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-meta text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chat.map((item, index) => (
              <div
                key={index}
                className={cn("flex gap-2.5", item.role === "user" ? "flex-row-reverse" : "flex-row")}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    item.role === "user"
                      ? "bg-ink text-white"
                      : "bg-accent-soft text-accent"
                  )}
                  aria-hidden="true"
                >
                  {item.role === "user" ? <User size={14} /> : <Bot size={14} />}
                </span>
                <div
                  className={cn(
                    "max-w-[46rem] rounded-xl px-3.5 py-2.5 text-body leading-6",
                    item.role === "user"
                      ? "rounded-tr-sm bg-ink text-white"
                      : "rounded-tl-sm border border-line bg-surface text-ink"
                  )}
                >
                  <span className="sr-only">{item.role === "user" ? "你：" : "AI："}</span>
                  <p className="whitespace-pre-wrap break-words">{item.content}</p>
                </div>
              </div>
            ))
          )}
          {loading ? (
            <div className="flex items-center gap-2 text-meta text-ink-subtle">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Bot size={14} aria-hidden="true" />
              </span>
              AI 正在思考…
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
              placeholder="输入问题，Enter 发送，Shift + Enter 换行"
              className="min-h-[3.25rem] resize-none"
            />
            <Button
              type="submit"
              leadingIcon={Send}
              loading={loading}
              disabled={loading || !message.trim()}
              className="h-[3.25rem] shrink-0"
            >
              发送
            </Button>
          </div>
          <p className="mt-1.5 text-meta text-ink-subtle">
            AI 可能产生不准确的结论，涉及金额与库存请回到对应模块核对。
          </p>
        </form>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader
            title="经营洞察"
            description="汇总区间内的关键变化与异常。"
            action={
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={insightLoading === "week"}
                  onClick={() => void generateInsight("week")}
                >
                  周报
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={RefreshCw}
                  loading={insightLoading === "month"}
                  onClick={() => void generateInsight("month")}
                >
                  生成月报
                </Button>
              </div>
            }
          />
          <div className="mt-4 min-h-[14rem] flex-1 rounded-lg border border-line bg-surface-muted p-3.5">
            {insight ? (
              <p className="whitespace-pre-wrap text-body leading-6 text-ink-muted">{insight}</p>
            ) : (
              <p className="text-meta text-ink-subtle">点击「周报」或「生成月报」，AI 会汇总销售、采购与库存异常。</p>
            )}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="AI 补货建议"
            description="结合近期销量与安全库存给出订货量。"
            action={
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={Lightbulb}
                loading={adviceLoading}
                onClick={() => void generateAdvice()}
              >
                生成建议
              </Button>
            }
          />
          <div className="mt-4 min-h-[14rem] flex-1 rounded-lg border border-line bg-surface-muted p-3.5">
            {reorderAdvice ? (
              <p className="whitespace-pre-wrap text-body leading-6 text-ink-muted">{reorderAdvice}</p>
            ) : (
              <p className="text-meta text-ink-subtle">
                点击「生成建议」，AI 会参考补货清单与即将到来的社区活动客流。
              </p>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
