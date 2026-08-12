# TabBar 图标规则

## 输入

优先从项目小程序根目录的 app.json 读取：

- tabBar.list[].pagePath
- tabBar.list[].text
- tabBar.list[].iconPath
- tabBar.list[].selectedIconPath
- tabBar.color
- tabBar.selectedColor

如果用户提供菜单名称，格式可以是：

菜单名称：首页、订单、个人

或：

{
  "menus": [
    { "text": "首页", "name": "home", "icon": "house" },
    { "text": "订单", "name": "orders", "icon": "receipt" },
    { "text": "个人", "name": "profile", "icon": "user silhouette" }
  ]
}

菜单数量与 app.json 不一致时先报告。保留已有 pagePath 顺序，不要猜测或重命名页面。

## 输出

每个菜单至少输出 `<name>.png`。若 `iconPath` 与 `selectedIconPath` 相同，则为单图标模式，不再生成 `-active.png`。

优先使用项目已有资源目录。当前面包坊项目的目录是：

miniprogram/assets/tab/

默认尺寸为 81×81px。所有 PNG 必须是 RGBA、透明背景，四角 alpha 为 0；主体约占 65%–78% 画布并保持居中。

## 品牌与颜色

读取项目品牌规范，不要把通用示例颜色覆盖到项目中。当前面包坊项目使用浅蓝、奶油白、草莓粉和珊瑚粉方向：

#D3E8F4
#FFE0E6
#FFFCF4
#FFBCBD

当前 app.json 已使用的 TabBar 颜色为普通态 #6f7d7d、选中态 #d9828b，除非项目配置发生变化，否则沿用它们。

## 生成与染色

单图标模式只需生成一张普通态单色透明图；`selectedIconPath` 复用该文件，选中态由 `selectedColor` 的文字颜色表达。双状态模式才需要用同一透明轮廓生成两种状态，不要分别生成不同轮廓。

如果使用 imagegen：

- 读取当前环境中可发现的 $imagegen skill，不要写死路径。
- 要求主体单色、无文字、无阴影、无渐变、无背景。
- 生成后确认背景已经透明，再运行染色脚本。

双状态模式示例（单图标模式无需运行此染色脚本）：

python wechat-tabbar-icons/scripts/tint_tabbar_icon.py \
  --source <transparent-source.png> \
  --out-dir miniprogram/assets/tab \
  --name home \
  --inactive-color '#6f7d7d' \
  --active-color '#d9828b' \
  --size 81

## 验收

- app.json 中每个 Tab 都有本地 iconPath 和 selectedIconPath。
- 所有路径相对于小程序根目录，不能使用 ../ 穿出小程序目录。
- 所有文件真实存在且为 PNG。
- 图片尺寸一致，透明角点正确。
- 双状态模式下普通态和选中态 alpha 轮廓一致；单图标模式下两字段复用同一文件。
- 图标没有文字、emoji、角标、远程资源或复杂背景。
- TabBar 图标在小尺寸下仍然可辨识。
- 缺少图标时必须明确报告，不能用临时替代品冒充完成。
