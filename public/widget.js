/*!
 * ModeMorph outfit-matching widget loader.
 *
 * Embed on a partner storefront:
 *   <script src="https://modemorph.ru/widget.js"
 *           data-key="mm_wk_..."
 *           data-mount="#modemorph-widget"
 *           data-cart='[{"sku":"ABC123"}]'></script>
 *
 * Or drive it dynamically (e.g. on cart change):
 *   window.ModeMorph.render({ cart: [{ sku: "ABC123" }], mount: "#el" });
 *
 * The UI renders into a Shadow DOM (isolated from the host page's CSS) and calls
 * the ModeMorph API cross-origin with the publishable key. The key is locked to
 * the partner's registered origins server-side. No innerHTML is used — all text
 * is set via textContent so a partner-controlled string can never inject markup.
 */
(function () {
  "use strict";

  var current = document.currentScript;
  var API_ORIGIN = current ? new URL(current.src).origin : "https://modemorph.ru";

  var STYLES = "\
:host{all:initial}\
*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}\
.mm-wrap{margin:16px 0}\
.mm-title{font-size:15px;font-weight:600;color:#111;margin:0 0 12px}\
.mm-row{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px;scrollbar-width:thin}\
.mm-card{flex:0 0 auto;width:188px;border:1px solid #eee;border-radius:14px;background:#fff;overflow:hidden;display:flex;flex-direction:column}\
.mm-card-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px 0}\
.mm-badge{font-size:10px;font-weight:600;color:#0a7d3b;background:#e7f6ee;border-radius:999px;padding:2px 7px}\
.mm-items{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:8px}\
.mm-it{position:relative;display:block;text-decoration:none;border-radius:9px;overflow:hidden;background:#f6f6f6;aspect-ratio:3/4}\
.mm-it img{width:100%;height:100%;object-fit:cover;display:block}\
.mm-it.mm-anchor{outline:2px solid #111;outline-offset:-2px}\
.mm-it .mm-tag{position:absolute;left:4px;top:4px;font-size:9px;background:rgba(17,17,17,.78);color:#fff;border-radius:6px;padding:1px 5px}\
.mm-cta{margin:8px;padding:8px;border:0;border-radius:10px;background:#111;color:#fff;font-size:13px;font-weight:600;text-align:center;text-decoration:none;cursor:pointer}\
.mm-empty,.mm-err{font-size:13px;color:#888;padding:10px 0}\
.mm-skel{flex:0 0 auto;width:188px;height:280px;border-radius:14px;background:linear-gradient(90deg,#f2f2f2 25%,#e9e9e9 37%,#f2f2f2 63%);background-size:400% 100%;animation:mm-sh 1.3s ease infinite}\
@keyframes mm-sh{0%{background-position:100% 0}100%{background-position:-100% 0}}\
.mm-foot{font-size:10px;color:#bbb;margin-top:8px}\
";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function resolveMount(mount) {
    if (mount && typeof mount === "object" && mount.nodeType === 1) return mount;
    if (typeof mount === "string") {
      var found = document.querySelector(mount);
      if (found) return found;
    }
    var d = el("div");
    if (current && current.parentNode) current.parentNode.insertBefore(d, current);
    else document.body.appendChild(d);
    return d;
  }

  function track(key, payload) {
    try {
      var url = API_ORIGIN + "/api/v1/widget/event?key=" + encodeURIComponent(key);
      // keepalive so the beacon survives the navigation a buy-click triggers
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  function buildItem(it, key, sessionId) {
    var a = el("a", "mm-it" + (it.is_anchor ? " mm-anchor" : ""));
    a.href = it.buy_url || "#";
    a.target = "_blank";
    a.rel = "noopener nofollow sponsored";
    if (it.image_url) {
      var img = el("img");
      img.src = it.image_url;
      img.alt = it.name || "";
      img.loading = "lazy";
      a.appendChild(img);
    }
    if (it.is_anchor) a.appendChild(el("span", "mm-tag", "из корзины"));
    a.addEventListener("click", function () {
      track(key, { session_id: sessionId, event_type: "item_click", item_id: it.id });
    });
    return a;
  }

  function renderOutfits(root, key, data) {
    clear(root);
    var wrap = el("div", "mm-wrap");
    var titlePrefix = data.partner && data.partner.name ? data.partner.name + " — " : "";
    wrap.appendChild(el("h3", "mm-title", titlePrefix + "Образы с этой вещью"));

    if (!data.outfits || !data.outfits.length) {
      wrap.appendChild(el("div", "mm-empty", "Пока не удалось собрать образ для этих товаров."));
      root.appendChild(wrap);
      return;
    }

    var row = el("div", "mm-row");
    data.outfits.forEach(function (outfit) {
      var card = el("div", "mm-card");
      var head = el("div", "mm-card-head");
      head.appendChild(el("span", "mm-badge", "Образ"));
      card.appendChild(head);

      var grid = el("div", "mm-items");
      var firstBuy = null;
      outfit.items.forEach(function (it) {
        grid.appendChild(buildItem(it, key, data.session_id));
        if (!it.is_anchor && it.buy_url && !firstBuy) firstBuy = it;
      });
      card.appendChild(grid);

      if (firstBuy) {
        var cta = el("a", "mm-cta", "Добавить к образу");
        cta.href = firstBuy.buy_url;
        cta.target = "_blank";
        cta.rel = "noopener nofollow sponsored";
        cta.addEventListener("click", function () {
          track(key, { session_id: data.session_id, event_type: "add_to_cart", item_id: firstBuy.id });
        });
        card.appendChild(cta);
      }
      row.appendChild(card);
    });

    wrap.appendChild(row);
    wrap.appendChild(el("div", "mm-foot", "Подбор образов ModeMorph"));
    root.appendChild(wrap);

    track(key, { session_id: data.session_id, event_type: "outfit_view" });
  }

  function showSkeleton(root) {
    clear(root);
    var wrap = el("div", "mm-wrap");
    wrap.appendChild(el("h3", "mm-title", "Подбираем образы…"));
    var row = el("div", "mm-row");
    for (var i = 0; i < 3; i++) row.appendChild(el("div", "mm-skel"));
    wrap.appendChild(row);
    root.appendChild(wrap);
  }

  var ModeMorph = {
    render: function (opts) {
      opts = opts || {};
      var key = opts.key || (current && current.getAttribute("data-key"));
      if (!key) return console.error("[ModeMorph] missing widget key");
      var cart = opts.cart || [];
      if (!cart.length) return;

      var host = resolveMount(opts.mount);
      var shadow = host.__mmShadow || host.attachShadow({ mode: "open" });
      host.__mmShadow = shadow;
      clear(shadow);
      var style = el("style");
      style.textContent = STYLES;
      var root = el("div");
      shadow.appendChild(style);
      shadow.appendChild(root);

      showSkeleton(root);

      fetch(API_ORIGIN + "/api/v1/widget/recommend?key=" + encodeURIComponent(key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart: cart, n_outfits: opts.nOutfits || 3 }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (data) { renderOutfits(root, key, data); })
        .catch(function (e) {
          clear(root);
          root.appendChild(el("div", "mm-err", ""));
          console.error("[ModeMorph] widget error:", e);
        });
    },
  };

  window.ModeMorph = ModeMorph;

  // Auto-init from the script tag's data attributes.
  if (current && current.getAttribute("data-key")) {
    var autoCart = [];
    try { autoCart = JSON.parse(current.getAttribute("data-cart") || "[]"); } catch (e) {}
    if (autoCart.length) {
      ModeMorph.render({
        key: current.getAttribute("data-key"),
        mount: current.getAttribute("data-mount"),
        cart: autoCart,
        nOutfits: parseInt(current.getAttribute("data-outfits"), 10) || 3,
      });
    }
  }
})();
