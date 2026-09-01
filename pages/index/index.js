// 首页：数据总览 + 当前烟盒 + 点一根入口
const calc = require('../../utils/calc')
const skins = require('../../utils/skins')

Page({
  data: {
    today: 0,
    total: 0,
    moneyText: '¥0',
    lifeText: '0 分钟',
    streak: 0,
    skin: null,
    rarityName: '',
    tickets: 0,
    ms: { title: '', desc: '', pct: 0 }
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const profile = calc.getProfile()
    const days = calc.getDays()
    const total = calc.getTotal()
    const today = days[calc.todayStr()] || 0
    const skinStore = wx.getStorageSync('skins') || {}
    const skin = skins.getSkin(skinStore.currentId)
    const tickets = calc.ticketsLeftOf(total, skinStore.totalDraws || 0)
    this.setData({
      today,
      total,
      moneyText: calc.moneyText(calc.moneyOf(total, profile)),
      lifeText: calc.lifeText(calc.lifeMinutesOf(total)),
      streak: calc.streakOf(days),
      skin,
      rarityName: skins.RARITY[skin.rarity].name,
      tickets,
      ms: calc.nextMilestone(profile.quitStartAt || Date.now())
    })
  },

  onSmoke() {
    wx.navigateTo({ url: '/pages/smoke/smoke' })
  },

  goBox() {
    wx.switchTab({ url: '/pages/box/box' })
  }
})
