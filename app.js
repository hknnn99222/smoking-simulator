// 戒一根 - 小程序入口
const calc = require('./utils/calc')

App({
  onLaunch() {
    // 初始化存储（默认档案 + 初始烟盒皮肤 + 旧数据迁移）
    calc.initStorage()
  },

  globalData: {}
})
