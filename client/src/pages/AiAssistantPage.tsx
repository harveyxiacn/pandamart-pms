import { useState } from "react";
import { getAiInsights, getAiReorderAdvice, sendAiChat } from "../api/ai";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function AiAssistantPage() {
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [insight, setInsight] = useState<string>("");
  const [reorderAdvice, setReorderAdvice] = useState<string>("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-2 text-lg font-bold">AI 智能对话</h2>
        <p className="mb-3 text-sm text-slate-600">支持库存问题、价格波动分析、补货建议等自然语言问答。</p>
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="例如：最近一个月哪些蔬菜涨价最多？"
          />
          <Button
            onClick={async () => {
              if (!message.trim()) return;
              setLoading(true);
              const userMessage = message;
              setChat((prev) => [...prev, { role: "user", content: userMessage }]);
              setMessage("");
              try {
                const result = await sendAiChat(userMessage, conversationId);
                setConversationId(result.conversationId);
                setChat((prev) => [...prev, { role: "assistant", content: result.reply }]);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            {loading ? "发送中..." : "发送"}
          </Button>
        </div>

        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
          {chat.length === 0 ? (
            <p className="text-sm text-slate-500">暂无对话</p>
          ) : (
            chat.map((item, index) => (
              <div
                key={index}
                className={`rounded-lg px-3 py-2 text-sm ${
                  item.role === "user" ? "ml-12 bg-pine/10" : "mr-12 bg-slate-100"
                }`}
              >
                <p className="mb-1 text-xs font-semibold text-slate-500">{item.role === "user" ? "你" : "AI"}</p>
                <p className="whitespace-pre-wrap">{item.content}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-bold">经营洞察</h3>
          <div className="mb-3 flex gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                setLoading(true);
                try {
                  const result = await getAiInsights("week");
                  setInsight(result.summary + "\n\n" + result.alerts.map((a) => `- [${a.type}] ${a.message}`).join("\n"));
                } finally {
                  setLoading(false);
                }
              }}
            >
              生成周报
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                setLoading(true);
                try {
                  const result = await getAiInsights("month");
                  setInsight(result.summary + "\n\n" + result.alerts.map((a) => `- [${a.type}] ${a.message}`).join("\n"));
                } finally {
                  setLoading(false);
                }
              }}
            >
              生成月报
            </Button>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-sm">
            {insight || "点击按钮生成 AI 经营洞察。"}
          </pre>
        </Card>

        <Card>
          <h3 className="mb-2 font-bold">AI 补货建议</h3>
          <div className="mb-3">
            <Button
              variant="secondary"
              onClick={async () => {
                setLoading(true);
                try {
                  const result = await getAiReorderAdvice(undefined, "下周有社区活动，客流可能增加");
                  setReorderAdvice(result.advice);
                } finally {
                  setLoading(false);
                }
              }}
            >
              生成建议
            </Button>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-sm">
            {reorderAdvice || "点击按钮获取 AI 订货建议。"}
          </pre>
        </Card>
      </section>
    </div>
  );
}
