// 「戒一根」自动化验证：连接微信开发者工具模拟器，逐页截图 + 核心交互 + 错误收集
const automator = require('miniprogram-automator')
const path = require('path')

const SHOT_DIR = __dirname
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shots = []
const consoleErrors = []
let failed = 0

function ok(name, cond, extra) {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failed++
  console.log(`[${mark}] ${name}${extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''}`)
}

async function shot(mp, name) {
  const file = path.join(SHOT_DIR, name + '.png')
  await mp.screenshot({ path: file })
  shots.push(file)
  console.log('[shot]', name + '.png')
}

async function main() {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' })
  console.log('connected')

  mp.on('console', msg => {
    if (msg.type === 'error') consoleErrors.push(msg.args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  })
  mp.on('exception', err => consoleErrors.push('EXCEPTION: ' + (err && (err.message || err.errorMessage || JSON.stringify(err)))))

  // ---------- 重置数据 ----------
  await mp.evaluate(() => {
    wx.clearStorageSync()
  })
  await mp.evaluate(() => {
    // 触发 app onLaunch 不可行，手动初始化等价数据
    wx.setStorageSync('profile', { pricePerPack: 20, cigsPerDay: 20, quitStartAt: Date.now() })
    wx.setStorageSync('days', {})
    wx.setStorageSync('total', 0)
    wx.setStorageSync('skins', { owned: { redgold: 1 }, currentId: 'redgold', totalDraws: 0 })
  })

  // ---------- 首页 ----------
  let page = await mp.reLaunch('/pages/index/index')
  await sleep(1200)
  ok('首页路径', page.path === 'pages/index/index', page.path)
  let d = await page.data()
  ok('首页初始数据', d.today === 0 && d.total === 0 && d.skin && d.skin.id === 'redgold', { today: d.today, skin: d.skin && d.skin.id })
  ok('首页里程碑', d.ms && d.ms.pct === 0, d.ms)
  await shot(mp, '01-index')

  // ---------- 抽烟页：按住/松开 + 烧完结算 ----------
  page = await mp.reLaunch('/pages/smoke/smoke')
  await sleep(1500)
  d = await page.data()
  ok('抽烟页进入', page.path === 'pages/smoke/smoke' && d.showHint === true && d.finished === false)

  await page.callMethod('onTouchStart')
  await sleep(2200)
  await page.callMethod('onTouchEnd')
  await sleep(400)
  d = await page.data()
  ok('吸入松开计一口', d.puffs === 1 && d.showHint === false, { puffs: d.puffs })
  await shot(mp, '02-smoke-holding')

  // 快进：直接烧完
  await page.callMethod('onTouchStart')
  await sleep(300)
  await page.callMethod('onTouchEnd')
  // 手动把 burn 拉满再 finish（绕过 12 秒等待）
  await page.callMethod('finish')
  await sleep(1300)
  d = await page.data()
  ok('结算卡出现', d.showSettle === true && d.finished === true)
  ok('结算数据', d.settle && d.settle.total === 1 && d.settle.moneyText === '¥1' && d.settle.inPack === 1, d.settle)
  await shot(mp, '03-smoke-settle')

  const stored = await mp.evaluate(() => ({
    total: wx.getStorageSync('total'),
    days: wx.getStorageSync('days')
  }))
  ok('结算入库', stored.total === 1 && stored.days && stored.days[Object.keys(stored.days)[0]] === 1, stored)
  await page.callMethod('onAgain')
  d = await page.data()
  ok('再戒一根重置', d.showSettle === false && d.puffs === 0)

  // ---------- 抽奖：凑满一包 ----------
  await mp.evaluate(() => {
    wx.setStorageSync('total', 20) // 直接凑满一包
  })
  page = await mp.reLaunch('/pages/draw/draw')
  await sleep(1000)
  d = await page.data()
  ok('抽奖页进入', page.path === 'pages/draw/draw' && d.phase === 'ready')
  await page.callMethod('onOpen')
  await sleep(1300)
  d = await page.data()
  ok('开盒揭晓', d.phase === 'reveal' && d.result && !!d.result.id, { result: d.result && d.result.id, isNew: d.isNew, line: d.line })
  await shot(mp, '04-draw-reveal')
  const drawnId = d.result.id
  const skinsStored = await mp.evaluate(() => wx.getStorageSync('skins'))
  ok('抽奖入库+券消耗', skinsStored.totalDraws === 1 && Object.keys(skinsStored.owned).length === 2, skinsStored)
  await page.callMethod('onOk')
  await sleep(600)
  const afterOk = await mp.evaluate(() => wx.getStorageSync('skins'))
  ok('收下即换上', afterOk.currentId === drawnId, afterOk.currentId)

  // ---------- 烟盒收藏 ----------
  page = await mp.reLaunch('/pages/box/box')
  await sleep(1000)
  d = await page.data()
  ok('收藏页统计', d.collected === 2 && d.tickets === 0 && d.draws === 1, { collected: d.collected, tickets: d.tickets, draws: d.draws })
  ok('当前皮肤高亮', d.list.some(x => x.isCurrent && x.skin.id === drawnId), d.list.filter(x => x.isCurrent).map(x => x.skin.id))
  await shot(mp, '05-box')

  // ---------- 统计页（total 此前被覆写为 20）----------
  page = await mp.reLaunch('/pages/stats/stats')
  await sleep(1000)
  d = await page.data()
  ok('统计页数据', d.total === 20 && d.streak === 1 && d.cells.length === 30 && d.milestones.length === 8, { total: d.total, streak: d.streak })
  await shot(mp, '06-stats')

  // ---------- 设置页 ----------
  page = await mp.reLaunch('/pages/settings/settings')
  await sleep(1000)
  d = await page.data()
  ok('设置页档案', d.profile && d.profile.pricePerPack === 20 && !!d.quitDateStr, { price: d.profile && d.profile.pricePerPack, quit: d.quitDateStr })
  await shot(mp, '07-settings')

  // ---------- 回首页看联动 ----------
  await mp.evaluate(() => wx.setStorageSync('days', { [Object.keys(wx.getStorageSync('days'))[0]]: 3 }))
  page = await mp.reLaunch('/pages/index/index')
  await sleep(1000)
  d = await page.data()
  ok('首页联动新皮肤', d.skin.id === afterOk.currentId, d.skin.id)
  await shot(mp, '08-index-after')

  // ---------- 汇总 ----------
  console.log('\nconsole errors:', consoleErrors.length)
  consoleErrors.slice(0, 10).forEach(e => console.log('  ERR:', e.slice(0, 300)))
  console.log('failed:', failed)

  // ---------- 清场：数据复位 + 回首页 ----------
  await mp.evaluate(() => {
    wx.setStorageSync('profile', { pricePerPack: 20, cigsPerDay: 20, quitStartAt: Date.now() })
    wx.setStorageSync('days', {})
    wx.setStorageSync('total', 0)
    wx.setStorageSync('skins', { owned: { redgold: 1 }, currentId: 'redgold', totalDraws: 0 })
  })
  await mp.reLaunch('/pages/index/index')
  await sleep(500)

  await mp.disconnect()
  process.exit(failed || consoleErrors.length ? 1 : 0)
}

main().catch(e => {
  console.error('SCRIPT ERROR:', e)
  process.exit(2)
})
