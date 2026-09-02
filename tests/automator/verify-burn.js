// 燃烧动画专项：待机（未点燃）/ 点火中 / 吸入缩短 / 抖灰 / 燃尽弹飞 截图组
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function main() {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' })
  let page = await mp.reLaunch('/pages/smoke/smoke')
  await sleep(1500)
  await mp.screenshot({ path: 'burn-idle.png' })       // 待机：完整烟支漂浮、未点燃

  // 长按点火
  await page.callMethod('onTouchStart', {})
  await sleep(700)
  await mp.screenshot({ path: 'burn-lighting.png' })   // 点火中：火焰粒子、烟头渐红
  await sleep(900)                                      // 共 1.6s：点燃
  await page.callMethod('onTouchEnd', {})

  // 吸入约 2s（烧掉 ~17%）
  await page.callMethod('onTouchStart', {})
  await sleep(2000)
  await mp.screenshot({ path: 'burn-mid.png' })        // 燃烧中：烟体缩短、烟灰增长
  await page.callMethod('onTouchEnd', {})
  await sleep(500)

  // 抖灰（用 getStats 暴露的真实几何定位烟身中心）
  const st = await page.callMethod('getStats')
  const tap = {
    touches: [{ x: st.geo.x0 + st.geo.len / 2, y: st.geo.cy }],
    changedTouches: [{ x: st.geo.x0 + st.geo.len / 2, y: st.geo.cy }]
  }
  await page.callMethod('onTouchStart', tap)
  await sleep(80)
  await page.callMethod('onTouchEnd', tap)
  await sleep(400)
  await mp.screenshot({ path: 'burn-flick.png' })      // 抖灰后：烟灰脱落

  // 燃尽弹飞
  await page.callMethod('finish')
  await sleep(650)
  await mp.screenshot({ path: 'burn-buttfly.png' })    // 烟蒂飞行中
  await sleep(1400)
  await mp.screenshot({ path: 'burn-done.png' })       // 结算卡（烟蒂已离场）
  console.log('shots done')
  await mp.disconnect()
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(2) })
