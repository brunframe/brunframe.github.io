/* Breslev Gang — mode Chabbat (réglage du thème, désactivé par défaut).
   Du vendredi, quelques minutes avant le coucher du soleil, au samedi soir après la tombée de la nuit (heures calculées
   pour le lieu réglé, Paris par défaut), les boutons d'ajout au panier et de commande sont fermés et portent le message
   du réglage. ?chabbat=1 dans l'adresse montre ce mode à tout moment (essai, aperçu) ; ?chabbat=0 l'arrête. */
(() => {
  'use strict';
  const C = (window.themeConfig && window.themeConfig.chabbat) || {};
  const params = new URLSearchParams(location.search);
  let force = null;
  try {
    if (params.has('chabbat')) sessionStorage.setItem('bg-chabbat', params.get('chabbat') === '1' ? '1' : '0');
    force = sessionStorage.getItem('bg-chabbat');
  } catch (e) { force = params.get('chabbat'); }
  if (!C.actif && force !== '1') return;

  // coucher du soleil (équation du lever et du coucher, précision de l'ordre de la minute)
  const rad = Math.PI / 180;
  function coucher(jour, lat, lng) {
    const J2000 = Date.UTC(2000, 0, 1, 12);
    const n = Math.round((Date.UTC(jour.getFullYear(), jour.getMonth(), jour.getDate(), 12) - J2000) / 864e5) - lng / 360;
    const M = (357.5291 + 0.98560028 * n) % 360;
    const Cc = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
    const L = (M + Cc + 180 + 102.9372) % 360;
    const transit = n + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
    const decl = Math.asin(Math.sin(L * rad) * Math.sin(23.44 * rad));
    const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
    const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad;
    return new Date(J2000 + (transit + H / 360) * 864e5);
  }
  function enChabbat(maintenant) {
    const lat = Number(C.lat) || 48.8566;
    const lng = Number(C.lng) || 2.3522;
    const avant = (Number(C.avant) || 18) * 6e4;
    const apres = (Number(C.apres) || 42) * 6e4;
    const j = maintenant.getDay();                      // 5 vendredi, 6 samedi
    const vendredi = new Date(maintenant);
    vendredi.setDate(maintenant.getDate() - ((j + 2) % 7));      // le dernier vendredi (aujourd'hui si vendredi)
    const samedi = new Date(vendredi);
    samedi.setDate(vendredi.getDate() + 1);
    const debut = coucher(vendredi, lat, lng).getTime() - avant;
    const fin = coucher(samedi, lat, lng).getTime() + apres;
    return maintenant.getTime() >= debut && maintenant.getTime() < fin;
  }
  if (force !== '1' && !enChabbat(new Date())) return;

  const message = C.message || '';
  document.documentElement.classList.add('chabbat');
  const fermer = (root = document) => {
    // réappliqué à chaque changement (la fiche réactive son bouton quand on change de couleur) ; sans effet s'il est déjà fermé
    root.querySelectorAll('[data-add-to-cart], [data-product-form] [type="submit"], [name="checkout"], [data-checkout]').forEach((b) => {
      if (!b.disabled) b.disabled = true;
      if (b.getAttribute('aria-disabled') !== 'true') b.setAttribute('aria-disabled', 'true');
      if (message && !b.matches('[data-card-add]') && b.textContent.trim() !== message) b.textContent = message;
    });
  };
  // aucun ajout ne passe, même par un bouton créé après coup (panier, suggestions, créateur)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add-to-cart], [data-suggest-variant], [name="checkout"], [data-checkout]');
    if (b) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('submit', (e) => {
    if (e.target.closest('form[action*="/cart"]') || e.target.matches('[data-product-form]')) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fermer());
  else fermer();
  new MutationObserver(() => fermer()).observe(document.documentElement, { childList: true, subtree: true });
})();
