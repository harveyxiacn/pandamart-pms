import { t } from "./index";

function isField(target: EventTarget | null): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

export function installValidationMessages() {
  document.addEventListener("invalid", ({ target }) => {
    if (!isField(target)) return;
    target.setCustomValidity("");
    const validity = target.validity;
    if (validity.valid) return;
    let message = t("请输入有效值。");
    if (validity.valueMissing) message = t("请输入此字段。");
    if (target instanceof HTMLInputElement) {
      if (validity.rangeUnderflow) message = t("最小值为 {0}。", target.min);
      if (validity.rangeOverflow) message = t("最大值为 {0}。", target.max);
      if (validity.typeMismatch && target.type === "email") message = t("请输入有效的邮箱地址。");
    }
    target.setCustomValidity(message);
  }, true);
  document.addEventListener("input", ({ target }) => {
    if (isField(target)) target.setCustomValidity("");
  });
}
