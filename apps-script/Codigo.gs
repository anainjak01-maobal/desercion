/* ============================================================
   Lista temprana · seguimiento por código (Google Apps Script)
   Cambia CLAVE por la clave del equipo.
   Después de cada cambio: Implementar > Administrar implementaciones > Versión nueva.
   Solo guarda códigos y números. No hay campos de texto libre, ni nombres, ni motivos.
   ============================================================ */
var CLAVE = "Desercion12345";
var HOJA = "Lista";
var ZONA = "America/Bogota";
var CABECERA = ["Código", "Faltas", "Materias bajo 3", "Vino la última semana", "Actualizado"];

function doGet(e) {
  return salida({ ok: true, mensaje: "Lista temprana activa. Usa la página del proyecto." });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var p = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (String(p.clave || "") !== CLAVE) return salida({ ok: false, error: "Clave incorrecta." });
    var accion = String(p.accion || "");
    if (accion === "verificar") return salida({ ok: true, mensaje: "Clave correcta." });
    if (accion === "listar") return salida({ ok: true, datos: leerDatos() });
    if (accion === "guardar") return salida(guardar(p));
    if (accion === "borrar") return salida(borrar(p));
    return salida({ ok: false, error: "Acción no reconocida." });
  } catch (err) {
    return salida({ ok: false, error: "Error en el servidor: " + err.message });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hoja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(HOJA);
  if (!h) {
    h = ss.insertSheet(HOJA);
    h.getRange(1, 1, 1, CABECERA.length).setValues([CABECERA]).setFontWeight("bold");
    h.setFrozenRows(1);
  }
  return h;
}

function texto(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, "yyyy-MM-dd HH:mm");
  return String(v == null ? "" : v).trim();
}

function numero(v) {
  var t = texto(v).replace(",", ".");
  if (t === "") return null;
  var n = Number(t);
  return isNaN(n) ? null : n;
}

function leerDatos() {
  var h = hoja();
  var ultima = h.getLastRow();
  if (ultima < 2) return [];
  var filas = h.getRange(2, 1, ultima - 1, CABECERA.length).getValues();
  return filas.filter(function (f) { return texto(f[0]) !== ""; }).map(function (f) {
    return { codigo: texto(f[0]), faltas: numero(f[1]) || 0, materias: numero(f[2]) || 0, vino: texto(f[3]) };
  });
}

function validarFila(f) {
  var codigo = texto(f.codigo);
  if (!/^[A-Za-z0-9]{2,8}$/.test(codigo)) return "El código debe tener de 2 a 8 letras o números.";
  var faltas = numero(f.faltas);
  if (faltas === null || faltas < 0 || faltas > 60 || Math.floor(faltas) !== faltas) return "Las faltas deben ser un número entero entre 0 y 60.";
  var materias = numero(f.materias);
  if (materias === null || materias < 0 || materias > 9 || Math.floor(materias) !== materias) return "Las materias bajo 3,0 deben ser un número entero entre 0 y 9.";
  if (["Sí", "No"].indexOf(texto(f.vino)) < 0) return "Indica si vino la última semana.";
  return "";
}

function buscarFila(h, codigo) {
  var ultima = h.getLastRow();
  if (ultima < 2) return 0;
  var ids = h.getRange(2, 1, ultima - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (texto(ids[i][0]) === codigo) return i + 2;
  return 0;
}

function guardar(p) {
  var f = p.fila || {};
  var err = validarFila(f);
  if (err) return { ok: false, error: err };
  var h = hoja();
  var codigo = texto(f.codigo);
  var datos = [codigo, numero(f.faltas), numero(f.materias), texto(f.vino), Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd HH:mm")];
  var fila = buscarFila(h, codigo);
  if (fila) {
    h.getRange(fila, 1, 1, CABECERA.length).setValues([datos]);
    return { ok: true, mensaje: "Registro " + codigo + " actualizado." };
  }
  h.appendRow(datos);
  return { ok: true, mensaje: "Registro " + codigo + " guardado." };
}

function borrar(p) {
  var h = hoja();
  var fila = buscarFila(h, texto(p.codigo));
  if (!fila) return { ok: false, error: "No encuentro el código " + texto(p.codigo) + "." };
  h.deleteRow(fila);
  return { ok: true, mensaje: "Registro borrado." };
}
