# 设计系统与界面规范

面向运维后台（data-dense dashboard）的一套最小设计系统：语义 token、组件状态、可访问性约束。
目标不是"更好看"，而是**同一套规则在 19 个页面、两种语言、深浅两种背景下都不出错**。

## 1. 为什么换掉原来的红色主题

原主题把品牌红同时用于三类语义完全不同的地方：主按钮、错误提示、`nav` 激活态。结果是
"删除"和"保存"在视觉上同样醒目，错误提示和导航高亮无法区分，页面读起来像消费端产品而不是
运营工具。新方案把颜色拆成**角色**，红色只保留在 `danger` 一个语义上，品牌红退到 logo 内部。

## 2. Token

所有值定义在 `src/styles/globals.css` 的 `:root`，以 RGB 三元组存储，因此 Tailwind 的透明度
修饰符（`bg-primary/10`）照常工作。组件只引用角色名，不写十六进制。

| Token | 值 | 用途 |
|---|---|---|
| `--surface` | `#ffffff` | 卡片、表格、弹层底 |
| `--surface-muted` | `#f8fafc` | 页面底、次级按钮 hover |
| `--surface-inset` | `#f1f5f9` | 输入框底、按下态、进度条轨道 |
| `--line` | `#e2e8f0` | 分隔线、卡片描边 |
| `--line-strong` | `#cbd5e1` | 输入框描边 |
| `--ink` | `#0f172a` | 主文本 |
| `--ink-muted` | `#475569` | 次级文本 |
| `--ink-subtle` | `#64748b` | 占位符、辅助说明 |
| `--primary` | `#0f172a` | 主操作、导航激活 |
| `--primary-hover` | `#020617` | 主操作 hover / active |
| `--accent` | `#0369a1` | 焦点环、进度、链接 |
| `--accent-soft` | `#e0f2fe` | 拖放区 hover |
| `--danger` | `#b91c1c` | 破坏性操作、错误、负向指标 |
| `--danger-soft` | `#fee2e2` | 错误提示底 |
| `--warning` | `#b45309` | 警告、临期 |
| `--warning-soft` | `#fef3c7` | 警告底 |
| `--success` | `#047857` | 成功、正向指标 |
| `--success-soft` | `#d1fae5` | 成功底 |
| `--ring` | `#0369a1` | `:focus-visible` 轮廓 |

**兼容别名**：`pine → primary`、`deep → primary-hover`、`coral → danger`、`amber → warning`、
`mist → surface-muted`。旧代码里的 `bg-pine`、`text-ink` 会自动跟随新 token，因此这次改主题
不需要逐页机械替换。

## 3. 排版

- 界面字体 `Fira Sans`，中文回退 `Noto Sans SC`，再回退系统字体。
- 正文 15px / 行高 1.5；表格与金额一律 `.tabular`（`font-variant-numeric: tabular-nums`），
  数字变化时列宽不跳动。
- 字号只有五档：11（标签）、13（辅助）、15（正文）、18（区块标题）、24（页面标题）。
- 颜色不承担唯一的层级信息：标题同时用字号和字重区分。

## 4. 组件状态矩阵

| 组件 | default | hover | focus | active | disabled | error |
|---|---|---|---|---|---|---|
| Button / primary | `bg-primary` | `bg-primary-hover` | 全局焦点环 | 同 hover | 50% 透明 + 禁用光标 | — |
| Button / secondary | 描边 + 白底 | `bg-surface-inset` | 全局焦点环 | 同 hover | 同上 | — |
| Button / danger | `bg-danger` | `danger/90` | 全局焦点环 | 同 hover | 同上 | — |
| Input | `border-line-strong` | 描边加深 | `ring-accent/25` | — | inset 底 + 弱化文字 | `aria-invalid` → 红描边 + 红环 |
| Badge | 中性 | — | — | — | — | 四种 tone 均带 `ring-inset` |

焦点只有一套实现：`:root :focus-visible` 统一给 `2px` 的 `--ring` 轮廓并留 `2px` 偏移。
组件内不再各自写 `focus:ring`，避免出现"有的地方有环、有的地方没有"。

## 5. 可访问性

已落地（可在源码中核对）：

- **跳转链接**：`MainLayout` 首个可聚焦元素是"跳到主要内容"，指向 `#main-content`。
- **焦点可见**：全局 `:focus-visible`，鼠标点击不出现多余描边。
- **减少动效**：`prefers-reduced-motion: reduce` 下动画与过渡压到 0.01ms。
- **图标语义**：搜索下拉里的分类图标由 emoji 换成 Lucide SVG，并标 `aria-hidden`；
  纯图标按钮（清除搜索、密码显隐、通知）都有 `aria-label`，通知按钮同时用
  `aria-label` 播报未读条数。
- **错误播报**：登录失败使用 `role="alert"`，图标 `aria-hidden`，文字保留。
- **表单**：用户名/密码有可见 `<label>`，`autoComplete` 分别为 `username` /
  `current-password`，密码提供显隐切换并暴露 `aria-pressed`。
- **色彩非唯一信号**：Badge 的四种 tone 同时使用文字标签；趋势指标同时带箭头图标。
- **触摸尺寸**：按钮最小高度 36px，图标按钮通过内边距补足点击区。

尚未验证：屏幕阅读器实测、200% 缩放下的重排、真实数据下的深色模式（当前只有浅色主题）。

## 6. 已知取舍

- 深色模式尚未实现。token 层已经就位，但需要单独校验对比度，不能靠反转浅色值。
- 部分老页面仍用 `bg-white` / `text-slate-*` 字面量；它们与新 token 取值接近，视觉一致，
  但不参与主题切换。后续替换时按页面进行，不需要一次性全改。
- 图表（Recharts）的配色未纳入 token，下一轮再统一。

## 7. 验证

```bash
cd client
npx tsc --noEmit        # 类型
npx vitest run          # 23 个单测
npm run build           # 构建
```

界面证据：登录页在 1440×900 与 390×844 两种视口下截图核对，确认无横向滚动、卡片居中、
密码切换可用。
