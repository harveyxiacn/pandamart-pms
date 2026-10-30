import { useEffect, useState } from "react";
import {
  Cpu,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import {
  createAiProvider,
  deleteAiProvider,
  getAiProviders,
  setDefaultAiProvider,
  testAiProvider,
  updateAiProvider,
} from "../api/aiProviders";
import { getSettings, updateSettings } from "../api/settings";
import { getOcrStatus, type OcrStatus } from "../api/invoices";
import { getProductAliases, deleteProductAlias, type ProductAlias } from "../api/productAliases";
import type { AiProvider } from "../types";
import { Card, CardHeader } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { Field } from "../components/ui/Field";
import { Input, Textarea } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Drawer } from "../components/ui/Drawer";
import { Table, Td, Th } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton, SkeletonTable } from "../components/ui/Skeleton";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../components/ui/DropdownMenu";
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
  const [ocrStatus, setOcrStatus] = useState<OcrStatus | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderForm>(defaultProviderForm);
  const [providerDrawerOpen, setProviderDrawerOpen] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const showSuccess = (text: string) => toast.success(text);
  const showError = (err: unknown, fallback: string) => {
    toast.error(err instanceof Error ? err.message || fallback : fallback);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [settingRes, providerRes, aliasRes, ocrRes] = await Promise.all([
        getSettings(),
        getAiProviders(),
        // 别名学习列表失败不应阻塞设置页其余内容
        getProductAliases().catch(() => []),
        getOcrStatus().catch(() => null),
      ]);
      setSettings(settingRes);
      setProviders(providerRes);
      setAliases(aliasRes);
      setOcrStatus(ocrRes);
    } catch (err: unknown) {
      showError(err, "加载设置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editingProvider = Boolean(providerForm.id);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await updateSettings(settings);
      showSuccess("系统设置已保存");
    } catch (err: unknown) {
      showError(err, "系统设置保存失败");
    } finally {
      setSavingSettings(false);
    }
  };

  const openCreateProvider = () => {
    setProviderForm(defaultProviderForm);
    setProviderDrawerOpen(true);
  };

  const openEditProvider = (provider: AiProvider) => {
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
    setProviderDrawerOpen(true);
  };

  const saveProvider = async () => {
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

    setSavingProvider(true);
    try {
      if (editingProvider && providerForm.id) {
        await updateAiProvider(providerForm.id, payload);
      } else {
        await createAiProvider(payload);
      }
      setProviderDrawerOpen(false);
      setProviderForm(defaultProviderForm);
      await load();
      showSuccess("AI 提供商已保存");
    } catch (err: unknown) {
      showError(err, "AI 提供商保存失败");
    } finally {
      setSavingProvider(false);
    }
  };

  const handleTestProvider = async (provider: AiProvider) => {
    setTestingId(provider.id);
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
    } finally {
      setTestingId(null);
    }
  };

  const handleSetDefault = async (provider: AiProvider) => {
    try {
      await setDefaultAiProvider(provider.id);
      await load();
      showSuccess("已设置为默认提供商");
    } catch (err: unknown) {
      showError(err, "设置默认提供商失败");
    }
  };

  const handleDeleteProvider = async (provider: AiProvider) => {
    const ok = await confirm({
      title: "删除 AI 提供商",
      message: `确认删除「${provider.name}」吗？删除后使用该提供商的功能会回退到默认提供商。`,
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
  };

  const handleDeleteAlias = async (alias: ProductAlias) => {
    const ok = await confirm({
      title: "删除已学习匹配",
      message: `确认删除「${alias.aliasKey} → ${alias.productName}」这条匹配吗？`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteProductAlias(alias.id);
      await load();
      showSuccess("已删除该条学习记录");
    } catch (err: unknown) {
      showError(err, "删除失败");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="系统设置"
        description="调整库存预警阈值、通知方式，以及发票识别使用的 AI 提供商。"
        meta="设置对全部账号生效，修改后请在页内保存。"
      />

      <Card>
        <CardHeader
          title="运营参数"
          description="安全库存、滞销判定与价格预警的默认值。"
          action={
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-inset text-ink-muted">
              <Settings2 size={16} aria-hidden="true" />
            </span>
          }
        />
        {loading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        ) : null}
        {!loading ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="默认安全库存" htmlFor="setting-safe-stock" hint="新建商品未填写时的默认值。">
                <Input
                  id="setting-safe-stock"
                  type="number"
                  min="0"
                  value={settings.default_safe_stock || ""}
                  onChange={(e) => setSettings({ ...settings, default_safe_stock: e.target.value })}
                />
              </Field>
              <Field label="滞销天数" htmlFor="setting-slow-days" hint="超过该天数没有销量视为滞销。">
                <Input
                  id="setting-slow-days"
                  type="number"
                  min="1"
                  value={settings.slow_moving_days || ""}
                  onChange={(e) => setSettings({ ...settings, slow_moving_days: e.target.value })}
                />
              </Field>
              <Field label="价格预警阈值" htmlFor="setting-price-threshold" hint="0.1 表示价格波动超过 10% 时提醒。">
                <Input
                  id="setting-price-threshold"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.price_alert_threshold || ""}
                  onChange={(e) => setSettings({ ...settings, price_alert_threshold: e.target.value })}
                />
              </Field>
              <Field label="通知邮箱" htmlFor="setting-email" hint="邮件通知开启时接收预警。">
                <Input
                  id="setting-email"
                  type="email"
                  value={settings.notification_email || ""}
                  onChange={(e) => setSettings({ ...settings, notification_email: e.target.value })}
                />
              </Field>
              <Field label="库存预警" htmlFor="setting-stock-alert">
                <Select
                  id="setting-stock-alert"
                  value={settings.stock_alert_enabled || "true"}
                  onChange={(e) => setSettings({ ...settings, stock_alert_enabled: e.target.value })}
                >
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </Select>
              </Field>
              <Field label="邮件通知" htmlFor="setting-email-alert">
                <Select
                  id="setting-email-alert"
                  value={settings.email_notification_enabled || "false"}
                  onChange={(e) => setSettings({ ...settings, email_notification_enabled: e.target.value })}
                >
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </Select>
              </Field>
              <Field
                label="智能助手模式"
                htmlFor="setting-assistant-mode"
                hint="local 完全离线；llm 需要先在上方配置 AI 提供商；auto 有提供商时用 LLM。"
              >
                <Select
                  id="setting-assistant-mode"
                  value={settings.assistant_mode || "local"}
                  onChange={(e) => setSettings({ ...settings, assistant_mode: e.target.value })}
                >
                  <option value="local">本地资料库（推荐，无需 LLM）</option>
                  <option value="llm">LLM 增强</option>
                  <option value="auto">自动（有 LLM 时优先）</option>
                </Select>
              </Field>
              <Field
                label="资料库缓存（秒）"
                htmlFor="setting-assistant-ttl"
                hint="本地助手快照缓存时间；发票确认/销售出库后会立即失效。"
              >
                <Input
                  id="setting-assistant-ttl"
                  type="number"
                  min="15"
                  max="600"
                  value={settings.assistant_snapshot_ttl_seconds || "60"}
                  onChange={(e) =>
                    setSettings({ ...settings, assistant_snapshot_ttl_seconds: e.target.value })
                  }
                />
              </Field>
              <Field
                label="发票识别模式"
                htmlFor="setting-ocr-mode"
                hint={
                  <span>
                    auto：本地解析优先，置信度低才调用 AI；local：完全不用 AI；llm：保持 AI 优先。
                    <br />
                    本地 OCR：
                    {ocrStatus
                      ? ocrStatus.local.available
                        ? `${ocrStatus.local.version ? `Tesseract ${ocrStatus.local.version}` : "Tesseract"} · ${ocrStatus.local.requestedLanguages}${
                            ocrStatus.local.pdfRenderer.available ? "" : "（扫描 PDF 未安装 pdftoppm）"
                          }`
                        : "未安装（无需 AI 的图片/扫描件识别将不可用）"
                      : "检测中…"}
                  </span>
                }
              >
                <Select
                  id="setting-ocr-mode"
                  value={settings.invoice_ocr_mode || "auto"}
                  onChange={(e) => setSettings({ ...settings, invoice_ocr_mode: e.target.value })}
                >
                  <option value="auto">自动（本地优先，低置信度用 AI）</option>
                  <option value="local">仅本地（不调用任何 AI）</option>
                  <option value="llm">LLM 优先</option>
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex justify-end border-t border-line pt-4">
              <Button onClick={() => void saveSettings()} loading={savingSettings}>
                保存系统设置
              </Button>
            </div>
          </>
        ) : null}
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <CardHeader
            title="AI 提供商"
            description="用于发票 OCR 与智能分析，可配置多个并指定默认提供商。"
          />
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-inset text-ink-muted">
              <Cpu size={16} aria-hidden="true" />
            </span>
            <Button leadingIcon={Plus} size="sm" onClick={openCreateProvider}>
              新增提供商
            </Button>
          </div>
        </div>

        {loading ? <SkeletonTable rows={3} columns={5} /> : null}
        {!loading && providers.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title="还没有 AI 提供商"
            description="添加一个兼容 OpenAI 接口的服务商，发票识别与智能问答才能工作。"
            action={
              <Button leadingIcon={Plus} onClick={openCreateProvider}>
                新增提供商
              </Button>
            }
          />
        ) : null}
        {!loading && providers.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>名称</Th>
                <Th>模型</Th>
                <Th>用途</Th>
                <Th>状态</Th>
                <Th>最近测试</Th>
                <Th className="cell-actions">操作</Th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.id}>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="cell-strong">{provider.name}</span>
                      {provider.isDefault ? <Badge tone="info">默认</Badge> : null}
                    </div>
                    <p className="max-w-[16rem] truncate text-meta text-ink-subtle">{provider.baseUrl}</p>
                  </Td>
                  <Td className="font-mono text-meta">{provider.model}</Td>
                  <Td className="text-meta text-ink-muted">{provider.purpose}</Td>
                  <Td>
                    {provider.isActive ? <Badge tone="success">启用</Badge> : <Badge>停用</Badge>}
                  </Td>
                  <Td>
                    {testingId === provider.id ? (
                      <span className="text-meta text-ink-subtle">测试中…</span>
                    ) : provider.lastTestSuccess === null ? (
                      <span className="text-meta text-ink-subtle">未测试</span>
                    ) : provider.lastTestSuccess ? (
                      <Badge tone="success">成功 · {provider.lastTestLatencyMs}ms</Badge>
                    ) : (
                      <Badge tone="danger">失败</Badge>
                    )}
                  </Td>
                  <Td className="cell-actions">
                    <DropdownMenu
                      label={`${provider.name} 操作`}
                      trigger={(props) => (
                        <Button {...props} variant="ghost" size="sm" iconOnly aria-label="更多操作">
                          <MoreHorizontal size={16} aria-hidden="true" />
                        </Button>
                      )}
                    >
                      <DropdownMenuItem icon={Pencil} onSelect={() => openEditProvider(provider)}>
                        编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem icon={RefreshCw} onSelect={() => void handleTestProvider(provider)}>
                        测试连接
                      </DropdownMenuItem>
                      {!provider.isDefault ? (
                        <DropdownMenuItem icon={Star} onSelect={() => void handleSetDefault(provider)}>
                          设为默认
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        icon={Trash2}
                        tone="danger"
                        onSelect={() => void handleDeleteProvider(provider)}
                      >
                        删除
                      </DropdownMenuItem>
                    </DropdownMenu>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        <CardHeader
          title="OCR 商品匹配学习"
          description="在「发票识别」中确认商品归属后，系统会记住该供应商的条码 / 货号 / 名称，下次自动匹配。"
          className="mb-3"
          action={
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-inset text-ink-muted">
              <Sparkles size={16} aria-hidden="true" />
            </span>
          }
        />
        {!loading && aliases.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="暂无已学习记录"
            description="确认发票商品归属后，这里会出现自动学习的匹配规则。"
          />
        ) : null}
        {!loading && aliases.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>供应商</Th>
                <Th>字段类型</Th>
                <Th>原始值</Th>
                <Th>匹配商品</Th>
                <Th numeric>命中次数</Th>
                <Th className="cell-actions">操作</Th>
              </tr>
            </thead>
            <tbody>
              {aliases.map((alias) => (
                <tr key={alias.id}>
                  <Td className="text-meta">{alias.supplierName}</Td>
                  <Td>
                    <Badge>{ALIAS_TYPE_LABEL[alias.aliasType]}</Badge>
                  </Td>
                  <Td className="font-mono text-meta">{alias.aliasKey}</Td>
                  <Td className="cell-strong">{alias.productName}</Td>
                  <Td numeric>{alias.hits}</Td>
                  <Td className="cell-actions">
                    <Button
                      variant="danger-ghost"
                      size="sm"
                      onClick={() => void handleDeleteAlias(alias)}
                    >
                      删除
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      <Drawer
        open={providerDrawerOpen}
        onClose={() => setProviderDrawerOpen(false)}
        title={editingProvider ? "编辑 AI 提供商" : "新增 AI 提供商"}
        description={
          editingProvider
            ? "编辑模式下 API Key 留空将保持原值；填写后可覆盖更新。"
            : "兼容 OpenAI 接口的服务商；建议模型 gpt-5.2，Thinking Effort xhigh，上下文 32768。"
        }
        widthClassName="sm:max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProviderDrawerOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void saveProvider()} loading={savingProvider}>
              {editingProvider ? "保存修改" : "创建提供商"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="名称" htmlFor="provider-name" required>
              <Input
                id="provider-name"
                value={providerForm.name}
                onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                placeholder="例如 OpenAI 主力"
              />
            </Field>
            <Field label="模型" htmlFor="provider-model" required>
              <Input
                id="provider-model"
                value={providerForm.model}
                onChange={(e) => setProviderForm({ ...providerForm, model: e.target.value })}
                placeholder="例如 gpt-5.2"
              />
            </Field>
          </div>
          <Field label="Base URL" htmlFor="provider-base-url" required hint="形如 https://api.openai.com/v1">
            <Input
              id="provider-base-url"
              value={providerForm.baseUrl}
              onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field
            label="API Key"
            htmlFor="provider-api-key"
            hint={editingProvider ? "留空保持原值。" : "密钥只保存在服务端，界面不会回显。"}
          >
            <div className="relative">
              <KeyRound
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
              />
              <Input
                id="provider-api-key"
                type="password"
                autoComplete="new-password"
                value={providerForm.apiKey}
                onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                placeholder={editingProvider ? "留空则保持不变" : "sk-…"}
                className="pl-9 font-mono"
              />
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="用途" htmlFor="provider-purpose">
              <Select
                id="provider-purpose"
                value={providerForm.purpose}
                onChange={(e) =>
                  setProviderForm({ ...providerForm, purpose: e.target.value as ProviderForm["purpose"] })
                }
              >
                <option value="all">全部用途</option>
                <option value="ocr">发票识别（OCR）</option>
                <option value="analysis">数据分析</option>
                <option value="chat">智能问答</option>
              </Select>
            </Field>
            <Field label="Thinking Effort" htmlFor="provider-effort" hint="推理强度，越高越慢但更准。">
              <Select
                id="provider-effort"
                value={providerForm.thinkingEffort}
                onChange={(e) =>
                  setProviderForm({
                    ...providerForm,
                    thinkingEffort: e.target.value as ProviderForm["thinkingEffort"],
                  })
                }
              >
                <option value="xhigh">极高（xhigh）</option>
                <option value="high">高（high）</option>
                <option value="medium">中（medium）</option>
                <option value="low">低（low）</option>
                <option value="">使用服务商默认</option>
              </Select>
            </Field>
            <Field label="上下文长度" htmlFor="provider-max-tokens">
              <Input
                id="provider-max-tokens"
                type="number"
                min={1}
                value={providerForm.maxTokens}
                onChange={(e) => setProviderForm({ ...providerForm, maxTokens: e.target.value })}
              />
            </Field>
            <Field label="Temperature" htmlFor="provider-temperature">
              <Input
                id="provider-temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={providerForm.temperature}
                onChange={(e) => setProviderForm({ ...providerForm, temperature: e.target.value })}
              />
            </Field>
          </div>

          <Field label="备注" htmlFor="provider-notes">
            <Textarea
              id="provider-notes"
              value={providerForm.notes}
              onChange={(e) => setProviderForm({ ...providerForm, notes: e.target.value })}
              rows={2}
              placeholder="可选，例如用途说明或计费提醒"
            />
          </Field>

          <div className="flex flex-wrap gap-4 rounded-lg border border-line bg-surface-muted px-3 py-2.5">
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line-strong accent-accent"
                checked={providerForm.supportsVision}
                onChange={(e) => setProviderForm({ ...providerForm, supportsVision: e.target.checked })}
              />
              支持图片输入（发票扫描）
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line-strong accent-accent"
                checked={providerForm.isActive}
                onChange={(e) => setProviderForm({ ...providerForm, isActive: e.target.checked })}
              />
              启用该提供商
            </label>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
