# 自动化测试脚本（miniprogram-automator）

连接微信开发者工具模拟器（自动化端口 9420）驱动页面，配套 `docs/测试方案.md` 使用。

## 首次准备

```bash
# 1) 启动开发者工具并打开本项目，然后开通自动化端口
"/d/Tencent/WeChatDevTools/cli.bat" auto --project "<项目绝对路径>" --auto-port 9420

# 2) 本目录安装依赖（任意位置均可，脚本通过 ws://localhost:9420 连接）
npm init -y && npm i miniprogram-automator
```

## 脚本

| 脚本 | 用途 |
|------|------|
| `verify.js` | 全链路冒烟（19 项断言：首页→抽烟→结算→抽奖→收藏→统计→设置→联动），跑完自动清场复位数据 |
| `verify-burn.js` | 燃烧动画专项：初始 / 按住 3 秒 / 烧完 三张截图 |
| `fps.js` | 帧率探针：静止与吐烟时的平均 fps（页面 `getStats()` 采集） |
| `nav-perf2.js` | 页面切换耗时（小程序内部计时，剔除工具协议开销） |
| `cleanup.js` | 手动清场：重置存储数据并回到首页 |

注意：`wechatide` MCP 通道不接受游客 AppID（touristappid），自动化一律走上面的 `cli.bat auto`。
