// ============================================================
// app.js — Portal Aurora II
// ============================================================
'use strict';

var CFG = window.PORTAL_CONFIG || {};
var $ = function (id) { return document.getElementById(id); };
var state = { token: null, nombre: null, apt: null, estado: null };

// ── API (POST text/plain para evitar preflight CORS) ──────────
function api(action, payload) {
  var body = Object.assign({ action: action }, payload || {});
  return fetch(CFG.API_URL, {
    method: 'POST',
    body: JSON.stringify(body) // Content-Type por defecto: text/plain -> sin preflight
  })
  .then(function (r) { return r.json(); })
  .catch(function () { return { ok: false, error: 'No se pudo conectar. Revisa tu internet.' }; });
}

// ── Utilidades UI ─────────────────────────────────────────────
function show(view) {
  ['viewLogin', 'viewDash', 'viewLectura', 'viewPago'].forEach(function (v) {
    $(v).hidden = (v !== view);
  });
  window.scrollTo(0, 0);
}
function loader(on, text) { $('loaderText').textContent = text || 'Cargando…'; $('loader').hidden = !on; }
function msg(el, texto, tipo) {
  var e = $(el); e.textContent = texto || '';
  e.className = 'msg' + (tipo ? ' ' + tipo : '');
}
function cop(n) {
  n = Number(n) || 0;
  return '$' + Math.round(n).toLocaleString('es-CO');
}

// ── Redimensionar imagen antes de subir ───────────────────────
function resizeImage(file, maxDim, quality) {
  maxDim = maxDim || 1600; quality = quality || 0.8;
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
        else if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject; img.src = e.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}
// Enlaza un <input file> a una vista previa y guarda el dataURL en el elemento
function bindFoto(inputId, previewId) {
  $(inputId).addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) { this._data = null; $(previewId).innerHTML = ''; return; }
    $(previewId).innerHTML = '<span class="muted">Procesando foto…</span>';
    var self = this;
    resizeImage(f).then(function (d) {
      self._data = d;
      $(previewId).innerHTML = '<img src="' + d + '" alt="foto">';
    }).catch(function () {
      self._data = null; $(previewId).innerHTML = '<span class="msg err">No se pudo leer la imagen.</span>';
    });
  });
}

// ── LOGIN ─────────────────────────────────────────────────────
$('sendCodeBtn').addEventListener('click', function () {
  var email = $('emailInput').value.trim();
  if (!email || email.indexOf('@') === -1) { msg('loginMsg', 'Escribe un correo válido.', 'err'); return; }
  loader(true, 'Enviando código…');
  api('solicitarCodigo', { email: email }).then(function (r) {
    loader(false);
    if (!r.ok) { msg('loginMsg', r.error, 'err'); return; }
    state._email = email;
    $('stepEmail').hidden = true; $('stepCode').hidden = false;
    $('codeHint').textContent = 'Enviamos un código a ' + email + '. Revísalo (puede tardar 1 min).';
    msg('loginMsg', '');
    $('codeInput').focus();
  });
});
$('backToEmail').addEventListener('click', function () {
  $('stepCode').hidden = true; $('stepEmail').hidden = false; msg('loginMsg', '');
});
$('verifyBtn').addEventListener('click', function () {
  var codigo = $('codeInput').value.trim();
  if (codigo.length < 6) { msg('loginMsg', 'El código tiene 6 dígitos.', 'err'); return; }
  loader(true, 'Verificando…');
  api('verificarCodigo', { email: state._email, codigo: codigo }).then(function (r) {
    loader(false);
    if (!r.ok) { msg('loginMsg', r.error, 'err'); return; }
    state.token = r.token; state.nombre = r.nombre; state.apt = r.apt;
    try { localStorage.setItem('aurora_sess', JSON.stringify({ token: r.token, nombre: r.nombre, apt: r.apt })); } catch (e) {}
    iniciarSesion();
  });
});

function iniciarSesion() {
  $('topbar').hidden = false;
  $('userLine').textContent = state.nombre.split(' ')[0] + ' · ' + state.apt;
  cargarEstado();
}

$('logoutBtn').addEventListener('click', function () {
  try { localStorage.removeItem('aurora_sess'); } catch (e) {}
  state = {};
  $('topbar').hidden = true;
  $('stepCode').hidden = true; $('stepEmail').hidden = false;
  $('emailInput').value = ''; $('codeInput').value = '';
  show('viewLogin');
});

