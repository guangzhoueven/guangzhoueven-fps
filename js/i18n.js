// ============================================================================
// i18n — Internationalization System
// ============================================================================
const I18n = (() => {
  let currentLang = localStorage.getItem('gameLang') || 'zh';
  let translations = {};
  let loaded = {};

  // Load a language JSON file
  async function loadLang(lang) {
    if (loaded[lang]) return loaded[lang];
    try {
      const resp = await fetch(`translations/${lang}.json`);
      if (!resp.ok) throw new Error(`Failed to load ${lang}.json`);
      const data = await resp.json();
      loaded[lang] = data;
      return data;
    } catch (e) {
      console.warn(`i18n: Failed to load ${lang}`, e);
      return null;
    }
  }

  // Get a nested value by dot-separated key: "menu.play" => data.menu.play
  function get(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : null, obj);
  }

  // Initialize
  async function init() {
    translations = await loadLang(currentLang);
    if (!translations) {
      // Fallback to English
      currentLang = 'en';
      translations = await loadLang('en');
    }
  }

  // Translate a key, with optional interpolation
  // t('toast.healHp') => "+50 HP"
  // t('toast.bossWave') => "BOSS WAVE"
  // t('shop.upgrades.hp.name') => "Max Health +25"
  function t(key, fallback) {
    const val = get(translations, key);
    if (val !== null && val !== undefined) return val;
    return fallback || key;
  }

  // Translate and replace {0}, {1} etc.
  function tf(key, ...args) {
    let s = t(key, key);
    args.forEach((a, i) => { s = s.replace(`{${i}}`, a); });
    return s;
  }

  // Switch language at runtime
  async function setLang(lang) {
    if (!loaded[lang]) {
      const data = await loadLang(lang);
      if (!data) return false;
    }
    currentLang = lang;
    localStorage.setItem('gameLang', lang);
    translations = loaded[lang];
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    // Dispatch event so other modules can react
    window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
    return true;
  }

  function getLang() { return currentLang; }

  return { init, t, tf, setLang, getLang };
})();
