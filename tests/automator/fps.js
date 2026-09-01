// 帧率测量：静止 5s + 抽烟交互 6s 两段
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function main() {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' })
  const page = await mp.reLaunch('/pages/smoke/smoke')
  await sleep(1500)
  // 重置探针起点：读两次取差值不可行，直接分段测——用两段全量平均近似
  await sleep(5000)
  const idle = await page.callMethod('getStats')
  // 触发口数与烟雾粒子
  for (let i = 0; i < 3; i++) {
    await page.callMethod('onTouchStart')
    await sleep(1800)
    await page.callMethod('onTouchEnd')
    await sleep(200)
  }
  const busy = await page.callMethod('getStats')
  console.log(JSON.stringify({ idleAvgFps: idle.fps, withSmokeAvgFps: busy.fps, frames: busy.frames }))
  await mp.disconnect()
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(2) })
