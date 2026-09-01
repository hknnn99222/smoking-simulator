const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function main() {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' })
  const page = await mp.reLaunch('/pages/smoke/smoke')
  await sleep(1500)
  await mp.screenshot({ path: 'burn-0.png' })          // 初始：满烟
  await page.callMethod('onTouchStart')
  await sleep(3200)                                     // 持续按住：烧掉约 27%
  await mp.screenshot({ path: 'burn-30.png' })          // 松开吐烟前
  await page.callMethod('onTouchEnd')
  await sleep(300)
  await page.callMethod('onTouchStart')
  await sleep(200)
  await page.callMethod('onTouchEnd')
  await page.callMethod('finish')
  await sleep(1000)
  await mp.screenshot({ path: 'burn-done.png' })        // 烧完：烟屁股+烟灰掉落
  console.log('shots done')
  await mp.disconnect()
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(2) })
