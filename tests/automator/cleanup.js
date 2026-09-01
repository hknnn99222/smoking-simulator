const automator = require('miniprogram-automator')
automator.connect({ wsEndpoint: 'ws://localhost:9420' }).then(async mp => {
  await mp.evaluate(() => {
    wx.clearStorageSync()
    const calc = require('utils/calc.js') // 走 app 内相对路径不可行时使用兜底
  }).catch(() => {})
  // 直接写干净的初始数据
  await mp.evaluate(() => {
    wx.setStorageSync('profile', { pricePerPack: 20, cigsPerDay: 20, quitStartAt: Date.now() })
    wx.setStorageSync('days', {})
    wx.setStorageSync('total', 0)
    wx.setStorageSync('skins', { owned: { redgold: 1 }, currentId: 'redgold', totalDraws: 0 })
  })
  await mp.reLaunch('/pages/index/index')
  await new Promise(r => setTimeout(r, 800))
  await mp.disconnect()
  console.log('cleaned')
  process.exit(0)
}).catch(e => { console.error(e); process.exit(1) })
