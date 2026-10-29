# 设计系统与界面规范

面向运维后台（data-dense dashboard）的一套最小设计系统：语义 token、组件状态、可访问性约束。
目标不是"更好看"，而是**同一套规则在全部页面、两种语言、桌面与手机上都成立**。

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
| `--surface-raised` | `#ffffff` | 弹层/抽屉（与页面底形成层级） |
| `--surface-muted` | `#f7f8fa` | 页面底、次级按钮 hover、表头 |
| `--surface-inset` | `#f1f5f9` | 输入框底、按下态、进度条轨道 |
| `--line` | `#e2e8f0` | 分隔线、卡片描边 |
| `--line-strong` | `#cbd5e1` | 输入框描边 |
| `--ink` | `#0f172a` | 主文本 |
| `--ink-muted` | `#475569` | 次级文本 |
| `--ink-subtle` | `#64748b` | 占位符、辅助说明 |
| `--primary` | `#0f172a` | 主操作、Logo 面板 |
| `--primary-hover` | `#020617` | 主操作 hover / active |
| `--accent` | `#0369a1` | 焦点环、选中导航、链接、主要数据系列 |
| `--accent-hover` | `#075985` | 强调色 hover |
| `--accent-soft` | `#e0f2fe` | 选中底、拖放区 hover |
| `--danger` / `--danger-soft` | `#b91c1c` / `#fef2f2` | 破坏性操作、错误、负向指标 |
| `--warning` / `--warning-soft` | `#b45309` / `#fffbeb` | 警告、临期、待处理 |
| `--success` / `--success-soft` | `#047857` / `#ecfdf5` | 成功、正向指标 |
| `--ring` | `#0369a1` | `:focus-visible` 轮廓 |
| `--chart-1…6` | 见下 | 图表分类色，按出现频率排序 |
| `--grid` | `#e2e8f0` | 图表网格线 |

图表色板（`--chart-1…6`）：`#0369a1` 蓝、`#0f766e` 青、`#b45309` 琥珀、`#6d28d9` 紫、
`#be185d` 玫红、`#475569` 石板灰。图表只引用 token，不写裸色值，因此未来切主题时图表一起走。

**兼容别名**：`pine → primary`、`deep → primary-hover`、`coral → danger`、`amber → warning`、
`mist → surface-muted`。旧代码里的 `bg-pine`、`text-ink` 会自动跟随新 token。

## 3. 排版

- 界面字体 `Fira Sans`，中文回退 `Noto Sans SC`，再回退系统字体。
- 正文 15px / 行高 1.5；表格与金额一律 `.tabular`（`font-variant-numeric: tabular-nums`），
  数字变化时列宽不跳动。
- 语义字号（Tailwind `fontSize` 扩展）：`label` 11、`meta` 12、`body` 13、`body-lg` 15、
  `title` 17、`display` 22。页面标题统一用 `.page-title` / `PageHeader`，不再逐页写字号。
- 颜色不承担唯一的层级信息：标题同时用字号和字重区分。

## 4. 布局与密度

- 应用骨架：`Sidebar 15.5rem + 主列`，主列内容最大宽度 1400px，垂直间距 20–24px。
- 页面以 `PageHeader`（标题 + 说明 + 操作区）开头，接着是 `StatCard` 概览、筛选 `Toolbar`、
  数据 `Card + Table`。
- 手机端侧栏收起为底部 `MobileNav`（5 个主入口 + 「更多」浮层）；抽屉在小屏变成底部 sheet，
  底部操作栏带 `safe-area-inset-bottom`。
- 表格统一 `.data-table`：表头粘性、行 hover、数字右对齐、`.cell-strong`、`.cell-actions`。

## 5. 组件与状态矩阵

| 组件 | default | hover | focus | active / selected | disabled | error / loading |
|---|---|---|---|---|---|---|
| Button / primary | `bg-primary` | `primary-hover` | 全局焦点环 | 同 hover | 50% + 禁用光标 | loading 显示 spinner 并禁用 |
| Button / secondary | 描边 + 白底 | 描边加深 + muted 底 | 全局焦点环 | inset 底 | 同上 | — |
| Button / ghost、link | 透明 | inset 底 / 下划线 | 全局焦点环 | inset 底 | 同上 | — |
| Button / danger、danger-ghost | 红底 / 红字 | 90% / 红 soft 底 | 全局焦点环 | 同 hover | 同上 | — |
| Input / Select / Textarea | `border-line-strong` | 描边加深 | `ring-accent/20` | — | inset 底 + 弱化文字 | `aria-invalid` → 红描边 + 红环 |
| Field | 可见 label + 提示 | — | label 与控件 `htmlFor` 关联 | — | — | `role="alert"` 错误文案；必填 `*` 由 CSS 生成，不进入可访问名称 |
| Badge | 5 种 tone，全部 `ring-inset` | — | — | — | — | tone 不单独承担语义，总配文字 |
| Table | 粘性表头、行 hover | 行底色变化 | 行内控件继承全局焦点环 | `data-selected` 行 | — | 空状态 / 骨架屏 |
| DropdownMenu | 触发器 + `aria-haspopup` | 菜单项底色 | 打开后焦点进入第一项，↑↓/Home/End 切换 | `aria-expanded` | 菜单项 `disabled` | Esc 关闭并把焦点还给触发器 |
| DatePicker / RangePicker | 描边触发器 | 描边加深 | 日历格 `aria-selected` + 焦点 | 选中日/区间高亮 | — | 「再选择结束日期」提示 |
| SegmentedControl | 分段按钮组 | 文字加深 | 全局焦点环 | `aria-pressed` + 白底阴影 | — | 可带计数徽标 |
| Modal / Drawer | 遮罩 + 面板 | — | 焦点陷阱 + 初始焦点 | — | — | Esc 关闭、滚动锁定、焦点归还，`aria-modal` + labelledby |
| Toast | 右上/底部堆叠 | — | — | — | — | `role="status"` / `role="alert"` |

