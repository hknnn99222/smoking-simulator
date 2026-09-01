// 统计：累计数据 + 热力图 + 健康恢复时间线
const calc = require('../../utils/calc')

Page({
  data: {
    total: 0,
    moneyText: '¥0',
    lifeText: '0 分钟',
    streak: 0,
    longest: 0,
    inPack: 0,
    todayCount: 0,
    cigsPerDay: 20,
    cells: [],
    milestones: []
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const profile = calc.getProfile()
    const days = calc.getDays()
    const total = calc.getTotal()
    this.setData({
      total,
      moneyText: calc.moneyText(calc.moneyOf(total, profile)),
      lifeText: calc.lifeText(calc.lifeMinutesOf(total)),
      streak: calc.streakOf(days),
      longest: calc.longestOf(days),
      inPack: total % calc.CIGS_PER_PACK,
      todayCount: days[calc.todayStr()] || 0,
      cigsPerDay: profile.cigsPerDay,
      cells: calc.heatmapOf(days, 30),
      milestones: calc.milestonesWith(profile.quitStartAt || Date.now())
    })
  }
})
