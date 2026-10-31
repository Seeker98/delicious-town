// 页面渲染前要做的两件事。深色模式（界面改版 P1）：渲染前写好 data-theme，免得先白后黑闪一下；规则同 src/utils/theme.ts。
// 原来内联在 index.html 里，挪出来是为了内容安全策略不用放行内联脚本（安全审计 M2 2026-10-25）
(function () {
  var pref = 'system';
  try {
    var v = localStorage.getItem('dt_theme');
    if (v === 'light' || v === 'dark') pref = v;
  } catch {
    // 读不到本地存储（隐私模式、禁用了存储）：按跟随系统
  }
  var dark =
    pref === 'dark' ||
    (pref === 'system' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var mode = dark ? 'dark' : 'light';
  var html = document.documentElement;
  html.setAttribute('data-theme', mode);
  html.setAttribute('data-bs-theme', mode);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#211b2a' : '#ffffff');
})();

// 语言包提前下载（性能 2026-10-31）：语言包都按需加载，原来要等入口 JS 下载、执行完才开始下载，多等一轮。
// 构建时把各语言包的文件写在 <meta name="dt-locale-chunks">（src/build/localePreload.ts），这里按存的语言、
// 浏览器语言选一个（规则同 src/stores/locale.ts 的 init 和 @dt/shared 的 detectLocale），和入口 JS 一起下载
(function () {
  var meta = document.querySelector('meta[name="dt-locale-chunks"]');
  if (!meta) return;
  var map;
  try {
    map = JSON.parse(meta.getAttribute('content') || '');
  } catch {
    return;
  }
  var has = function (l) {
    return typeof l === 'string' && Object.prototype.hasOwnProperty.call(map, l);
  };
  var l = null;
  try {
    l = localStorage.getItem('dt_locale');
  } catch {
    // 读不到本地存储：按浏览器语言
  }
  if (!has(l)) {
    var tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    l = 'en';
    for (var i = 0; i < tags.length; i++) {
      var t = String(tags[i] || '').toLowerCase();
      var hit = /^zh-(tw|hk|mo|hant)/.test(t)
        ? 'zh-TW'
        : t === 'zh' || t.indexOf('zh-') === 0
          ? 'zh-CN'
          : t === 'fr' || t.indexOf('fr-') === 0
            ? 'fr'
            : t === 'es' || t.indexOf('es-') === 0
              ? 'es'
              : t === 'en' || t.indexOf('en-') === 0
                ? 'en'
                : null;
      if (hit) {
        l = hit;
        break;
      }
    }
  }
  if (!has(l)) return;
  for (var j = 0; j < map[l].length; j++) {
    var link = document.createElement('link');
    link.rel = 'modulepreload';
    link.crossOrigin = '';
    link.href = map[l][j];
    document.head.appendChild(link);
  }
})();
