// 深色模式（界面改版 P1）：渲染前写好 data-theme，免得先白后黑闪一下；规则同 src/utils/theme.ts。
// 原来内联在 index.html 里，挪出来是为了内容安全策略不用放行内联脚本（安全审计 M2 2026-10-25）
(function () {
  var pref = 'system';
  try {
    var v = localStorage.getItem('dt_theme');
    if (v === 'light' || v === 'dark') pref = v;
  } catch (e) {}
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
