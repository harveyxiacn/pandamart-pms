import { describe, expect, it } from "vitest";
import { createDemoDb } from "../seed";
import { demoAnswer, demoKnowledge, demoReport } from "../assistant";

describe("demo local assistant", () => {
  const db = createDemoDb();

  it("builds a knowledge snapshot from the demo dataset", () => {
    const knowledge = demoKnowledge(db);
    expect(knowledge.summary.productCount).toBeGreaterThan(0);
    expect(knowledge.summary.sales30.orderCount).toBeGreaterThan(0);
    expect(knowledge.snapshot.windows.map((item) => item.days)).toEqual([1, 7, 30, 90]);
    expect(knowledge.knowledgeText).toContain("资料库快照");
  });

  it("answers reorder questions without an LLM", () => {
    const answer = demoAnswer(db, "哪些商品需要补货？");
    expect(answer.engine).toBe("local");
    expect(answer.intent).toBe("reorder");
    expect(answer.reply).toContain("补货建议");
  });

  it("looks up a single product by fuzzy Chinese name", () => {
    const answer = demoAnswer(db, "生姜还有多少库存？");
    expect(answer.intent).toBe("product_lookup");
    expect(answer.reply).toContain("生姜");
    expect(answer.reply).toContain("当前库存");
  });

  it("generates a local weekly report", () => {
    const report = demoReport(db, "week");
    expect(report.summary).toContain("周度经营简报");
    expect(report.summary).toContain("销售");
    expect(report.alerts.length).toBeGreaterThan(0);
  });
});
