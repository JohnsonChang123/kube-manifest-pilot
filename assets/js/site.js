(function () {
  'use strict';

  const config = Object.assign({
    githubUrl: '',
    supportUrl: '',
    adsEnabled: false
  }, window.MANIFESTPILOT_CONFIG || {}, window.KUBE_MANIFEST_PILOT_CONFIG || {});

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

  window.KubeManifestPilotSite = { config, toast };
  window.ManifestPilotSite = window.KubeManifestPilotSite;
})();
