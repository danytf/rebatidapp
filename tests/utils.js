// Utilidades compartidas por las pruebas.
const { test: base, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const URL_APP = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

// A partir de 960 px la app muestra la barra lateral de entidades; por debajo,
// la fila deslizable de filtros. Hasta 600 px las acciones de la cabecera
// (Ensayo, Añadir, Modificar) y Favoritos pasan a la barra inferior.
const esEscritorio = page => page.viewportSize().width >= 960;
const esMovil = page => page.viewportSize().width <= 600;

// Misma normalización que usa la app al buscar (minúsculas y sin tildes),
// escrita aquí aparte para que la prueba no dependa del código que prueba.
const normalizar = t => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Todas las pruebas parten de un almacenamiento limpio y fallan si la página
// lanza cualquier error de JavaScript.
const test = base.extend({
  erroresJS: [async ({ page }, use) => {
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
    await use(errores);
    expect(errores, 'errores de JavaScript en la página').toEqual([]);
  }, { auto: true }]
});

async function abrirApp(page) {
  await page.goto(URL_APP);
  await expect(page.locator('#results .statsbar')).toBeVisible();
}

// Datos de las fichas leídos directamente del JSON del HTML, con las variables
// {{...}} sustituidas igual que en pantalla.
async function datos(page) {
  return page.evaluate(() => {
    const vars = JSON.parse(document.getElementById('obj-vars').textContent);
    const r = t => (t || '').replace(/\{\{([^}]+)\}\}/g, (m, k) => vars['{{' + k + '}}'] || m);
    return JSON.parse(document.getElementById('obj-data').textContent).map(f => {
      const terr = (f.chuletaTerritorial || []).map(x => [x.region, x.texto, x.apoyo || '', (x.municion || []).join(' ')].join(' ')).join(' ');
      return { id: f.id, ongs: f.ongs, cat: f.cat, freq: f.freq, diff: f.diff, q: f.q, texto: [f.q, r(f.a), r(f.short), r(f.tip), terr].join(' ') };
    });
  });
}

// Número que muestra la barra de recuento ("31 objeciones", "4 objeciones encontradas").
async function recuento(page) {
  const t = await page.locator('#results .statsbar').textContent();
  return parseInt(t, 10);
}

async function buscar(page, texto) {
  await page.fill('#qinput', texto);
  // la búsqueda espera 180 ms a que se deje de teclear
  await page.waitForTimeout(350);
}

async function elegirEntidad(page, id) {
  await page.click(esEscritorio(page) ? `#rbSidebar .rb-sb-btn[data-oid="${id}"]` : `#ongFilt .ctag[data-oid="${id}"]`);
}

// Pulsa una acción de la cabecera; en móvil Ensayo, Añadir y Modificar solo
// están en la barra inferior.
const EN_BARRA_INFERIOR = { '#ensayobtn': 'ensayo', '#fab-nueva': 'nueva', '#fab-modificar': 'modificar' };
function botonAccion(page, boton) {
  return esMovil(page) && EN_BARRA_INFERIOR[boton] ? `#bnav [data-nav="${EN_BARRA_INFERIOR[boton]}"]` : boton;
}
async function abrirAccion(page, boton) {
  await page.click(botonAccion(page, boton));
}

module.exports = { test, expect, URL_APP, esEscritorio, esMovil, normalizar, abrirApp, datos, recuento, buscar, elegirEntidad, botonAccion, abrirAccion };
