(function () {
  function vis(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden") return false;
      if (n.getAttribute("aria-hidden") === "true") return false;
      if (n.hasAttribute("inert")) return false;
      n = n.parentElement;
    }
    return true;
  }
  function srgb(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(rgb) { return 0.2126 * srgb(rgb[0] / 255) + 0.7152 * srgb(rgb[1] / 255) + 0.0722 * srgb(rgb[2] / 255); }
  function parse(s) {
    var m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some(function (x) { return isNaN(x); })) return null;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  function over(fg, bg) {
    var a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
  }
  function effBg(el) {
    var n = el, layers = [];
    while (n && n.nodeType === 1) {
      var c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      n = n.parentElement;
    }
    var base = [255, 255, 255];
    for (var i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }
  function ratio(a, b) {
    var l1 = lum(a), l2 = lum(b);
    if (l2 > l1) { var t = l1; l1 = l2; l2 = t; }
    return (l1 + 0.05) / (l2 + 0.05);
  }
  function accName(el) {
    var al = el.getAttribute("aria-label");
    if (al && al.trim()) return al.trim();
    var lb = el.getAttribute("aria-labelledby");
    if (lb) {
      var t = lb.split(/\s+/).map(function (id) {
        var e = document.getElementById(id); return e ? e.textContent || "" : "";
      }).join(" ").trim();
      if (t) return t;
    }
    var txt = (el.innerText || el.textContent || "").trim();
    if (txt) return txt;
    var ttl = el.getAttribute("title");
    return ttl ? ttl.trim() : "";
  }
  function landmarkFor(el) {
    var r = el.getAttribute("role");
    if (r) return r;
    var t = el.tagName.toLowerCase();
    if (t === "main") return "main";
    if (t === "nav") return "navigation";
    if (t === "aside") return "complementary";
    if (t === "header") return el.closest("main,article,section,aside,nav") ? "" : "banner";
    if (t === "footer") return el.closest("main,article,section,aside,nav") ? "" : "contentinfo";
    return "";
  }

  var headings = [].slice.call(document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]")).map(function (h) {
    return {
      level: h.getAttribute("aria-level") ? Number(h.getAttribute("aria-level")) : Number(h.tagName[1]),
      text: (h.textContent || "").trim().slice(0, 55),
      exposed: vis(h) && !h.classList.contains("sr-only"),
      srOnly: h.classList.contains("sr-only"),
    };
  });

  var landmarks = [].slice.call(document.querySelectorAll("main,nav,aside,header,footer,[role=navigation],[role=main],[role=banner],[role=complementary],[role=contentinfo],[role=region]"))
    .filter(vis)
    .map(function (el) { return { role: landmarkFor(el), name: el.getAttribute("aria-label") || "" }; })
    .filter(function (l) { return l.role; });

  var navs = [].slice.call(document.querySelectorAll("nav")).map(function (n) {
    return {
      label: n.getAttribute("aria-label") || "(none)",
      exposed: vis(n),
      display: getComputedStyle(n).display,
      ariaHidden: n.getAttribute("aria-hidden"),
      items: [].slice.call(n.querySelectorAll("a,button")).map(function (b) { return accName(b).slice(0, 24); }),
      current: [].slice.call(n.querySelectorAll("[aria-current]")).map(function (e) { return (e.textContent || "").trim(); }),
      focusable: [].slice.call(n.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')).length,
    };
  });

  var focusables = [].slice.call(document.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  )).filter(vis);

  var nameless = focusables.filter(function (el) { return !accName(el); }).map(function (el) {
    return { tag: el.tagName.toLowerCase(), slot: el.getAttribute("data-slot") || "", cls: String(el.className).slice(0, 80) };
  });

  var focusOrder = focusables.slice(0, 45).map(function (el) {
    return el.tagName.toLowerCase() + ":" + (accName(el).slice(0, 28) || "(unnamed)");
  });

  var small = focusables.map(function (el) { return { el: el, r: el.getBoundingClientRect() }; })
    .filter(function (o) { return o.r.width > 0 && o.r.height > 0 && (o.r.width < 24 || o.r.height < 24); })
    .map(function (o) { return { label: o.el.tagName.toLowerCase() + ":" + accName(o.el).slice(0, 28), w: Math.round(o.r.width), h: Math.round(o.r.height) }; });

  var sel = '[data-slot="badge"],[data-slot="button"],nav[aria-label="Primary navigation"] button,h1,h2,h3,p,time,span';
  var targets = [].slice.call(document.querySelectorAll(sel)).filter(vis).filter(function (el) {
    var own = "";
    for (var i = 0; i < el.childNodes.length; i++) if (el.childNodes[i].nodeType === 3) own += el.childNodes[i].nodeValue;
    return own.trim().length > 0;
  });
  var seen = {}, contrast = [];
  targets.forEach(function (el) {
    var s = getComputedStyle(el);
    var fg = parse(s.color);
    if (!fg) return;
    var bg = effBg(el);
    var fgOver = fg[3] < 1 ? over(fg, bg) : [fg[0], fg[1], fg[2]];
    var size = parseFloat(s.fontSize);
    var weight = Number(s.fontWeight) || 400;
    var key = (el.getAttribute("data-slot") || el.tagName) + "|" + s.color + "|" + bg.map(Math.round).join(",") + "|" + size + "|" + weight;
    if (seen[key]) return;
    seen[key] = 1;
    var large = size >= 24 || (size >= 18.66 && weight >= 700);
    var r = Math.round(ratio(fgOver, bg) * 100) / 100;
    contrast.push({
      what: el.tagName.toLowerCase() + (el.getAttribute("data-slot") ? "[" + el.getAttribute("data-slot") + "]" : "") + ' "' + (el.innerText || el.textContent || "").trim().slice(0, 26) + '"',
      fg: s.color, bg: "rgb(" + bg.map(Math.round).join(",") + ")",
      ratio: r, size: size, weight: weight, large: large,
      pass: r >= (large ? 3 : 4.5),
    });
  });

  return {
    headings: headings,
    landmarks: landmarks,
    navs: navs,
    ariaCurrentTotal: document.querySelectorAll("[aria-current]").length,
    nameless: nameless,
    focusOrder: focusOrder,
    small: small,
    contrastFails: contrast.filter(function (c) { return !c.pass; }),
    contrastAll: contrast,
  };
})()
