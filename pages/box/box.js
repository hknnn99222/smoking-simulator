// 烟盒收藏：换肤 + 开盒入口
const calc = require('../../utils/calc')
const skins = require('../../utils/skins')

Page({
  data: {
    list: [], // { skin, owned, count, isCurrent, rarityName }
    tickets: 0,
    draws: 0,
    collected: 0,
    total: skins.SKINS.length,
    allCollected: false,
    cigsToNext: 20
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const store = wx.getStorageSync('skins') || {}
    const owned = store.owned || {}
    const total = calc.getTotal()
    const draws = store.totalDraws || 0
    const list = skins.SKINS.map(s => ({
      skin: s,
      rarityName: skins.RARITY[s.rarity].name,
      owned: !!owned[s.id],
      count: owned[s.id] || 0,
      isCurrent: store.currentId === s.id
    }))
    const collected = list.filter(x => x.owned).length
    this.setData({
      list,
      tickets: calc.ticketsLeftOf(total, draws),
      draws,
      collected,
      allCollected: collected === skins.SKINS.length,
      cigsToNext: calc.cigsToNextTicket(total, draws)
    })
  },

  onPick(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const item = this.data.list[idx]
    if (!item || !item.owned) {
      wx.showToast({ title: '还未拥有，去开盒抽它', icon: 'none' })
      return
    }
    const store = wx.getStorageSync('skins') || {}
    store.currentId = item.skin.id
    wx.setStorageSync('skins', store)
    wx.showToast({ title: '已换上 · ' + item.skin.name, icon: 'none' })
    this.refresh()
  },

  onDraw() {
    if (this.data.tickets <= 0) {
      wx.showToast({ title: '还差 ' + this.data.cigsToNext + ' 根凑满一包', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/draw/draw' })
  }
})
