import { apiClient, unwrap } from "./client";

export function sendAiChat(message: string, conversationId: string | null) {
  return unwrap<{
    conversationId: string;
    reply: string;
    dataUsed: {
      tables: string[];
      dateRange: string;
      recordCount: number;
    };
  }>(apiClient.post("/ai/chat", { message, conversationId }));
}

export function getAiInsights(period: "week" | "month" = "week") {
  return unwrap<{
    period: string;
    summary: string;
    alerts: Array<{ type: string; message: string }>;
    generatedAt: string;
  }>(apiClient.get("/ai/insights", { params: { period } }));
}

export function getAiReorderAdvice(categoryId?: number, context?: string) {
  return unwrap<{
    advice: string;
    suggestedItems: Array<{
      productId: number;
      nameZh: string | null;
      suggestedQty: number;
      normalQty: number;
      reason: string;
    }>;
  }>(apiClient.post("/ai/reorder-advice", { categoryId, context }));
}