焦点只有一套实现：`:root :focus-visible` 统一给 `2px` 的 `--ring` 轮廓并留 `2px` 偏移。
组件内不再各自写 `focus:ring`，避免"有的地方有环、有的地方没有"。

## 6. 日期与时间

- `src/utils/date.ts` 全部按**浏览器本地时区**处理：`YYYY-MM-DD` 字符串先拆成
  `new Date(y, m-1, d)`，避免 `new Date("2026-03-01")` 按 UTC 解析导致的 ±1 天漂移。
- `DatePicker` / `DateRangePicker` 基于同一套日历网格（周一起始、42 格），支持键盘方向键移动、
  Enter 选择、Esc 关闭；区间选择提供「今天 / 近 7 天 / 近 30 天 / 本月 / 上月 / 今年」预设。
- 只显示日期时统一用 `formatISO`，不要直接 `new Date("YYYY-MM-DD")`。

## 7. 可访问性

已落地（可在源码中核对）：

- **跳转链接**：`MainLayout` 首个可聚焦元素是"跳到主要内容"，指向 `#main-content`。
- **焦点可见**：全局 `:focus-visible`，鼠标点击不出现多余描边。
- **减少动效**：`prefers-reduced-motion: reduce` 下动画与过渡压到 0.01ms。
- **弹层**：Modal/Drawer 使用 `useDialogA11y`（滚动锁定、Tab 焦点陷阱、Esc、焦点归还）；
  Popover / 菜单渲染到 portal，避免被表格滚动容器裁切。
- **菜单**：WAI-ARIA menu 模式，触发器 `aria-haspopup="menu"` + `aria-expanded`，
  菜单项 `role="menuitem"`，↑↓/Home/End 导航，Tab 关闭。
- **表单**：可见 `<label>` 与 `htmlFor`；错误 `role="alert"`；必填标记用 CSS 生成内容，
  不污染标签文本与可访问名称。
- **图标语义**：纯图标按钮都有 `aria-label`；装饰图标 `aria-hidden`。
- **色彩非唯一信号**：Badge 的四种 tone 同时使用文字标签；趋势指标同时带箭头图标；
  图表配 `ChartTooltip`，不只靠颜色区分系列。
- **触摸尺寸**：按钮最小高度 32–36px，图标按钮通过内边距补足点击区；手机端导航与底部操作栏
  使用安全区内边距。

尚未验证：屏幕阅读器实测、200% 缩放下的重排、深色模式（当前只有浅色主题）。

## 8. 已知取舍

- 深色模式尚未实现。token 层已经就位，但需要单独校验对比度，不能靠反转浅色值。
- 少数老页面仍残留 `bg-white` / `text-slate-*` 字面量；它们与新 token 取值接近，视觉一致，
  但不参与主题切换。后续按页面替换，不要求一次性全改。
- 图表库（Recharts）的轴、网格与 tooltip 已统一走 `ChartKit`，但动画时长仍使用库默认值。
- 移动端表格采用横向滚动，没有做卡片化重排；列数较多的页面（发票、分析）在窄屏需要滑动。

## 9. 验证

```bash
cd client
npx tsc --noEmit        # 类型
npx vitest run          # 23 个单测，11 个测试文件
npm run lint            # 0 error
npm run build           # 构建通过
```

界面证据（Playwright + 模拟 `/api/v1` 响应）：

- 登录页：1440×900 双栏品牌布局；390×844 只保留表单，无横向滚动。
- 仪表盘：1440×900 与 390×844 核对 KPI、图表、列表与底部导航；手机端 KPI 为 2×2 网格。
- 产品管理：桌面端表格、行操作菜单、新建抽屉；390×844 下表格在卡片内横向滚动，列不再换行。

未在真实设备、屏幕阅读器或真实数据下逐页复核。