// ── DASHBOARD ─────────────────────────────────────────────────
function cargarEstado() {
  loader(true, 'Cargando tu cuenta…');
  api('estado', { token: state.token }).then(function (r) {
    loader(false);
    if (!r.ok) {
      // token vencido -> volver a login
      if (/sesion/i.test(r.error || '')) { $('logoutBtn').click(); }
      alert(r.error || 'Error');
      return;
    }
    state.estado = r;
    renderDash(r);
    show('viewDash');
  });
}

function renderDash(r) {
  $('sumServ').textContent = cop(r.pendientes.servicios);
  $('sumServ').className = 'sum-val' + (r.pendientes.servicios === 0 ? ' zero' : '');
  $('sumArr').textContent = cop(r.pendientes.arriendo);
  $('sumArr').className = 'sum-val' + (r.pendientes.arriendo === 0 ? ' zero' : '');

  // Aviso lecturas faltantes
  var aviso = $('lecturaAviso');
  if (r.lecturasFaltantes && r.lecturasFaltantes.length) {
    aviso.hidden = false;
    aviso.innerHTML = '📷 Faltan tus lecturas de: <strong>' + r.lecturasFaltantes.join(', ') +
      '</strong>. Toca “Registrar lecturas”.';
  } else { aviso.hidden = true; }

  // Datos de pago
  $('cuentaPago').innerHTML = (r.cuentaPago || '') +
    '<div class="muted" style="font-size:12px;margin-top:6px">Concepto: ' +
    r.nombre.split(' ').slice(0,2).join(' ') + ' - mes - ' + r.apt + '</div>';

  // Meses
  var cont = $('mesesList'); cont.innerHTML = '';
  if (!r.meses.length) { cont.innerHTML = '<div class="card muted">Aún no hay meses registrados.</div>'; return; }

  r.meses.forEach(function (m, i) {
    var sv = m.servicios, ar = m.arriendo;
    var servBadge = !m.cerrado
      ? '<span class="badge pend">Servicios: por cerrar</span>'
      : (sv.pendiente === 0 ? '<span class="badge ok">Servicios pagos</span>' : '<span class="badge pend">Servicios: ' + cop(sv.pendiente) + '</span>');
    var arrBadge = ar.pendiente === 0 ? '<span class="badge ok">Arriendo pago</span>' : '<span class="badge pend">Arriendo: ' + cop(ar.pendiente) + '</span>';

    var det = sv.detalle;
    var filasServ = m.cerrado ? (
      filaKV('Luz', det.luz) + filaKV('Gas', det.gas) + filaKV('Agua', det.agua) +
      filaKV('Aseo', det.aseo) + filaKV('Alcantarillado', det.alcant) +
      '<div class="row total"><span class="k">Total servicios</span><span>' + cop(sv.total) + '</span></div>' +
      filaEstado('Pagado', sv.pagado, 'ok-v') + filaEstado('Pendiente', sv.pendiente, 'pend-v')
    ) : '<div class="row"><span class="k">Servicios</span><span class="pend-v">Pendiente de cierre</span></div>';

    var filasArr =
      '<div class="row"><span class="k">Arriendo del mes</span><span>' + cop(ar.total) + '</span></div>' +
      filaEstado('Pagado', ar.pagado, 'ok-v') + filaEstado('Pendiente', ar.pendiente, 'pend-v');

    var el = document.createElement('div');
    el.className = 'mes' + (i === 0 ? ' open' : '');
    el.innerHTML =
      '<div class="mes-head"><span class="mes-per">' + m.periodo + '</span>' +
      '<span class="mes-badges">' + servBadge + arrBadge + '</span></div>' +
      '<div class="mes-body">' +
        '<div class="mes-sub">Servicios</div>' + filasServ +
        '<div class="mes-sub">Arriendo</div>' + filasArr +
      '</div>';
    el.querySelector('.mes-head').addEventListener('click', function () { el.classList.toggle('open'); });
    cont.appendChild(el);
  });
}
function filaKV(k, v) { return '<div class="row"><span class="k">' + k + '</span><span>' + cop(v) + '</span></div>'; }
function filaEstado(k, v, cls) {
  if (!v) return '';
  return '<div class="row"><span class="k">' + k + '</span><span class="' + cls + '">' + cop(v) + '</span></div>';
}

