# 页面内容云端配置交接（2026-09-09）

## 1. 完成内容

- 商家后台页面内容由本机草稿改为 CloudBase 读取、上传和保存。
- 小程序 `catalog` 读取 `pageConfigurations`，无记录时回退默认内容。
- 品牌图片通过 `merchant-admin/uploadPageContentImage` 上传，保存为 `page-content/{pageId}/{timestamp}-{sha}.jpg`。

## 2. 修改文件

- `cloudfunctions/merchant-admin/index.js`
- `cloudfunctions/catalog/index.js`
- `backend/src/admin-api.ts`
- `backend/src/App.tsx`
- `tests/page-content-cloud.test.js`

## 3. 数据库结构影响

- CloudBase 环境 `cloud1-d9gc800bmc6952073` 新增集合 `pageConfigurations`。
- 字段：`pageId`、`config`、`version`、`createdAt`、`updatedAt`。
- 已创建唯一索引 `pageId_unique`（`pageId` 升序）。
- 集合权限设为 `PRIVATE`，仅云函数读写；未改动既有业务集合。

## 4. API 变化

- `merchant-admin/getPageConfiguration`（`products.read`）
- `merchant-admin/savePageConfiguration`（`products.write`）
- `merchant-admin/uploadPageContentImage`（`products.write`）
- `catalog/getPageConfiguration`（小程序登录用户读取）

## 5. 图片规则

- 服务端仅接收 JPEG；压缩后 ≤1MB。
- 宽高 600–1600px，宽高比 3:5 至 9:5。
- 文件内容、尺寸和扩展路径均在服务端校验；不记录图片内容或密钥。

## 6. 部署证据

- MCP `auth status`：READY，当前环境 `cloud1-d9gc800bmc6952073`。
- MCP `manageFunctions/updateFunctionCode`：`catalog`、`merchant-admin` 均返回 success；随后只读详情显示 `Status=Active`、`CodeResult=success`。
- MCP `manageHosting/upload`：上传 `index.html`、`assets/index-BIA6C4D2.js`、`assets/index-B4pGUIko.css` 共 3 个文件，`successCount=3`；站点 `https://cloud1-d9gc800bmc6952073-1470059974.tcloudbaseapp.com/`。
- MCP `queryPermissions`：`pageConfigurations` 为 `PRIVATE`。

## 7. 验证方式与结果

- `node --check`：两个云函数通过。
- `node tests/page-content-cloud.test.js`：`page-content cloud contract ok`。
- `backend npm run build`：TypeScript 与 Vite 构建成功。

## 8. 未解决问题

- 尚未通过真实商家账号完成浏览器端上传回归（需在后台登录后选择图片并保存）。
- 本轮未上传微信小程序开发版本；小程序代码需在下一次小程序发布流程中提交。

## 9. 下一步建议

登录商家后台进入“页面内容 → 个人页”，上传品牌图片并保存；随后在小程序个人页刷新验证图片和文案。若出现版本冲突，重新读取配置后再保存。
