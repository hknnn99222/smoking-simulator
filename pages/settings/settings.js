// 设置：烟价 / 每日基线 / 戒烟起点 / 清空数据
const calc = require('../../utils/calc')

Page({
  data: {
    profile: null,
    cigOptions: [],
    cigIndex: 0,
    todayStr: ''
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const profile = calc.getProfile()
    const cigOptions = []
    for (let i = 1; i <= 40; i++) cigOptions.push(i + ' 根')
    this.setData({
      profile,
      cigOptions,
      cigIndex: Math.max(0, Math.min(39, profile.cigsPerDay - 1)),
      todayStr: calc.todayStr(),
      quitDateStr: profile.quitStartAt ? calc.todayStr(profile.quitStartAt) : ''
    })
  },

  onPriceInput(e) {
    const v = parseFloat(e.detail.value)
    if (!isNaN(v) && v > 0 && v <= 1000) {
      const profile = calc.getProfile()
      profile.pricePerPack = Math.round(v * 10) / 10
      calc.saveProfile(profile)
    }
  },

  onCigsChange(e) {
    const idx = Number(e.detail.value)
    const profile = calc.getProfile()
    profile.cigsPerDay = idx + 1
    calc.saveProfile(profile)
    this.setData({ cigIndex: idx, profile })
  },

  onSoundChange(e) {
    const profile = calc.getProfile()
    profile.sound = e.detail.value
    calc.saveProfile(profile)
    this.setData({ profile })
  },

  onDateChange(e) {
    const profile = calc.getProfile()
    const [y, m, d] = e.detail.value.split('-').map(Number)
    profile.quitStartAt = new Date(y, m - 1, d).getTime()
    calc.saveProfile(profile)
    this.setData({ profile })
  },

  onClear() {
    wx.showModal({
      title: '清空所有数据',
      content: '戒掉的根数、烟盒收藏将全部重置，确定吗？',
      confirmText: '清空',
      confirmColor: '#d05a5a',
      success: res => {
        if (!res.confirm) return
        calc.clearAll()
        wx.showToast({ title: '已重置', icon: 'success' })
        this.refresh()
      }
    })
  }
})
