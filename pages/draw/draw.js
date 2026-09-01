// 开盒抽奖：抖动 → 翻转揭晓，稀有度光效 + 重复彩蛋
const calc = require('../../utils/calc')
const skins = require('../../utils/skins')

Page({
  data: {
    phase: 'ready', // ready | shaking | reveal
    mystery: skins.MYSTERY_SKIN,
    result: null,
    resultRarity: null,
    isNew: false,
    line: '',
    count: 0
  },

  onLoad() {
    const store = wx.getStorageSync('skins') || {}
    const tickets = calc.ticketsLeftOf(calc.getTotal(), store.totalDraws || 0)
    if (tickets <= 0) {
      wx.showToast({ title: '没有可开的盒，先去戒一根', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  onOpen() {
    if (this.data.phase !== 'ready') return
    this.setData({ phase: 'shaking' })
    setTimeout(() => this.reveal(), 950)
  },

  reveal() {
    // roll + 立即持久化（消耗一张券）
    const store = wx.getStorageSync('skins') || {}
    store.owned = store.owned || {}
    store.totalDraws = (store.totalDraws || 0) + 1
    const skin = skins.rollSkin()
    const isNew = !store.owned[skin.id]
    store.owned[skin.id] = (store.owned[skin.id] || 0) + 1
    wx.setStorageSync('skins', store)

    const count = store.owned[skin.id]
    const line = isNew
      ? skins.pick(skins.FIRST_LINES)
      : skins.renderLine(skins.pick(skins.DUPE_LINES), { name: skin.name, n: count })

    wx.vibrateShort({ type: 'medium' })
    this.setData({
      phase: 'reveal',
      result: skin,
      resultRarity: skins.RARITY[skin.rarity],
      isNew,
      line,
      count
    })
  },

  onOk() {
    // 拥有即换上，新皮肤直接装备
    const store = wx.getStorageSync('skins') || {}
    if (this.data.result && store.owned[this.data.result.id]) {
      store.currentId = this.data.result.id
      wx.setStorageSync('skins', store)
    }
    wx.navigateBack()
  }
})
