(function () {
  "use strict";
  var CFG = window.LT_CONFIG || {};
  var clave = "", datos = [], umbral = 6;
  var NOMBRE_RE = /^[A-Za-zÀ-ÿ' .\-]{3,60}$/;
  var CATS = {
    llamada: { t: "Llamada", c: "c-llamada" },
    blanca: { t: "Semana en blanco", c: "c-blanca" },
    refuerzo: { t: "Refuerzo", c: "c-refuerzo" },
    seguimiento: { t: "Seguimiento", c: "c-seguimiento" },
    sin: { t: "Sin señal", c: "c-sin" }
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function msg(el, t, tipo) { el.textContent = t; el.className = "msg" + (tipo ? " " + tipo : ""); }
  function pct(x) { return x == null ? "—" : Math.round(x * 100) + " %"; }
  function ordenar(a) { return a.slice().sort(function (x, y) { return x.codigo < y.codigo ? -1 : x.codigo > y.codigo ? 1 : 0; }); }
  function etiqueta(d) { return d.nombre || d.codigo; }

  function enviar(accion, extra) {
    if (!CFG.REGISTRO) return Promise.resolve({ ok: false, error: "Falta la dirección del registro en config.js." });
    var cuerpo = Object.assign({ accion: accion, clave: clave }, extra || {});
    return fetch(CFG.REGISTRO, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(cuerpo)
    }).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: "No hay conexión con el registro. Intenta de nuevo." }; });
  }

  /* ---------- Reglas (las del equipo) ---------- */
  function categoria(d, u) {
    if (d.vino === "No") return "blanca";
    var dosSenales = d.faltas >= u && d.materias >= 2;
    if (dosSenales) return "llamada";
    if (d.materias >= 2) return "refuerzo";
    if (d.faltas >= u) return "seguimiento";
    return "sin";
  }
  function wilson(k, n) {
    if (!n) return null;
    var z = 1.96, p = k / n, z2 = z * z, den = 1 + z2 / n;
    var c = (p + z2 / (2 * n)) / den, m = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / den;
    return [Math.max(0, c - m), Math.min(1, c + m)];
  }
  function contar(lista, u) {
    var r = { llamada: 0, blanca: 0, refuerzo: 0, seguimiento: 0, sin: 0 };
    lista.forEach(function (d) { r[categoria(d, u)]++; });
    return r;
  }

  /* ---------- Navegación y acceso ---------- */
  var VISTAS = ["panel", "registrar", "registros"];
  function mostrar(vista) {
    VISTAS.forEach(function (v) { $("vista-" + v).hidden = v !== vista; });
    document.querySelectorAll("[data-vista]").forEach(function (b) {
      b.setAttribute("aria-current", b.dataset.vista === vista ? "page" : "false");
    });
    if (vista === "panel") pintarPanel();
    if (vista === "registros") pintarRegistros();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("[data-vista]").forEach(function (b) {
    b.addEventListener("click", function () { mostrar(b.dataset.vista); });
  });
  $("acc-form").addEventListener("submit", function (e) {
    e.preventDefault();
    clave = $("clave").value;
    if (!clave) return;
    $("acc-btn").disabled = true; msg($("acc-msg"), "Entrando…");
    enviar("verificar").then(function (r) {
      $("acc-btn").disabled = false;
      if (!r.ok) { clave = ""; msg($("acc-msg"), r.error || "Clave incorrecta.", "error"); return; }
      $("clave").value = "";
      $("vista-acceso").hidden = true;
      document.body.classList.add("logueado");
      $("inicio").hidden = true;
      $("barra").hidden = false;
      $("titulo").textContent = "Lista temprana del grupo";
      limpiarFormulario();
      cargarTodo().then(function () { mostrar("panel"); });
    });
  });
  $("salir").addEventListener("click", function () {
    clave = ""; datos = [];
    VISTAS.forEach(function (v) { $("vista-" + v).hidden = true; });
    $("barra").hidden = true;
    $("vista-acceso").hidden = false;
    document.body.classList.remove("logueado");
    $("inicio").hidden = false;
    $("titulo").textContent = "Entrar";
    msg($("acc-msg"), "");
  });
  $("ir-acceso").addEventListener("click", function () { setTimeout(function () { $("clave").focus(); }, 400); });
  $("umbral").addEventListener("change", function () { umbral = Number($("umbral").value); pintarPanel(); });

  function cargarTodo() {
    return enviar("listar").then(function (r) {
      if (!r.ok) { msg($("g-msg"), r.error || "No pude cargar los datos.", "error"); return; }
      datos = (r.datos || []).map(function (d) {
        return {
          codigo: d.codigo, nombre: d.nombre || "", grado: Number(d.grado) || 0,
          faltas: Number(d.faltas) || 0, materias: Number(d.materias) || 0, vino: d.vino
        };
      });
      pintarPanel();
      pintarRegistros();
    });
  }

  /* ---------- Panel ---------- */
  function pintarPanel() {
    if (!datos.length) {
      ["leyenda-cat", "kpis", "tabla-umbral", "cruce", "listas"].forEach(function (id) { $(id).innerHTML = ""; });
      $("mapa").innerHTML = '<p class="vacio-mapa">Todavía no hay registros. Revisa que la hoja tenga una pestaña llamada "Lista" con los estudiantes, y que config.js tenga la dirección del Apps Script.</p>';
      $("cruce-nota").textContent = "";
      msg($("g-msg"), "Todavía no hay registros.");
      return;
    }
    msg($("g-msg"), "");
    var rs = ordenar(datos);
    var cuenta = contar(rs, umbral);

    $("mapa").innerHTML = rs.map(function (d, i) {
      var k = categoria(d, umbral);
      return '<button type="button" class="cuadro ' + CATS[k].c + '" data-codigo="' + esc(d.codigo) + '" style="--d:' + (i * 25) + 'ms" aria-label="' + esc(etiqueta(d)) + ", " + CATS[k].t + '">' + esc(d.codigo) + "</button>";
    }).join("");
    $("leyenda-cat").innerHTML = Object.keys(CATS).map(function (k) {
      return '<span><i class="sw ' + CATS[k].c + '"></i>' + CATS[k].t + " · " + cuenta[k] + "</span>";
    }).join("");

    $("kpis").innerHTML = [
      { k: "llamada", l: "Llamada", s: "dos señales y vino" },
      { k: "blanca", l: "Semana en blanco", s: "no vino la última semana" },
      { k: "refuerzo", l: "Refuerzo", s: "pierde materias, faltó poco" },
      { k: "seguimiento", l: "Seguimiento", s: "faltó seguido, pasa materias" },
      { k: "sin", l: "Sin señal", s: "vino y no cumple señales" }
    ].map(function (x, i) {
      return '<div class="kpi ' + x.k + '" style="animation-delay:' + (i * 60) + 'ms"><div class="lbl">' + x.l + '</div><div class="val">' +
        cuenta[x.k] + '</div><div class="sub">' + x.s + "</div></div>";
    }).join("");

    $("tabla-umbral").innerHTML = '<thead><tr><th>Umbral de faltas</th><th class="n">Llamada</th><th class="n">Refuerzo</th><th class="n">Seguimiento</th><th class="n">Sin señal</th><th class="n">Semana en blanco</th></tr></thead><tbody>' +
      [5, 6, 7].map(function (u) {
        var c = contar(rs, u);
        return "<tr" + (u === umbral ? ' class="actual"' : "") + "><td>" + u + " faltas" + (u === 6 ? " (el del equipo)" : "") + '</td><td class="n">' + c.llamada +
          '</td><td class="n">' + c.refuerzo + '</td><td class="n">' + c.seguimiento + '</td><td class="n">' + c.sin + '</td><td class="n">' + c.blanca + "</td></tr>";
      }).join("") + "</tbody>";

    var dos = rs.filter(function (d) { return d.faltas >= umbral && d.materias >= 2; });
    var otros = rs.filter(function (d) { return !(d.faltas >= umbral && d.materias >= 2); });
    var nDos = dos.filter(function (d) { return d.vino === "No"; }).length;
    var nOtros = otros.filter(function (d) { return d.vino === "No"; }).length;
    var cdos = wilson(nDos, dos.length), cotros = wilson(nOtros, otros.length);
    $("cruce").innerHTML = '<table class="tabla"><thead><tr><th>Grupo</th><th class="n">Total</th><th class="n">No vino</th><th class="n">Proporción</th><th class="n">Intervalo 95 %</th></tr></thead><tbody>' +
      '<tr><td>Con dos señales</td><td class="n">' + dos.length + '</td><td class="n">' + nDos + '</td><td class="n">' + pct(dos.length ? nDos / dos.length : null) +
      '</td><td class="n">' + (cdos ? pct(cdos[0]) + " a " + pct(cdos[1]) : "—") + "</td></tr>" +
      '<tr><td>Sin dos señales</td><td class="n">' + otros.length + '</td><td class="n">' + nOtros + '</td><td class="n">' + pct(otros.length ? nOtros / otros.length : null) +
      '</td><td class="n">' + (cotros ? pct(cotros[0]) + " a " + pct(cotros[1]) : "—") + "</td></tr></tbody>";
    $("cruce-nota").textContent = "Con tan pocos datos, los intervalos son amplios. Una diferencia así indica dónde mirar; no prueba que las señales causen que alguien no vuelva.";

    var listas = [
      { k: "llamada", t: "Llamada", d: "Vino, faltó seguido y pierde dos o más materias. Coordinación verifica y llama." },
      { k: "blanca", t: "Semana en blanco", d: "No vino entre el 10 y el 14 de agosto. Coordinación verifica por qué, tenga o no señales." },
      { k: "refuerzo", t: "Refuerzo", d: "Vino y pierde dos o más materias, pero faltó poco. Es refuerzo académico, no una etiqueta." },
      { k: "seguimiento", t: "Seguimiento", d: "Faltó seguido, pero vino y pasa sus materias. Acompañamiento, no llamada de deserción." }
    ];
    $("listas").innerHTML = '<div class="listas-grid">' + listas.map(function (L) {
      var items = rs.filter(function (d) { return categoria(d, umbral) === L.k; });
      return '<section class="panel lista"><header><h3>' + L.t + " · " + items.length + "</h3><p>" + L.d + "</p></header>" +
        (items.length ? "<ul>" + items.map(function (d) {
          return '<li id="fila-' + esc(d.codigo) + '"><strong>' + esc(etiqueta(d)) + '</strong><span class="muted">' + esc(d.codigo) +
            (d.grado ? " · " + d.grado + "°" : "") + " · " + d.faltas + " faltas · " + d.materias + " materias bajo 3,0</span></li>";
        }).join("") + "</ul>" : '<p class="vacio">Ninguno con este umbral.</p>') + "</section>";
    }).join("") + "</div>";
  }

  /* ---------- Interacción con el mapa ---------- */
  var tip = null;
  $("mapa").addEventListener("mouseover", function (e) {
    var b = e.target.closest(".cuadro");
    if (!b) return;
    var d = datos.filter(function (x) { return x.codigo === b.dataset.codigo; })[0];
    if (!d) return;
    $("mapa").classList.add("con-foco");
    b.classList.add("activo");
    if (!tip) { tip = document.createElement("div"); tip.className = "tip"; document.body.appendChild(tip); }
    tip.textContent = etiqueta(d) + " · " + (d.grado ? d.grado + "° · " : "") + CATS[categoria(d, umbral)].t + " · " + d.faltas + " faltas · " + d.materias +
      " materias bajo 3,0 · " + (d.vino === "Sí" ? "vino" : "no vino") + " la última semana";
    tip.style.display = "block";
  });
  $("mapa").addEventListener("mousemove", function (e) {
    if (tip) { tip.style.left = (e.clientX + 14) + "px"; tip.style.top = (e.clientY + 14) + "px"; }
  });
  $("mapa").addEventListener("mouseout", function (e) {
    if (!e.target.closest(".cuadro")) return;
    $("mapa").classList.remove("con-foco");
    $("mapa").querySelectorAll(".activo").forEach(function (x) { x.classList.remove("activo"); });
    if (tip) tip.style.display = "none";
  });
  $("mapa").addEventListener("click", function (e) {
    var b = e.target.closest(".cuadro");
    if (!b) return;
    var fila = document.getElementById("fila-" + b.dataset.codigo);
    if (!fila) { msg($("g-msg"), "Ese estudiante está en la categoría sin señal: no tiene fila en las listas."); return; }
    fila.scrollIntoView({ behavior: "smooth", block: "center" });
    fila.classList.add("resaltada");
    setTimeout(function () { fila.classList.remove("resaltada"); }, 1600);
  });

  /* ---------- Registrar ---------- */
  function limpiarFormulario() {
    $("r-codigo").value = ""; $("r-codigo").disabled = false;
    $("r-nombre").value = ""; $("r-grado").selectedIndex = 0;
    $("r-faltas").value = ""; $("r-materias").value = ""; $("r-vino").selectedIndex = 0;
    msg($("r-msg"), "");
  }
  $("r-limpiar").addEventListener("click", limpiarFormulario);
  $("r-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = {
      codigo: $("r-codigo").value.trim(), nombre: $("r-nombre").value.trim(), grado: $("r-grado").value,
      faltas: $("r-faltas").value.trim(), materias: $("r-materias").value.trim(), vino: $("r-vino").value
    };
    if (!/^[A-Za-z0-9]{2,8}$/.test(f.codigo)) { msg($("r-msg"), "El código debe tener de 2 a 8 letras o números.", "error"); return; }
    if (!NOMBRE_RE.test(f.nombre)) { msg($("r-msg"), "El nombre debe tener de 3 a 60 letras (se permiten tildes, ñ, espacios, guion y punto).", "error"); return; }
    if (!/^(6|7|8|9|10|11)$/.test(f.grado)) { msg($("r-msg"), "Elige el grado.", "error"); return; }
    if (!/^\d{1,2}$/.test(f.faltas) || Number(f.faltas) > 60) { msg($("r-msg"), "Las faltas deben ser un número entero entre 0 y 60.", "error"); return; }
    if (!/^\d$/.test(f.materias)) { msg($("r-msg"), "Las materias bajo 3,0 deben ser un número entero entre 0 y 9.", "error"); return; }
    $("r-guardar").disabled = true; msg($("r-msg"), "Guardando…");
    enviar("guardar", { fila: f }).then(function (r) {
      $("r-guardar").disabled = false;
      if (!r.ok) { msg($("r-msg"), r.error || "No se pudo guardar.", "error"); return; }
      limpiarFormulario();
      msg($("r-msg"), r.mensaje, "ok");
      cargarTodo();
    });
  });

  /* ---------- Registros ---------- */
  function pintarRegistros() {
    var rs = ordenar(datos);
    $("g-resumen").textContent = rs.length + " estudiantes registrados. Editar o quitar cambia el panel.";
    $("tbody-registros").innerHTML = rs.length ? rs.map(function (d) {
      return "<tr><td>" + esc(d.codigo) + "</td><td>" + esc(d.nombre) + '</td><td class="n">' + (d.grado || "") + '</td><td class="n">' + d.faltas +
        '</td><td class="n">' + d.materias + "</td><td>" + esc(d.vino) +
        '</td><td><button class="btn pequeno" type="button" data-accion="editar" data-codigo="' + esc(d.codigo) + '">Editar</button> ' +
        '<button class="btn pequeno peligro" type="button" data-accion="quitar" data-codigo="' + esc(d.codigo) + '">Quitar</button></td></tr>';
    }).join("") : '<tr><td colspan="7" class="muted">Todavía no hay registros.</td></tr>';
  }
  $("tbody-registros").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-accion]");
    if (!b) return;
    var d = datos.filter(function (x) { return x.codigo === b.dataset.codigo; })[0];
    if (!d) return;
    if (b.dataset.accion === "editar") {
      $("r-codigo").value = d.codigo; $("r-codigo").disabled = true;
      $("r-nombre").value = d.nombre; $("r-grado").value = d.grado ? String(d.grado) : "";
      $("r-faltas").value = d.faltas; $("r-materias").value = d.materias; $("r-vino").value = d.vino;
      msg($("r-msg"), ""); mostrar("registrar");
      return;
    }
    if (!confirm("¿Quitar a " + etiqueta(d) + " (" + d.codigo + ") de la lista?")) return;
    enviar("borrar", { codigo: d.codigo }).then(function (r) {
      if (!r.ok) { msg($("g-msg"), r.error || "No se pudo quitar.", "error"); return; }
      cargarTodo().then(function () { msg($("g-msg"), "Quitado: " + etiqueta(d) + ".", "ok"); });
    });
  });
})();
