// Counts every screen, not just the first load.
//
// Both apps are single-page: React swaps the view without fetching a new
// document, so the stock counter fires once on arrival and every screen after
// that is invisible. "Opened the demo" was the only question it could answer.
//
// no_onload hands counting over to us. We send one hit on arrival and one per
// route change, hooking pushState/replaceState because that is what the router
// calls — there is no navigation event to listen for otherwise.
//
// Dated segments collapse back to :month. Without that, every month becomes its
// own row and a six-step funnel splits into rows of one.
//
// The /demo prefix keeps these apart from /work/ and /writing/ on the portfolio,
// which are counted by the same GoatCounter under their real paths.
(function () {
  var PREFIX = '/demo/amazon';

  window.goatcounter = window.goatcounter || {};
  window.goatcounter.no_onload = true;

  function tidy(p) {
    return p.replace(/\/\d{4}-\d{2}(-\d{2})?(?=\/|$)/g, '/:month')
            .replace(/\/+$/, '') || '/';
  }

  var last = null;
  function hit() {
    var p = PREFIX + tidy(location.pathname);
    if (p === last) return;
    last = p;
    window.goatcounter.count({ path: p, title: document.title });
  }

  function whenReady(fn) {
    if (window.goatcounter && typeof window.goatcounter.count === 'function') fn();
    else setTimeout(function () { whenReady(fn); }, 150);
  }

  whenReady(function () {
    hit();
    var push = history.pushState, repl = history.replaceState;
    history.pushState = function () { push.apply(this, arguments); hit(); };
    history.replaceState = function () { repl.apply(this, arguments); hit(); };
    window.addEventListener('popstate', hit);
  });
})();
