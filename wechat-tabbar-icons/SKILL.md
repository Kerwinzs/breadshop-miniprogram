---
name: wechat-tabbar-icons
description: 为微信小程序生成、替换或验收 tabBar 本地 PNG 图标。使用时读取项目 app.json 的 tabBar.list、颜色和现有资源路径；当前面包坊项目默认输出到 miniprogram/assets/tab/，支持每个 Tab 复用单张图标，并遵守 v1/brand-spec.md 的品牌色、透明背景和本地图标约束。
---

# 微信小程序 TabBar 图标

为小程序 app.json 的 tabBar.list 生成可以直接引用的本地 PNG 图标。这个 skill 负责图标资源和验收，不负责修改页面业务逻辑。

## 先读取项目上下文

执行前按顺序读取：

1. 项目根目录的 AGENTS.md（如果存在）。
2. 小程序根目录的 app.json。
3. 项目品牌规范：优先使用当前项目明确指定的 v1/brand-spec.md；否则查找 brand-spec.md 或 bp_version/brand-spec.md。
4. 小程序根目录下已有的 assets/tab/、assets/tabbar/ 或其他图标目录。
5. 本 skill 的 references/tabbar-icon-rules.md。

不要把任何用户目录、旧机器路径或 imagegen 的绝对路径写死在项目文件中。

## 当前项目默认值

当检测到以下结构时直接使用这些默认值：

项目根目录：/Users/zangzhenshuo/工作/appdesign
小程序根目录：/Users/zangzhenshuo/工作/appdesign/miniprogram
输出目录：miniprogram/assets/tab/
品牌规范：v1/brand-spec.md

当前 app.json 的默认 TabBar 为：

首页 -> home -> house
订单 -> orders -> receipt 或 document list
个人 -> profile -> user silhouette

当前项目已有颜色约定：

普通态：#6f7d7d
选中态：#d9828b
主要品牌强调色：#FFBCBD
页面底色：#D3E8F4
内容面：#FFFCF4
辅助粉色：#FFE0E6

如果 app.json 或品牌规范已有不同值，以项目文件为准，不要擅自覆盖。

## 资源命名

支持两种模式：

- 单图标模式：`iconPath` 与 `selectedIconPath` 相同，每个 Tab 只需一张 `<name>.png`。当前面包坊项目使用此模式。
- 双状态模式：两个字段可指向不同 PNG（仅在项目明确需要时使用）。

单图标模式当前输出：`home.png`、`orders.png`、`profile.png`。不要为兼容旧规则生成 `*-active.png`。

## 工作流程

1. 解析小程序根目录和 app.json，读取 tabBar.list 的 pagePath、text、颜色和现有图标路径。
2. 如果用户显式提供菜单名称，校准 text、文件名和图标隐喻；数量不一致或无法安全匹配时先报告差异，不猜测页面路由。
3. 选定项目既有的图标体系。没有体系时使用简洁、扁平、统一线宽或统一填充方式的风格。
4. 如果需要新图形，调用当前环境中可发现的 $imagegen skill 生成一张中性单色透明源图；不要硬编码 imagegen 文件路径。若用户另行指定了图像生成 skill，则遵守用户指定的 skill。
5. 单图标模式下只生成一张普通态图；选中态复用同一文件，由 `selectedColor` 改变 Tab 文字颜色，图标本身不变色。
6. 输出到项目已有的 TabBar 资源目录；当前项目使用 miniprogram/assets/tab/。
7. 只有在现有路径缺失或不匹配时，才更新 app.json 的 iconPath 和 selectedIconPath；保留 pagePath 顺序和 text 文案。
8. 运行 scripts/validate_tabbar_assets.py 检查路径、PNG 格式、尺寸、透明角点和 app.json 引用；若为双状态模式再检查两张图轮廓一致。
9. 条件允许时使用图片查看工具进行视觉检查，再报告缺失资源或平台编译问题。

## 图标生成约束

- 默认输出 81×81px 方形 PNG；如果项目已有明确尺寸，跟随项目。
- 背景必须透明，四角 alpha 必须为 0。
- 图形主体居中，占画布约 65%–78%，留白一致。
- 普通态和选中态必须使用相同的透明轮廓，只改变颜色或填充强度。
- 图标内部不得出现文字、字母、数字、角标、通知数字或菜单标签。
- 不得使用 emoji、字符图标、icon font、远程 URL、SVG 作为最终 TabBar 文件。
- 避免过细线条、复杂渐变、3D、照片、纹理、重阴影和复杂背景。
- 同一组图标必须保持一致的线宽、视觉重量、圆角、留白和颜色关系。
- 当前面包坊项目不得引入森林绿、芥末黄、棕色等偏离品牌规范的主色。

## 遇到缺失图标时的处理

如果用户明确要求暂不生成图片，或图像生成 skill 不可用：

- 不要用 emoji、文字、CSS 图形或远程 URL 代替。
- 不要声称小程序已经完全编译通过。
- 可以保留 app.json 中计划使用的本地路径，并在 assets/tab/README.md 或最终报告中列出缺失文件。
- 继续完成与图片无关的检查，但将“缺少本地图标”列为明确阻塞项。

## 交付报告

完成后说明：

- 读取到的 TabBar 菜单和 pagePath。
- 生成的文件和尺寸。
- 使用的普通态、选中态颜色。
- 是否读取并遵守品牌规范。
- 验收脚本结果和视觉检查结果。
- 是否仍有缺失资源导致微信开发者工具无法编译。
- 单图标模式说明：图标本身不变色，选中态仅由 Tab 文字颜色区分。