// Llenar selects de periodo con los meses del estado
function llenarPeriodos() {
  var meses = (state.estado && state.estado.meses) || [];
  var opts = meses.map(function (m) { return '<option>' + m.periodo + '</option>'; }).join('');
  $('pagoPeriodo').innerHTML = opts;
  // Para lecturas, priorizar los que faltan
  var falt = (state.estado && state.estado.lecturasFaltantes) || [];
  var ordenados = falt.concat(meses.map(function(m){return m.periodo;}).filter(function(p){return falt.indexOf(p)===-1;}));
  $('lecturaPeriodo').innerHTML = ordenados.map(function (p) { return '<option>' + p + '</option>'; }).join('');
}

// ── NAVEGACION ────────────────────────────────────────────────
$('goLectura').addEventListener('click', function () { llenarPeriodos(); msg('lecturaMsg',''); show('viewLectura'); });
$('goPago').addEventListener('click', function () { llenarPeriodos(); msg('pagoMsg',''); show('viewPago'); });
$('goContrato').addEventListener('click', function () {
  loader(true, 'Abriendo contrato…');
  api('contrato', { token: state.token }).then(function (r) {
    loader(false);
    if (!r.ok) { alert(r.error); return; }
    window.open(r.url, '_blank');
  });
});
$('lecturaBack').addEventListener('click', function () { show('viewDash'); });
$('pagoBack').addEventListener('click', function () { show('viewDash'); });

// ── ENVIAR LECTURA ────────────────────────────────────────────
bindFoto('fLuz', 'pLuz'); bindFoto('fGas', 'pGas'); bindFoto('fAgua', 'pAgua');
$('enviarLectura').addEventListener('click', function () {
  var p = {
    token: state.token,
    periodo: $('lecturaPeriodo').value,
    luz: $('lLuz').value.trim(), gas: $('lGas').value.trim(), agua: $('lAgua').value.trim(),
    fotoLuz: $('fLuz')._data || '', fotoGas: $('fGas')._data || '', fotoAgua: $('fAgua')._data || ''
  };
  // Lectura parcial permitida: basta una lectura O una foto de cualquier servicio
  if (!p.luz && !p.gas && !p.agua && !p.fotoLuz && !p.fotoGas && !p.fotoAgua) {
    msg('lecturaMsg', 'Ingresa al menos una lectura o una foto.', 'err'); return;
  }
  loader(true, 'Enviando lecturas y fotos…');
  api('subirLectura', p).then(function (r) {
    loader(false);
    if (!r.ok) { msg('lecturaMsg', r.error, 'err'); return; }
    msg('lecturaMsg', '¡Listo! Lecturas registradas. Gracias.', 'ok');
    ['lLuz','lGas','lAgua'].forEach(function(id){ $(id).value=''; });
    ['fLuz','fGas','fAgua'].forEach(function(id){ $(id).value=''; $(id)._data=null; });
    ['pLuz','pGas','pAgua'].forEach(function(id){ $(id).innerHTML=''; });
    setTimeout(cargarEstado, 1200);
  });
});

// ── ENVIAR PAGO ───────────────────────────────────────────────
bindFoto('fComprobante', 'pComprobante');
$('enviarPago').addEventListener('click', function () {
  var foto = $('fComprobante')._data;
  if (!foto) { msg('pagoMsg', 'Adjunta la foto del comprobante.', 'err'); return; }
  var p = {
    token: state.token,
    concepto: $('pagoConcepto').value,
    periodo: $('pagoPeriodo').value,
    monto: $('pagoMonto').value.replace(/[^0-9]/g, ''),
    foto: foto
  };
  loader(true, 'Enviando comprobante…');
  api('subirPago', p).then(function (r) {
    loader(false);
    if (!r.ok) { msg('pagoMsg', r.error, 'err'); return; }
    msg('pagoMsg', '¡Comprobante recibido! Queda en revisión. Te confirmaremos cuando se verifique.', 'ok');
    $('pagoMonto').value = ''; $('fComprobante').value = ''; $('fComprobante')._data = null; $('pComprobante').innerHTML = '';
  });
});

// ── ARRANQUE: sesión guardada ─────────────────────────────────
(function init() {
  if (!CFG.API_URL || CFG.API_URL.indexOf('PEGA_AQUI') !== -1) {
    msg('loginMsg', 'Falta configurar la URL del servidor en config.js', 'err');
  }
  try {
    var s = JSON.parse(localStorage.getItem('aurora_sess') || 'null');
    if (s && s.token) { state.token = s.token; state.nombre = s.nombre; state.apt = s.apt; iniciarSesion(); return; }
  } catch (e) {}
  show('viewLogin');
})();
