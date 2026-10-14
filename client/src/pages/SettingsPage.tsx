import { useEffect, useState } from "react";
import {
  createAiProvider,
  deleteAiProvider,
  getAiProviders,
  setDefaultAiProvider,
  testAiProvider,
  updateAiProvider,
} from "../api/aiProviders";
import { getSettings, updateSettings } from "../api/settings";
import { getProductAliases, deleteProductAlias, type ProductAlias } from "../api/productAliases";
import type { AiProvider } from "../types";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Table } from "../components/ui/Table";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";

type ProviderForm = {
  id?: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  thinkingEffort: "xhigh" | "high" | "medium" | "low" | "";
  supportsVision: boolean;
  purpose: "ocr" | "analysis" | "chat" | "all";
  isActive: boolean;
  maxTokens: string;
  temperature: string;
  notes: string;
};

const ALIAS_TYPE_LABEL: Record<ProductAlias["aliasType"], string> = {
  barcode: "条码",
  code: "货号",
  name: "名称",
};

const defaultProviderForm: ProviderForm = {
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  thinkingEffort: "xhigh",
  supportsVision: true,
  purpose: "all",
  isActive: true,
  maxTokens: "32768",
  temperature: "0.3",
  notes: "",
};

export default function SettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [aliases, setAliases] = useState<ProductAlias[]>([]);
  const [providerForm, setProviderForm] = useState<ProviderForm>(defaultProviderForm);
  const [editingProvider, setEditingProvider] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  const showSuccess = (text: string) => {
    setMessageTone("success");
    setMessage(text);
    toast.success(text);
  };

  const showError = (err: unknown, fallback: string) => {
    const errorMessage = err instanceof Error ? err.message : fallback;
    setMessageTone("error");
    setMessage(errorMessage || fallback);
    toast.error(errorMessage || fallback);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [settingRes, providerRes, aliasRes] = await Promise.all([
        getSettings(),
        getAiProviders(),
        // 别名学习列表失败不应阻塞设置页其余内容
        getProductAliases().catch(() => []),
      ]);
      setSettings(settingRes);
      setProviders(providerRes);
      setAliases(aliasRes);
    } catch (err: unknown) {
      showError(err, "加载设置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-lg font-bold">系统设置</h2>
        {loading ? <SkeletonCard /> : null}
        {!loading ? (
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-sm">
              默认安全库存
              <Input
                value={settings.default_safe_stock || ""}
                onChange={(e) => setSettings({ ...settings, default_safe_stock: e.target.value })}
              />
            </label>
            <label className="text-sm">
              滞销天数
              <Input
                value={settings.slow_moving_days || ""}
                onChange={(e) => setSettings({ ...settings, slow_moving_days: e.target.value })}
              />
            </label>
            <label className="text-sm">
              价格预警阈值（0.1=10%）
              <Input
                value={settings.price_alert_threshold || ""}
                onChange={(e) => setSettings({ ...settings, price_alert_threshold: e.target.value })}
              />
            </label>
            <label className="text-sm">
              通知邮箱
              <Input
                value={settings.notification_email || ""}
                onChange={(e) => setSettings({ ...settings, notification_email: e.target.value })}
              />
            </label>
            <label className="text-sm">
              库存预警开关
              <Select
                value={settings.stock_alert_enabled || "true"}
                onChange={(e) => setSettings({ ...settings, stock_alert_enabled: e.target.value })}
              >
                <option value="true">开启</option>
                <option value="false">关闭</option>
              </Select>
            </label>
            <label className="text-sm">
              邮件通知开关
              <Select
                value={settings.email_notification_enabled || "false"}
                onChange={(e) => setSettings({ ...settings, email_notification_enabled: e.target.value })}
              >
                <option value="true">开启</option>
                <option value="false">关闭</option>
              </Select>
            </label>
          </div>
        ) : null}

        <div className="mt-3">
          <Button
            onClick={async () => {
              try {
                await updateSettings(settings);
                showSuccess("系统设置已保存");
              } catch (err: unknown) {
                showError(err, "系统设置保存失败");
              }
            }}
          >
            保存系统设置
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">{editingProvider ? "编辑 AI 提供商" : "新增 AI 提供商"}</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <Input
            placeholder="名称"
            value={providerForm.name}
            onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
          />
          <Input
            placeholder="Base URL"
            value={providerForm.baseUrl}
            onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
          />
          <Input
            placeholder="API Key"
            type="password"
            autoComplete="new-password"
            value={providerForm.apiKey}
            onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
          />
          <Input
            placeholder="模型"
            value={providerForm.model}
            onChange={(e) => setProviderForm({ ...providerForm, model: e.target.value })}
          />
          <Select
            value={providerForm.purpose}
            onChange={(e) =>
              setProviderForm({ ...providerForm, purpose: e.target.value as ProviderForm["purpose"] })
            }
          >
            <option value="all">all</option>
            <option value="ocr">ocr</option>
            <option value="analysis">analysis</option>
            <option value="chat">chat</option>
          </Select>
          <Select
            value={providerForm.thinkingEffort}
            onChange={(e) =>
              setProviderForm({
                ...providerForm,
                thinkingEffort: e.target.value as ProviderForm["thinkingEffort"],
              })
            }
          >
            <option value="xhigh">xhigh</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
            <option value="">不设置</option>
          </Select>
          <Input
            placeholder="上下文长度（max tokens）"
            type="number"
            min={1}
            value={providerForm.maxTokens}
            onChange={(e) => setProviderForm({ ...providerForm, maxTokens: e.target.value })}
          />
          <Input
            placeholder="temperature"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={providerForm.temperature}
            onChange={(e) => setProviderForm({ ...providerForm, temperature: e.target.value })}
          />
          <Input
            placeholder="备注"
            value={providerForm.notes}
            onChange={(e) => setProviderForm({ ...providerForm, notes: e.target.value })}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {editingProvider
            ? "编辑模式下 API Key 留空将保持原值；填写后可覆盖更新。"
            : "建议模型：gpt-5.2；Thinking Effort：xhigh；上下文长度建议 32768。"}
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            onClick={async () => {
              try {
                const payload = {
                  name: providerForm.name.trim(),
                  baseUrl: providerForm.baseUrl.trim(),
                  apiKey: providerForm.apiKey,
                  model: providerForm.model.trim(),
                  thinkingEffort: providerForm.thinkingEffort || null,
                  supportsVision: providerForm.supportsVision,
                  purpose: providerForm.purpose,
                  isActive: providerForm.isActive,
                  maxTokens: Math.max(1, Number(providerForm.maxTokens || "32768")),
                  temperature: Number(providerForm.temperature || "0.3"),
                  notes: providerForm.notes || null,
                };

                if (!payload.name || !payload.baseUrl || !payload.model) {
                  showError(new Error("名称、Base URL、模型不能为空"), "AI 提供商保存失败");
                  return;
                }
                if (!editingProvider && !providerForm.apiKey.trim()) {
                  showError(new Error("新增 AI 提供商时必须填写 API Key"), "AI 提供商保存失败");
                  return;
                }

                if (editingProvider && providerForm.id) {
                  await updateAiProvider(providerForm.id, payload);
                } else {
                  await createAiProvider(payload);
                }

                setProviderForm(defaultProviderForm);
                setEditingProvider(false);
                await load();
                showSuccess("AI 提供商已保存");
              } catch (err: unknown) {
                showError(err, "AI 提供商保存失败");
              }
            }}
          >
            {editingProvider ? "保存修改" : "创建提供商"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setProviderForm(defaultProviderForm);
              setEditingProvider(false);
            }}
          >
            重置
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">AI 提供商列表</h2>
        <Table>
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-600">
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">模型</th>
              <th className="px-3 py-2">用途</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">测试</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  {provider.name}
                  {provider.isDefault ? (
                    <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-700">默认</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">{provider.model}</td>
                <td className="px-3 py-2">{provider.purpose}</td>
                <td className="px-3 py-2">{provider.isActive ? "启用" : "停用"}</td>
                <td className="px-3 py-2">
                  {provider.lastTestSuccess === null
                    ? "-"
                    : provider.lastTestSuccess
                    ? `成功 (${provider.lastTestLatencyMs}ms)`
                    : "失败"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditingProvider(true);
                        setProviderForm({
                          id: provider.id,
                          name: provider.name,
                          baseUrl: provider.baseUrl,
                          apiKey: "",
                          model: provider.model,
                          thinkingEffort: provider.thinkingEffort || "",
                          supportsVision: provider.supportsVision,
                          purpose: provider.purpose,
                          isActive: provider.isActive,
                          maxTokens: String(provider.maxTokens),
                          temperature: String(provider.temperature),
                          notes: provider.notes || "",
                        });
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const result = await testAiProvider(provider.id);
                          if (result.success) {
                            showSuccess(`测试成功，延迟 ${result.latencyMs}ms`);
                          } else {
                            showError(new Error(`测试失败: ${result.message}`), "测试失败");
                          }
                          await load();
                        } catch (err: unknown) {
                          showError(err, "测试失败");
                        }
                      }}
                    >
                      测试
                    </Button>
                    {!provider.isDefault ? (
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await setDefaultAiProvider(provider.id);
                            await load();
                            showSuccess("已设置为默认提供商");
                          } catch (err: unknown) {
                            showError(err, "设置默认提供商失败");
                          }
                        }}
                      >
                        设默认
                      </Button>
                    ) : null}
                    <Button
                      variant="danger"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "删除 AI 提供商",
                          message: `确认删除 ${provider.name} 吗？`,
                          confirmText: "删除",
                          danger: true,
                        });
                        if (!ok) return;
                        try {
                          await deleteAiProvider(provider.id);
                          await load();
                          showSuccess("AI 提供商已删除");
                        } catch (err: unknown) {
                          showError(err, "删除失败");
                        }
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {message ? (
          <p className={`mt-3 text-sm ${messageTone === "success" ? "text-emerald-700" : "text-rose-700"}`}>
            {message}
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-bold">OCR 商品匹配学习</h2>
        <p className="mb-3 text-sm text-slate-600">
          每次在「发票识别」中确认商品归属，系统会把该供应商的原始字段（条码 / 货号 / 名称）记为该商品的别名，
          下次识别同一供应商的发票即可高置信度自动匹配。命中次数越多表示该映射使用越频繁；若发现错误匹配可在此删除。
        </p>
        {aliases.length === 0 ? (
          <p className="text-sm text-slate-500">暂无已学习记录。确认发票后这里会出现自动学习的匹配。</p>
        ) : (
          <Table>
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600">
                <th className="px-3 py-2">供应商</th>
                <th className="px-3 py-2">字段类型</th>
                <th className="px-3 py-2">原始值</th>
                <th className="px-3 py-2">匹配商品</th>
                <th className="px-3 py-2">命中次数</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {aliases.map((alias) => (
                <tr key={alias.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{alias.supplierName}</td>
                  <td className="px-3 py-2">{ALIAS_TYPE_LABEL[alias.aliasType]}</td>
                  <td className="px-3 py-2 font-mono text-xs">{alias.aliasKey}</td>
                  <td className="px-3 py-2">{alias.productName}</td>
                  <td className="px-3 py-2">{alias.hits}</td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "删除已学习匹配",
                          message: `确认删除「${alias.aliasKey} → ${alias.productName}」这条匹配吗？`,
                        });
                        if (!ok) return;
                        try {
                          await deleteProductAlias(alias.id);
                          await load();
                          showSuccess("已删除该条学习记录");
                        } catch (err: unknown) {
                          showError(err, "删除失败");
                        }
                      }}
                    >
                      删除
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
