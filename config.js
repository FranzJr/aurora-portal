// ============================================================
// config.js — Configuracion del Portal Aurora II
// ============================================================
// Pega aqui la URL de tu Web App de Google Apps Script.
// La obtienes en: Apps Script > Implementar > Nueva implementacion
//   > Aplicacion web > (termina en /exec)
// ============================================================

// NOTA: el endpoint /exec es un punto publico por diseno; cada accion valida
// un correo registrado + token, asi que no expone datos. Ningun dato sensible
// (direccion, nombres, correos, cuenta) vive en el frontend.
window.PORTAL_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwqdx64KGp4cjiFXu9SWokmyn7-AMdEt51PFOOnvHWkAlLpnotPNouW_TzgJiZSqhO5/exec',
};
