(function () {
  'use strict';

  const config = Object.assign({
    githubUrl: '',
    supportUrl: '',
    adsEnabled: false
  }, window.MANIFESTPILOT_CONFIG || {}, window.KUBE_MANIFEST_PILOT_CONFIG || {});

  const THEME_STORAGE_KEY = 'kube-manifest-pilot.theme';
  const themeMedia = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  const validTheme = theme => theme === 'light' || theme === 'dark';
  const readStoredTheme = () => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      return validTheme(stored) ? stored : '';
    } catch (_) {
      return '';
    }
  };
  let manualTheme = readStoredTheme();

  function preferredTheme() {
    return themeMedia?.matches ? 'dark' : 'light';
  }

  function updateThemeControls(theme) {
    const dark = theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? '切換為淺色模式' : '切換為深色模式');
      const icon = button.querySelector('[data-theme-icon]');
      const label = button.querySelector('[data-theme-label]');
      if (icon) icon.textContent = dark ? '☀' : '☾';
      if (label) label.textContent = dark ? '淺色' : '深色';
    });
  }

  function applyTheme(theme, persist = false) {
    const nextTheme = validTheme(theme) ? theme : preferredTheme();
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = nextTheme === 'dark' ? '#0b1220' : '#ffffff';
    updateThemeControls(nextTheme);

    if (persist) {
      manualTheme = nextTheme;
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch (_) { /* file:// or privacy settings may block storage. */ }
    }
    return nextTheme;
  }

  const initialTheme = validTheme(document.documentElement.dataset.theme)
    ? document.documentElement.dataset.theme
    : (manualTheme || preferredTheme());
  applyTheme(initialTheme);

  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark', true);
    });
  });

  const followSystemTheme = event => {
    if (!manualTheme) applyTheme(event.matches ? 'dark' : 'light');
  };
  if (themeMedia) {
    if (typeof themeMedia.addEventListener === 'function') themeMedia.addEventListener('change', followSystemTheme);
    else if (typeof themeMedia.addListener === 'function') themeMedia.addListener(followSystemTheme);
  }

  const toastRegion = document.querySelector('[data-toast-region]');
  function toast(message) {
    if (!toastRegion) return;
    const item = document.createElement('div');
    item.className = 'toast';
    item.textContent = message;
    toastRegion.append(item);
    window.setTimeout(() => item.remove(), 3200);
  }

  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  document.querySelectorAll('[data-config-link]').forEach(link => {
    const kind = link.dataset.configLink;
    const url = kind === 'github' ? config.githubUrl : config.supportUrl;
    if (url) {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return;
    }
    link.setAttribute('aria-disabled', 'true');
    link.addEventListener('click', event => {
      event.preventDefault();
      toast(kind === 'github' ? 'GitHub 專案網址將在發布時設定。' : '支持專案連結尚未設定。');
    });
  });

  document.querySelectorAll('.ad-placeholder').forEach(slot => {
    const enabled = Boolean(config.adsEnabled);
    slot.dataset.enabled = String(enabled);
    slot.hidden = !enabled;
    if (enabled) slot.removeAttribute('aria-hidden');
    else slot.setAttribute('aria-hidden', 'true');
  });

  window.KubeManifestPilotSite = {
    config,
    toast,
    theme: {
      get: () => document.documentElement.dataset.theme,
      set: theme => applyTheme(theme, true)
    }
  };
  window.ManifestPilotSite = window.KubeManifestPilotSite;
})();
