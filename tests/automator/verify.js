// 「戒一根」自动化验证：连接微信开发者工具模拟器，逐页截图 + 核心交互 + 错误收集
// 覆盖状态机：待机→长按点火→吸入/吐烟→抖灰→燃尽弹飞→结算
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

  // ---------- 抽烟页：待机（未点燃漂浮） ----------
  page = await mp.reLaunch('/pages/smoke/smoke')
  await sleep(1500)
  d = await page.data()
  ok('抽烟页待机态', page.path === 'pages/smoke/smoke' && d.phase === 'idle' && d.finished === false, d.phase)
  let st = await page.callMethod('getStats')
  ok('待机未点燃', st.lit === false && st.burn === 0, st)
  await shot(mp, '02-smoke-idle')

  // ---------- 长按点火（1.2s 渐红） ----------
  await page.callMethod('onTouchStart', {})
  await sleep(700)
  st = await page.callMethod('getStats')
  ok('点火中·烟头渐红', st.lightProg > 0.4 && st.lightProg < 1, st)
  await shot(mp, '03-smoke-lighting')
  await sleep(800)
  st = await page.callMethod('getStats')
  ok('点火完成', st.lit === true && st.phase === 'burning', st)
  await page.callMethod('onTouchEnd', {})
  await sleep(300)
  d = await page.data()
  ok('点火释放不计口', d.puffs === 0, d.puffs)

  // ---------- 吸入 / 吐烟 ----------
  await page.callMethod('onTouchStart', {})
  await sleep(2200)
  await page.callMethod('onTouchEnd', {})
  await sleep(400)
  d = await page.data()
  st = await page.callMethod('getStats')
  ok('吸入松开计一口', d.puffs === 1 && d.phase === 'burning', { puffs: d.puffs })
  ok('烟体缩短+烟灰增长', st.burn > 0.1 && st.ashExtra > 2, st)
  await shot(mp, '04-smoke-holding')

  // ---------- 点按烟身抖灰 ----------
  const st0 = await page.callMethod('getStats')
  const cx = st0.geo.x0 + st0.geo.len / 2
  const cyy = st0.geo.cy
  const tap = {
    touches: [{ x: cx, y: cyy }],
    changedTouches: [{ x: cx, y: cyy }]
  }
  await page.callMethod('onTouchStart', tap)
  await sleep(80)
  await page.callMethod('onTouchEnd', tap)
  await sleep(300)
  d = await page.data()
  st = await page.callMethod('getStats')
  ok('抖灰：烟灰清零且不计口', st.ashExtra === 0 && d.puffs === 1, { ashExtra: st.ashExtra, puffs: d.puffs })
  await shot(mp, '05-smoke-flick')

  // ---------- 燃尽：烟蒂弹飞 + 结算 ----------
  await page.callMethod('finish')
  await sleep(700)
  st = await page.callMethod('getStats')
  ok('烟蒂弹飞中', st.buttFly === true, st)
  await shot(mp, '06-smoke-buttfly')
  await sleep(1300)
  d = await page.data()
  ok('结算卡出现', d.showSettle === true && d.finished === true && d.phase === 'done')
  ok('结算数据', d.settle && d.settle.total === 1 && d.settle.moneyText === '¥1' && d.settle.inPack === 1, d.settle)
  await shot(mp, '07-smoke-settle')
  const stored = await mp.evaluate(() => ({
    total: wx.getStorageSync('total'),
    days: wx.getStorageSync('days')
  }))
  ok('结算入库', stored.total === 1 && stored.days && stored.days[Object.keys(stored.days)[0]] === 1, stored)
  await page.callMethod('onAgain')
  d = await page.data()
  st = await page.callMethod('getStats')
  ok('再戒一根重置回待机', d.showSettle === false && d.phase === 'idle' && st.lit === false, st)

  // ---------- 彩蛋：替身棒棒糖 ----------
  await page.callMethod('debugEgg', 'sub')
  st = await page.callMethod('getStats')
  ok('彩蛋替身生效', st.sub === 'lollipop', st.sub)
  await page.callMethod('onTouchStart', {})
  await sleep(1400)
  await page.callMethod('onTouchEnd', {})
  await sleep(200)
  await page.callMethod('onTouchStart', {})
  await sleep(1500)
  await page.callMethod('onTouchEnd', {})
  await sleep(300)
  await shot(mp, 'egg-sub')
  await page.callMethod('finish')
  await sleep(1900)
  d = await page.data()
  ok('替身结算文案与彩蛋标签', d.settle && d.settle.egg === '替身 · 棒棒糖' && d.settle.line.indexOf('棒棒糖') >= 0, d.settle && { egg: d.settle.egg, line: d.settle.line })
  await page.callMethod('onAgain')
  await sleep(300)

  // ---------- 彩蛋：心形烟圈 ----------
  await page.callMethod('debugEgg', 'heart')
  await page.callMethod('onTouchStart', {})
  await sleep(1400)
  await page.callMethod('onTouchEnd', {})
  await sleep(200)
  await page.callMethod('onTouchStart', {})
  await sleep(700)
  await page.callMethod('onTouchEnd', {})
  await sleep(400)
  await shot(mp, 'egg-heart')

  // ---------- 彩蛋：七彩烟 ----------
  await page.callMethod('debugEgg', 'rainbow')
  await page.callMethod('onTouchStart', {})
  await sleep(700)
  await page.callMethod('onTouchEnd', {})
  await sleep(300)
  await shot(mp, 'egg-rainbow')

  // ---------- 彩蛋：隐藏皮肤碎片 ----------
  await page.callMethod('onAgain')
  await sleep(300)
  await page.callMethod('debugEgg', 'frag')
  await page.callMethod('onTouchStart', {})
  await sleep(1400)
  await page.callMethod('onTouchEnd', {})
  await page.callMethod('finish')
  await sleep(1900)
  d = await page.data()
  const fragStore = await mp.evaluate(() => wx.getStorageSync('skins'))
  ok('碎片掉落入库+结算展示', d.settle && d.settle.frag && fragStore.frags >= 1, { settleFrag: d.settle && d.settle.frag, storeFrags: fragStore.frags })
  await shot(mp, 'egg-frag')
  // 复位：清彩蛋残留数据（保留一条今日记录以维持 streak 断言语义）
  await mp.evaluate(() => {
    const d = new Date()
    const pad = n => (n < 10 ? '0' : '') + n
    const k = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    wx.setStorageSync('skins', { owned: { redgold: 1 }, currentId: 'redgold', totalDraws: 0, frags: 0 })
    wx.setStorageSync('total', 0)
    wx.setStorageSync('days', { [k]: 1 })
  })

  // ---------- 抽奖：凑满一包 ----------
  await mp.evaluate(() => {
    wx.setStorageSync('total', 20)
  })
  page = await mp.reLaunch('/pages/draw/draw')
  await sleep(1000)
  d = await page.data()
  ok('抽奖页进入', page.path === 'pages/draw/draw' && d.phase === 'ready')
  await page.callMethod('onOpen')
  await sleep(1300)
  d = await page.data()
  ok('开盒揭晓', d.phase === 'reveal' && d.result && !!d.result.id, { result: d.result && d.result.id, isNew: d.isNew, line: d.line })
  await shot(mp, '08-draw-reveal')
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
  await shot(mp, '09-box')

  // ---------- 统计页（total 此前被覆写为 20）----------
  page = await mp.reLaunch('/pages/stats/stats')
  await sleep(1000)
  d = await page.data()
  ok('统计页数据', d.total === 20 && d.streak === 1 && d.cells.length === 30 && d.milestones.length === 8, { total: d.total, streak: d.streak })
  await shot(mp, '10-stats')

  // ---------- 设置页 ----------
  page = await mp.reLaunch('/pages/settings/settings')
  await sleep(1000)
  d = await page.data()
  ok('设置页档案', d.profile && d.profile.pricePerPack === 20 && !!d.quitDateStr, { price: d.profile && d.profile.pricePerPack, quit: d.quitDateStr, sound: d.profile.sound })
  await shot(mp, '11-settings')

  // ---------- 回首页看联动 ----------
  page = await mp.reLaunch('/pages/index/index')
  await sleep(1000)
  d = await page.data()
  ok('首页联动新皮肤', d.skin.id === afterOk.currentId, d.skin.id)
  await shot(mp, '12-index-after')

  // ---------- 汇总 ----------
  console.log('\nconsole errors:', consoleErrors.length)
  consoleErrors.slice(0, 10).forEach(e => console.log('  ERR:', e.slice(0, 300)))
  console.log('failed:', failed)

  // ---------- 清场：数据复位 + 回首页 ----------
  await mp.evaluate(() => {
    wx.setStorageSync('profile', { pricePerPack: 20, cigsPerDay: 20, quitStartAt: Date.now(), sound: true })
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
