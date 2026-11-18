import { t } from "./index";

// Existing demo databases store the rendered notification. Match only formats
// emitted by the demo, keeping product names, lot numbers and amounts intact.
export function notificationMessage(message: string): string {
  const stock = /^(.+) 库存仅剩 ([\d.-]+)，低于安全库存 ([\d.-]+)$/.exec(message);
  if (stock) return t("{0} 库存仅剩 {1}，低于安全库存 {2}", ...stock.slice(1));
  const batch = /^(.+) 批次 (.+) 数量 ([\d.-]+)，到期日 (\d{4}-\d{2}-\d{2})(，已过期请及时报损)?$/.exec(message);
  if (batch) return t("{0} 批次 {1} 数量 {2}，到期日 {3}{4}", ...batch.slice(1, 5), t(batch[5] ?? ""));
  const upload = /^张小明上传了 (\d+) 张新发票，请及时审核$/.exec(message);
  if (upload) return t("张小明上传了 {0} 张新发票，请及时审核", upload[1]);
  const price = /^(.+) 进价由 ([\d.-]+) 变为 ([\d.-]+)（([+-]?)([\d.]+)%）$/.exec(message);
  if (price) return t("{0} 进价由 {1} 变为 {2}（{3}{4}%）", ...price.slice(1));
  return t(message);
}
