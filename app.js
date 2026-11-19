// ============================================================
// app.js — Portal Aurora II
// ============================================================
'use strict';

var CFG = window.PORTAL_CONFIG || {};
var $ = function (id) { return document.getElementById(id); };
var state = { token: null, nombre: null, apt: null, role: 'tenant', estado: null, admin: null };

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
  ['viewLogin', 'viewDash', 'viewLectura', 'viewPago', 'viewAdmin', 'viewConciliar'].forEach(function (v) {
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
    state.role = r.role || 'tenant'; state.conciliar = !!r.conciliar;
    try { localStorage.setItem('aurora_sess', JSON.stringify({ token: r.token, nombre: r.nombre, apt: r.apt, role: state.role, conciliar: state.conciliar })); } catch (e) {}
    iniciarSesion();
  });
});

function iniciarSesion() {
  $('topbar').hidden = false;
  if (state.role === 'admin') {
    $('userLine').textContent = state.nombre.split(' ')[0] + ' · Admin';
    cargarAdmin();
  } else {
    $('userLine').textContent = state.nombre.split(' ')[0] + ' · ' + (state.apt || '');
    cargarEstado();
  }
}

$('logoutBtn').addEventListener('click', function () {
  try { localStorage.removeItem('aurora_sess'); } catch (e) {}
  state = { role: 'tenant' };
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

function renderDash(r, adminMode) {
  // Modo admin: oculta acciones de arrendatario, muestra "volver al panel"
  $('tenantActions').hidden = !!adminMode;
  $('goContrato').hidden = !!adminMode;
  $('dashBackAdmin').hidden = !adminMode;
  $('dashAptTitle').hidden = !adminMode;
  if (adminMode) $('dashAptTitle').textContent = r.apt + ' · ' + (r.nombre || '');

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

  // Contrato (vigencia + renovación)
  var cc = $('contratoCard'), ci = r.contrato;
  if (ci && (ci.inicio || ci.fin)) {
    cc.hidden = false;
    var estadoTxt = '';
    if (ci.vencido) estadoTxt = '<span class="pend-v">⚠️ Contrato vencido</span>';
    else if (ci.diasRestantes != null) estadoTxt = (ci.porVencer ? '<span class="pend-v">Vence en ' + ci.diasRestantes + ' días</span>' : 'Vence en <strong>' + ci.diasRestantes + ' días</strong>');
    $('contratoInfo').innerHTML = 'Vigencia: <strong>' + (ci.inicio || '—') + '</strong> → <strong>' + (ci.fin || '—') + '</strong>' + (estadoTxt ? '<br>' + estadoTxt : '');
    $('goRenovacion').hidden = !!adminMode || !(ci.porVencer || ci.vencido);
  } else { cc.hidden = true; }

  // Meses
  var cont = $('mesesList'); cont.innerHTML = '';
  if (!r.meses.length) { cont.innerHTML = '<div class="card muted">Aún no hay meses registrados.</div>'; return; }

  r.meses.forEach(function (m, i) {
    var sv = m.servicios, ar = m.arriendo;
    var servBadge = !m.cerrado
      ? '<span class="badge pend">Servicios: por cerrar</span>'
      : (sv.pendiente === 0 ? '<span class="badge ok">Servicios pagos</span>' : payBadge('servicios', 'Servicios', sv.pendiente, m.periodo, adminMode));
    var arrBadge = ar.pendiente === 0 ? '<span class="badge ok">Arriendo pago</span>' : payBadge('arriendo', 'Arriendo', ar.pendiente, m.periodo, adminMode);

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
    // Badges de pendiente = botón para subir comprobante pre-diligenciado
    Array.prototype.forEach.call(el.querySelectorAll('.badge-pay'), function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        pagarPendiente(b.getAttribute('data-con'), b.getAttribute('data-per'), b.getAttribute('data-mon'));
      });
    });
    cont.appendChild(el);
  });
}
// Badge de pendiente: botón de pago (arrendatario) o solo texto (admin)
function payBadge(con, label, monto, periodo, adminMode) {
  if (adminMode) return '<span class="badge pend">' + label + ': ' + cop(monto) + '</span>';
  return '<button class="badge pend badge-pay" data-con="' + con + '" data-per="' + periodo + '" data-mon="' + Math.round(monto) + '">' + label + ': ' + cop(monto) + ' ›</button>';
}
// Abre "Subir comprobante" con concepto, mes y monto ya llenos
function pagarPendiente(concepto, periodo, monto) {
  llenarPeriodos();
  $('pagoConcepto').value = concepto;
  $('pagoPeriodo').value = periodo;
  $('pagoMonto').value = Math.round(Number(monto) || 0);
  msg('pagoMsg', '');
  $('fComprobante').value = ''; $('fComprobante')._data = null; $('pComprobante').innerHTML = '';
  show('viewPago');
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
$('goRenovacion').addEventListener('click', function () {
  if (!confirm('¿Enviar una solicitud de renovación de contrato al administrador?')) return;
  loader(true, 'Enviando solicitud…');
  api('renovacion', { token: state.token }).then(function (r) {
    loader(false);
    alert(r.ok ? '✅ Solicitud enviada. El administrador te contactará pronto.' : (r.error || 'Error'));
  });
});
$('lecturaBack').addEventListener('click', function () { show('viewDash'); });
$('pagoBack').addEventListener('click', function () { show('viewDash'); });
$('dashBackAdmin').addEventListener('click', function () { show('viewAdmin'); });

// ── PANEL ADMIN ───────────────────────────────────────────────
function cargarAdmin() {
  loader(true, 'Cargando panel…');
  api('estadoAdmin', { token: state.token }).then(function (r) {
    loader(false);
    if (!r.ok) {
      if (/sesion/i.test(r.error || '')) { $('logoutBtn').click(); }
      alert(r.error || 'Error'); return;
    }
    state.admin = r;
    renderAdmin(r);
    show('viewAdmin');
  });
}

function barRow(label, valor, max, cls, fmt) {
  var pct = max > 0 ? Math.round(valor * 100 / max) : 0;
  var txt = fmt ? fmt(valor) : cop(valor);
  return '<div class="bar-row"><div class="bar-top"><span class="bk">' + label + '</span><span class="bv">' + txt + '</span></div>' +
    '<div class="bar-track"><div class="bar-fill ' + (cls || '') + '" style="width:' + pct + '%"></div></div></div>';
}

function renderAdmin(r) {
  $('aServ').textContent = cop(r.totales.servicios);
  $('aArr').textContent = cop(r.totales.arriendo);
  $('aTotal').textContent = cop(r.totales.recaudarTotal);

  // Gráfica: pendiente por apartamento (serv + arriendo)
  var maxPend = 0;
  r.apts.forEach(function (e) { maxPend = Math.max(maxPend, e.pendientes.servicios + e.pendientes.arriendo); });
  var chartP = r.apts.map(function (e) {
    var tot = e.pendientes.servicios + e.pendientes.arriendo;
    return barRow('Apto ' + e.key.slice(-1) + ' · ' + firstName(e.nombre), tot, maxPend, tot > 0 ? 'pend' : '');
  }).join('');
  $('chartPend').innerHTML = chartP || '<div class="chart-empty">Sin datos</div>';

  // Gráfica: recibos del mes actual (por servicio, sumando los 3 apts)
  var acc = { luz: 0, gas: 0, agua: 0, otros: 0 }, periodoMes = '';
  r.apts.forEach(function (e) {
    if (!e.mesActual) return;
    periodoMes = e.mesActual.periodo;
    var d = e.mesActual.servicios.detalle;
    acc.luz += d.luz || 0; acc.gas += d.gas || 0; acc.agua += d.agua || 0;
    acc.otros += (d.aseo || 0) + (d.alcant || 0);
  });
  var maxMes = Math.max(acc.luz, acc.gas, acc.agua, acc.otros);
  var tituloMes = periodoMes ? '<div class="muted" style="font-size:12px;margin-bottom:10px;text-transform:capitalize">' + periodoMes + '</div>' : '';
  var chartM = (maxMes > 0) ? (tituloMes +
    barRow('⚡ Luz', acc.luz, maxMes, 'luz') +
    barRow('🔥 Gas', acc.gas, maxMes, 'gas') +
    barRow('💧 Agua', acc.agua, maxMes, 'agua') +
    barRow('🧹 Aseo + Alcant.', acc.otros, maxMes, 'otros')
  ) : '<div class="chart-empty">El mes actual aún no tiene recibos cerrados</div>';
  $('chartMes').innerHTML = chartM;

  // Tabla de contratos (vigencia / vencimiento)
  $('contratosTabla').innerHTML =
    '<table class="ctab"><thead><tr><th>Apto</th><th>Arrendatario</th><th>Inicio</th><th>Vence</th><th>Estado</th></tr></thead><tbody>' +
    r.apts.map(function (e) {
      var ci = e.contrato || {};
      var est;
      if (ci.vencido) est = '<span class="tag vencido">Vencido' + (ci.diasRestantes != null ? ' · hace ' + Math.abs(ci.diasRestantes) + 'd' : '') + '</span>';
      else if (ci.porVencer) est = '<span class="tag porvencer">Vence en ' + ci.diasRestantes + 'd</span>';
      else if (ci.diasRestantes != null) est = '<span class="tag vigente">Vigente · ' + ci.diasRestantes + 'd</span>';
      else est = '<span class="tag">—</span>';
      return '<tr><td><strong>' + e.key.slice(-1) + '</strong></td><td>' + firstName(e.nombre) + '</td><td>' + (ci.inicio || '—') + '</td><td>' + (ci.fin || '—') + '</td><td>' + est + '</td></tr>';
    }).join('') + '</tbody></table>';

  // Selector de apartamentos (estado de cuenta, solo lectura)
  $('aptSelector').innerHTML = r.apts.map(function (e) {
    var tot = e.pendientes.servicios + e.pendientes.arriendo;
    var cls = tot > 0 ? 'pend' : 'ok';
    var txt = tot > 0 ? cop(tot) : 'Al día';
    var ci = e.contrato || {};
    var vence = ci.fin ? ('<div class="s' + (ci.porVencer ? ' warn' : '') + '">Vence ' + ci.fin + '</div>') : '';
    return '<div class="apt-btn" data-apt="' + e.key + '">' +
      '<div class="n">Apto ' + e.key.slice(-1) + '</div>' +
      '<div class="s">' + firstName(e.nombre) + '</div>' +
      '<div class="p ' + cls + '">' + txt + '</div>' + vence + '</div>';
  }).join('');
  Array.prototype.forEach.call(document.querySelectorAll('#aptSelector .apt-btn'), function (btn) {
    btn.addEventListener('click', function () { verAptAdmin(btn.getAttribute('data-apt')); });
  });

  // Selector de impersonación (ver como el arrendatario, con acciones)
  $('imperSelector').innerHTML = r.apts.map(function (e) {
    return '<div class="apt-btn imper" data-apt="' + e.key + '">' +
      '<div class="n">👤 Apto ' + e.key.slice(-1) + '</div>' +
      '<div class="s">' + firstName(e.nombre) + '</div>' +
      '<div class="p">Ver como →</div></div>';
  }).join('');
  Array.prototype.forEach.call(document.querySelectorAll('#imperSelector .apt-btn'), function (btn) {
    btn.addEventListener('click', function () { impersonar(btn.getAttribute('data-apt')); });
  });

  $('goConciliar').hidden = !r.conciliar;
}

// ── IMPERSONACIÓN ─────────────────────────────────────────────
function impersonar(aptKey) {
  var adminTok = state.token, adminNombre = state.nombre, adminConc = state.conciliar;
  loader(true, 'Entrando como arrendatario…');
  api('impersonar', { token: adminTok, apt: aptKey }).then(function (r) {
    loader(false);
    if (!r.ok) { alert(r.error || 'Error'); return; }
    state._adminToken = adminTok; state._adminNombre = adminNombre; state._adminConciliar = adminConc;
    state.token = r.token; state.nombre = r.nombre; state.apt = r.apt;
    state.role = 'tenant'; state.impersonating = true;
    $('imperName').textContent = firstName(r.nombre) + ' · ' + r.apt;
    $('imperBanner').hidden = false;
    $('userLine').textContent = firstName(r.nombre) + ' · ' + r.apt;
    cargarEstado();
  });
}
$('imperBack').addEventListener('click', function () {
  state.token = state._adminToken; state.nombre = state._adminNombre;
  state.conciliar = state._adminConciliar; state.role = 'admin'; state.impersonating = false;
  $('imperBanner').hidden = true;
  $('userLine').textContent = firstName(state.nombre) + ' · Admin';
  cargarAdmin();
});

function firstName(n) { return String(n || '').split(/[ /]/)[0]; }

function verAptAdmin(aptKey) {
  var e = (state.admin.apts || []).filter(function (x) { return x.key === aptKey; })[0];
  if (!e) return;
  e.cuentaPago = state.admin.cuentaPago;
  renderDash(e, true);
  show('viewDash');
}

// ── CONCILIACIÓN ──────────────────────────────────────────────
$('goConciliar').addEventListener('click', function () {
  msg('conciliarMsg', ''); $('conciliarResultados').innerHTML = '';
  show('viewConciliar');
});
$('conciliarBack').addEventListener('click', function () { show('viewAdmin'); });

// Leer archivo (PDF/imagen) a dataURL sin redimensionar
function fileToDataURL(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function (ev) { resolve(ev.target.result); };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}
$('fExtracto').addEventListener('change', function () {
  var f = this.files && this.files[0];
  if (!f) { this._data = null; $('pExtracto').innerHTML = ''; return; }
  var self = this;
  $('pExtracto').innerHTML = '<span class="muted">Leyendo archivo…</span>';
  fileToDataURL(f).then(function (d) { self._data = d; $('pExtracto').innerHTML = '<span class="muted">📎 ' + f.name + '</span>'; })
    .catch(function () { self._data = null; $('pExtracto').innerHTML = '<span class="msg err">No se pudo leer el archivo.</span>'; });
});

$('enviarConciliar').addEventListener('click', function () {
  var texto = $('extractoTexto').value.trim();
  var foto = $('fExtracto')._data || '';
  if (!texto && !foto) { msg('conciliarMsg', 'Pega el texto del extracto o adjunta el archivo.', 'err'); return; }
  loader(true, 'Analizando extracto…');
  api('conciliarExtracto', { token: state.token, texto: texto, foto: foto }).then(function (r) {
    loader(false);
    if (!r.ok) { msg('conciliarMsg', r.error, 'err'); return; }
    renderConciliacion(r);
  });
});

function renderConciliacion(r) {
  var cont = $('conciliarResultados');
  var guardado = r.guardado ? '<p class="msg ok">📎 Extracto guardado en Drive.</p>' : '';
  if (!r.matches || !r.matches.length) {
    msg('conciliarMsg', r.resumen || 'No encontré montos que coincidan con arriendos o servicios pendientes.', '');
    cont.innerHTML = guardado;
    return;
  }
  msg('conciliarMsg', 'Encontré ' + r.matches.length + ' posible(s) coincidencia(s). Revisa y registra las correctas.', 'ok');
  // Meses disponibles por apt para el selector de periodo
  var mesesPorApt = {};
  (state.admin.apts || []).forEach(function (e) { mesesPorApt[e.key] = e.meses.map(function (m) { return m.periodo; }); });

  cont.innerHTML = guardado + r.matches.map(function (m, i) {
    var meses = mesesPorApt[m.apt] || [];
    var optMeses = meses.map(function (p) { return '<option' + (p === m.periodo ? ' selected' : '') + '>' + p + '</option>'; }).join('');
    var fecha = m.fecha ? ' · ' + m.fecha : '';
    return '<div class="match" id="match' + i + '">' +
      '<div class="match-head"><div><div class="match-monto">' + cop(m.monto) + '</div>' +
      '<div class="match-apt">Apto ' + m.apt.slice(-1) + ' · ' + firstName(m.nombre) + ' · ' + m.concepto + fecha + '</div></div></div>' +
      '<div class="match-linea">' + (m.linea || '') + '</div>' +
      '<div class="match-controls">' +
        '<div><label>Concepto</label><select id="mc' + i + '">' +
          '<option value="arriendo"' + (m.concepto === 'arriendo' ? ' selected' : '') + '>Arriendo</option>' +
          '<option value="servicios"' + (m.concepto === 'servicios' ? ' selected' : '') + '>Servicios</option>' +
        '</select></div>' +
        '<div><label>Mes</label><select id="mp' + i + '">' + optMeses + '</select></div>' +
        '<button class="mini-btn" id="mb' + i + '">Registrar</button>' +
      '</div></div>';
  }).join('');

  r.matches.forEach(function (m, i) {
    $('mb' + i).addEventListener('click', function () {
      var concepto = $('mc' + i).value, periodo = $('mp' + i).value;
      if (!periodo) { alert('Elige el mes.'); return; }
      this.disabled = true; this.textContent = '…';
      var self = this;
      api('registrarPagoAdmin', { token: state.token, apt: m.apt, concepto: concepto, periodo: periodo, monto: m.monto, nota: 'Conciliación extracto ' + (m.fecha || '') }).then(function (res) {
        if (!res.ok) { self.disabled = false; self.textContent = 'Registrar'; alert(res.error || 'Error'); return; }
        $('match' + i).classList.add('done'); self.textContent = '✓ Registrado';
        // refrescar datos del panel en segundo plano
        api('estadoAdmin', { token: state.token }).then(function (a) { if (a.ok) state.admin = a; });
      });
    });
  });
}

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
    if (s && s.token) {
      state.token = s.token; state.nombre = s.nombre; state.apt = s.apt;
      state.role = s.role || 'tenant'; state.conciliar = !!s.conciliar;
      iniciarSesion(); return;
    }
  } catch (e) {}
  show('viewLogin');
})();
