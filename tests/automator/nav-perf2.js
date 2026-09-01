// 小程序内部计时：绕开 automator 往返开销
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function main() {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' })
  await mp.reLaunch('/pages/index/index')
  await sleep(800)

  const measure = url => mp.evaluate(
    (u) => new Promise(resolve => {
      const t0 = Date.now()
      wx.switchTab({ url: u, success: () => resolve(Date.now() - t0), fail: () => resolve(-1) })
    }),
    url
  )

  console.log('app 内部计时（ms）：')
  for (const url of ['/pages/box/box', '/pages/stats/stats', '/pages/settings/settings', '/pages/index/index']) {
    const first = await measure(url)
    const second = await measure(url)
    console.log(' ', url.padEnd(24), '首次', first + 'ms', '再次', second + 'ms')
  }

  // 抽烟页进出也在 app 内计时
  const nav = url => mp.evaluate(
    (u) => new Promise(resolve => {
      const t0 = Date.now()
      wx.navigateTo({ url: u, success: () => resolve(Date.now() - t0), fail: () => resolve(-1) })
    }),
    url
  )
  const back = () => mp.evaluate(
    () => new Promise(resolve => {
      const t0 = Date.now()
      wx.navigateBack({ success: () => resolve(Date.now() - t0), fail: () => resolve(-1) })
    })
  )
  console.log('  navigateTo smoke:', (await nav('/pages/smoke/smoke')) + 'ms')
  await sleep(800)
  console.log('  navigateBack:', (await back()) + 'ms')

  await mp.disconnect()
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(2) })
