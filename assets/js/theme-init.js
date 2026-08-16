(function () {
  'use strict';

  var storageKey = 'kube-manifest-pilot.theme';
  var theme = '';

  try {
    theme = window.localStorage.getItem(storageKey) || '';
  } catch (_) {
    theme = '';
  }

  if (theme !== 'light' && theme !== 'dark') {
    try {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    } catch (_) {
      theme = 'light';
    }
  }

  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;

  var themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute('content', theme === 'dark' ? '#0b1220' : '#ffffff');
  }
})();
