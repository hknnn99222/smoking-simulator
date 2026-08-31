// 首页：吸烟模拟器占位页，后续在此实现模拟逻辑
const app = getApp()

Page({
  data: {
    totalSmoked: 0
  },

  onLoad() {
    this.setData({
      totalSmoked: wx.getStorageSync('totalSmoked') || 0
    })
  },

  // 点烟（示例）：累计一根并持久化
  onSmoke() {
    const next = this.data.totalSmoked + 1
    this.setData({ totalSmoked: next })
    wx.setStorageSync('totalSmoked', next)
    wx.vibrateShort({ type: 'light' })
  },

  onReset() {
    this.setData({ totalSmoked: 0 })
    wx.setStorageSync('totalSmoked', 0)
  }
})
