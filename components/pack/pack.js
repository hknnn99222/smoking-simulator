// 烟盒皮肤组件：纯 CSS 绘制，配色来自 utils/skins.js 的皮肤定义
Component({
  properties: {
    skin: { type: Object, value: null },
    mode: { type: String, value: 'full' }, // full | silhouette
    size: { type: String, value: 'hero' } // hero | grid | draw | bg
  },

  data: {
    styleMain: '',
    styleLid: '',
    styleBand: '',
    styleText: ''
  },

  observers: {
    skin(s) {
      if (!s || !s.box) return
      this.setData({
        styleMain:
          'background:linear-gradient(168deg,' + s.box.top + ' 0%,' + s.box.bottom + ' 100%);' +
          'border-color:' + s.box.band + ';',
        styleLid:
          'background:linear-gradient(168deg,' + s.box.top + ' 0%,rgba(255,255,255,.12) 100%);',
        styleBand: 'background:' + s.box.band + ';',
        styleText: 'color:' + s.box.text + ';'
      })
    }
  }
})
