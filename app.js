// 吸烟模拟器 - 小程序入口
App({
  onLaunch() {
    // 展示本地存储能力示例：累计吸烟数
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
  },

  globalData: {
    // 全局数据：吸烟统计
    totalSmoked: 0,
    todaySmoked: 0
  }
})
