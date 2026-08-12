---
name: html-to-wechat-miniprogram
description: 将 HTML、React、Vue 或其他 Web 原型转换成微信小程序代码，并强制遵守小程序特有的页面结构、原生顶部导航、app.json tabBar、跳转 API、安全区布局、本地资源和验收规范。用于把 Web/HTML 原型转成微信小程序文件，或检查、修复已生成的小程序转换结果是否符合微信平台规范。
---

# HTML 转微信小程序

使用此技能将 Web 原型转换为微信小程序，同时约束通用大模型容易忽略的平台规则。

不要把上下文浪费在解释基础 WXML、WXSS、TypeScript 语法上，除非当前代码库确实需要。这个技能的重点是避免错误架构和平台不匹配。

## 必读规则

在创建或编辑小程序文件之前，必须阅读：

- `references/conversion-rules.md`

该文件是页面拆分、`app.json`、原生导航栏、`tabBar`、跳转 API、安全区、资源和验收清单的转换契约。

## 工作流程

1. 识别原型来源：HTML、React、Vue、静态截图或已有 Web App 文件。
2. 将原型中的 screen/route 映射为真实小程序页面。不要用一个 `index` 页面加本地状态模拟多页面。
3. 先设计 `app.json`：`pages`、`window`、`tabBar`。
4. 在 `miniprogram/pages/**` 下为每个页面创建独立目录。
5. 页面标题默认放进页面 `.json`，除非用户明确要求自定义顶部导航栏。
6. 底部主导航必须放进 `app.json tabBar`，不要在 WXML 里手写底部导航。
7. 实现页面内容和本地 mock 数据；除非用户要求后端，否则不要假设后端存在。
8. 每个页面跳转都使用正确的微信小程序 API。
9. 为 tab 页面和固定底部操作栏页面添加安全区 padding。
10. 运行静态检查；条件允许时打开微信开发者工具验证导航和 UI 交互。

## 强制规则

- 不要为多页面应用构建单页状态机。
- 不要把 Web `Header` 复制到每个页面里做假顶部导航。
- 不要把 Web `BottomNav` 复制进 WXML。
- 不要用 `wx.navigateTo` 打开 `tabBar` 页面。
- 不要通过 `wx.switchTab` 传 query 参数；使用 storage 或小型本地 store。
- 不要让固定底部栏遮挡内容或原生 tabBar。
- 不要依赖远程 tab 图标；`tabBar` 图标必须是本地文件。
- 不要遗漏每个页面 `.json` 的 `navigationBarTitleText`。

## 交付内容

转换完成后提供：

- `miniprogram/` 或现有小程序项目结构下的文件。
- 原型 screen 到小程序 page 的映射说明。
- 因微信平台规范导致的有意差异。
- 验证结果，包括 TypeScript/build 检查，以及已执行的微信开发者工具交互检查。

