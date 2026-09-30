// Pruebas funcionales de RebatidApp. Cada prueba corre en 4 tamaños de pantalla
// (ver playwright.config.js). Los números esperados se calculan a partir de los
// datos del propio HTML, así que las pruebas no se rompen al añadir fichas.
const { test, expect, URL_APP, esEscritorio, esMovil, normalizar, abrirApp, datos, recuento, buscar, elegirEntidad, botonAccion, abrirAccion } = require('./utils');

test.beforeEach(async ({ page }) => { await abrirApp(page); });

// 1 ─────────────────────────────────────────────────────────────────────────
test.describe('Carga', () => {
  test('carga sin errores y muestra todas las fichas', async ({ page }) => {
    const d = await datos(page);
    expect(await recuento(page)).toBe(d.length);
    await expect(page.locator('h1')).toHaveText('Banco de objeciones');
    await expect(page.locator('#results .ocard')).toHaveCount(d.length);
    // el fixture erroresJS comprueba al final que no hubo errores de JavaScript
  });
});

// 2-4 ───────────────────────────────────────────────────────────────────────
test.describe('Buscador', () => {
  test('filtra por texto y vuelve al total al limpiar', async ({ page }) => {
    const d = await datos(page);
    const esperado = d.filter(f => normalizar(f.texto).includes('iban')).length;
    expect(esperado).toBeGreaterThan(0);
    await buscar(page, 'IBAN');
    expect(await recuento(page)).toBe(esperado);
    await expect(page.locator('#results .statsbar')).toContainText('encontrada');
    await page.click('#sclr-btn');
    await page.waitForTimeout(300);
    expect(await recuento(page)).toBe(d.length);
    await expect(page.locator('#qinput')).toHaveValue('');
    await expect(page.locator('#qinput')).toBeFocused();
  });

  test('da el mismo resultado con y sin tildes y con mayúsculas', async ({ page }) => {
    const d = await datos(page);
    const esperado = d.filter(f => normalizar(f.texto).includes('desgravacion')).length;
    expect(esperado).toBeGreaterThan(0);
    for (const q of ['desgravación', 'desgravacion', 'DESGRAVACIÓN', 'Desgravacion']) {
      await buscar(page, q);
      expect(await recuento(page), `búsqueda «${q}»`).toBe(esperado);
    }
  });

  test('una búsqueda sin resultados muestra el estado vacío', async ({ page }) => {
    await buscar(page, 'zzqxw no existe');
    await expect(page.locator('#results .empty-t')).toHaveText('Sin resultados');
    await expect(page.locator('#results .ocard')).toHaveCount(0);
    await expect(page.locator('#results-status')).toHaveText(/Sin resultados para «zzqxw no existe»/);
  });
});

// 5-9 ───────────────────────────────────────────────────────────────────────
test.describe('Filtros', () => {
  test('por ONG: muestra solo las fichas de esa entidad y se recuerda al recargar', async ({ page }) => {
    const d = await datos(page);
    for (const ong of ['AECC', 'WWF', 'General']) {
      await elegirEntidad(page, ong);
      const esperado = d.filter(f => f.ongs.includes(ong)).length;
      expect(await recuento(page), ong).toBe(esperado);
      // cada tarjeta visible pertenece a esa entidad
      const ids = await page.locator('#results .ocard').evaluateAll(cs => cs.map(c => c.id.slice(3)));
      expect(ids.every(id => d.find(f => f.id === id).ongs.includes(ong)), ong).toBe(true);
    }
    await page.reload();
    await expect(page.locator('#results .statsbar')).toBeVisible();
    expect(await recuento(page)).toBe(d.filter(f => f.ongs.includes('General')).length);
    await elegirEntidad(page, 'all');
    expect(await recuento(page)).toBe(d.length);
  });

  test('por categoría: la lista se agrupa en secciones desplegables coherentes', async ({ page }) => {
    // La app no tiene un filtro de categoría: agrupa por categoría en secciones.
    const d = await datos(page);
    const cats = [...new Set(d.map(f => f.cat))];
    const secciones = page.locator('#results .cat-section');
    await expect(secciones).toHaveCount(cats.length);
    for (const cat of cats) {
      const sec = page.locator(`#results .cat-section[data-cat="${cat}"]`);
      await expect(sec.locator('.ocard')).toHaveCount(d.filter(f => f.cat === cat).length);
    }
    // Plegadas al abrir; al pulsar la cabecera se despliega y se vuelve a plegar
    const cab = secciones.first().locator('.cat-section-hdr');
    await expect(cab).toHaveAttribute('aria-expanded', 'false');
    await cab.click();
    await expect(cab).toHaveAttribute('aria-expanded', 'true');
    await expect(secciones.first()).not.toHaveClass(/collapsed/);
    await cab.click();
    await expect(cab).toHaveAttribute('aria-expanded', 'false');
  });

  test('por frecuencia', async () => {
    test.skip(true, 'La app no tiene filtro por frecuencia: la frecuencia solo se muestra con barras y texto en cada tarjeta.');
  });

  test('por dificultad (disponible en el Modo ensayo)', async ({ page }) => {
    // La vista principal no filtra por dificultad; el Modo ensayo sí.
    const d = await datos(page);
    await abrirAccion(page, '#ensayobtn');
    await page.click('#ensayo [data-cfg-ong="AECC"]');
    for (const [v, nombre] of [[1, 'Fácil'], [2, 'Media'], [3, 'Difícil']]) {
      await page.click(`#ensayo [data-cfg-diff="${v}"]`);
      const esperado = d.filter(f => f.ongs.includes('AECC') && f.diff === v).length;
      await expect(page.locator('#ensayo .fc-cfg-count')).toContainText(esperado ? new RegExp(`^\\s*${esperado} cartas? en esta sesión`) : 'No hay cartas', { useInnerText: true });
      await expect(page.locator(`#ensayo [data-cfg-diff="${v}"]`)).toHaveAttribute('aria-pressed', 'true');
      test.info().annotations.push({ type: 'dificultad', description: `AECC ${nombre}: ${esperado}` });
    }
  });

  test('combinación: entidad + búsqueda, y favoritos + búsqueda', async ({ page }) => {
    const d = await datos(page);
    await elegirEntidad(page, 'CR');
    await buscar(page, 'dana');
    const esperado = d.filter(f => f.ongs.includes('CR') && normalizar(f.texto).includes('dana')).length;
    expect(esperado).toBeGreaterThan(0);
    expect(await recuento(page)).toBe(esperado);
    await expect(page.locator('#results-status')).toHaveText(new RegExp(`^${esperado} objeci\\w+ para «dana» de CR$`));
    // Una búsqueda que existe en otra entidad no da resultados dentro de CR
    await buscar(page, 'lince');
    await expect(page.locator('#results .empty-t')).toHaveText('Sin resultados');
  });
});

// 10 ────────────────────────────────────────────────────────────────────────
// Favoritos está en la barra inferior en móvil, en la fila de filtros en tablet
// vertical y en la barra lateral desde 960 px
const selFavoritos = page => esEscritorio(page) ? '#rbSidebar .rb-sb-btn[data-fav]'
  : esMovil(page) ? '#bnav [data-nav="fav"]' : '#ongFilt .ctag-fav';
// Contador dentro de ese botón (no existe o está oculto si no hay favoritos)
const contadorFavoritos = page => page.locator(selFavoritos(page) + ' ' + (esMovil(page) ? '.bnav-count' : '.ctag-count'));
// La barra inferior marca la vista activa con aria-current; los filtros, con aria-pressed
const expectFavoritosActivo = page => esMovil(page)
  ? expect(page.locator(selFavoritos(page))).toHaveAttribute('aria-current', 'page')
  : expect(page.locator(selFavoritos(page))).toHaveAttribute('aria-pressed', 'true');

test.describe('Favoritos', () => {
  const filtroFavoritos = page => page.locator(selFavoritos(page));

  test('marcar, persistir al recargar, filtrar y desmarcar', async ({ page }) => {
    await page.locator('.cat-section-hdr').first().click();
    const tarjeta = page.locator('#results .ocard').first();
    const id = (await tarjeta.getAttribute('id')).slice(3);
    const estrella = tarjeta.locator('.ocard-fav');
    await estrella.click();
    await expect(estrella).toHaveAttribute('aria-pressed', 'true');
    await expect(tarjeta).not.toHaveClass(/open/); // marcar no despliega la tarjeta
    // el contador del filtro de Favoritos se actualiza al momento
    await expect(contadorFavoritos(page)).toHaveText('1');

    await page.reload();
    await expect(page.locator(`#oc-${id} .ocard-fav`)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wob_favs') || '{}'))).toHaveProperty(id);

    // Filtro de favoritos
    const filtro = filtroFavoritos(page);
    await expect(filtro, 'el filtro de Favoritos debe estar accesible en este tamaño').toBeVisible();
    await filtro.click();
    await expectFavoritosActivo(page);
    await expect(page.locator('#results .ocard')).toHaveCount(1);
    await expect(page.locator('#results-status')).toHaveText('1 favorito');

    // Desmarcar desde la lista de favoritos: la tarjeta sale y queda el estado vacío
    await page.locator(`#oc-${id} .ocard-fav`).click();
    await expect(page.locator('#results .empty-t')).toHaveText('Aún no tienes favoritos');
    await page.reload();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wob_favs') || '{}'))).not.toHaveProperty(id);
  });
});

test.describe('Favoritos guardados de fichas que ya no existen', () => {
  test('no cuentan en el contador ni rompen la app', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('wob_favs', JSON.stringify({ ficha_borrada_123: true })));
    await page.reload();
    await expect(page.locator('#results .statsbar')).toBeVisible();
    await expect(page.locator(selFavoritos(page))).toContainText('Favoritos');
    await expect(contadorFavoritos(page)).toBeHidden(); // sin contador
    // al marcar una ficha real, el contador pasa a 1
    await page.locator('.cat-section-hdr').first().click();
    await page.locator('#results .ocard-fav').first().click();
    await expect(contadorFavoritos(page)).toHaveText('1');
  });
});

// 11 ────────────────────────────────────────────────────────────────────────
test.describe('Estado de lectura', () => {
  test('una tarjeta abierta y cerrada queda marcada como visitada (solo en la sesión)', async ({ page }) => {
    // No hay un botón de "marcar como leído": la app atenúa las tarjetas ya
    // consultadas y ese estado no se guarda al recargar.
    await page.locator('.cat-section-hdr').first().click();
    const tarjeta = page.locator('#results .ocard').first();
    const pregunta = tarjeta.locator('.ocard-toggle');
    await pregunta.click();
    await expect(tarjeta).toHaveClass(/open/);
    await expect(pregunta).toHaveAttribute('aria-expanded', 'true');
    await pregunta.click();
    await expect(tarjeta).toHaveClass(/visited/);
    await page.reload();
    await expect(page.locator('#results .ocard.visited')).toHaveCount(0);
  });

  test('el modo lectura abre la ficha completa y se cierra', async ({ page }) => {
    await page.locator('.cat-section-hdr').first().click();
    const tarjeta = page.locator('#results .ocard').first();
    const q = (await tarjeta.locator('.ocard-toggle').textContent()).trim();
    await tarjeta.locator('.ocard-toggle').click(); // el botón de lectura está dentro de la ficha abierta
    await tarjeta.locator('.ocard-read').click();
    await expect(page.locator('#lectura')).toBeVisible();
    await expect(page.locator('#lectura')).toContainText(q);
    await page.click('#lc-exit-btn');
    await expect(page.locator('#lectura')).toBeHidden();
  });
});

// 12 ────────────────────────────────────────────────────────────────────────
test.describe('Tema', () => {
  test('cambia entre claro y oscuro y se recuerda al recargar', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/light/);
    await abrirAccion(page, '#thbtn');
    await expect(page.locator('body')).not.toHaveClass(/light/);
    await expect(page.locator('#thbtn')).toHaveAttribute('aria-pressed', 'true'); // modo oscuro activo
    await page.reload();
    await expect(page.locator('body')).not.toHaveClass(/light/);
    await abrirAccion(page, '#thbtn');
    await expect(page.locator('body')).toHaveClass(/light/);
    await expect(page.locator('#thbtn')).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(page.locator('body')).toHaveClass(/light/);
  });
});

// 13 ────────────────────────────────────────────────────────────────────────
test.describe('Modo ensayo', () => {
  test('configurar, recorrer las cartas, ver el resumen y repetir las falladas', async ({ page }) => {
    const d = await datos(page);
    await abrirAccion(page, '#ensayobtn');
    await expect(page.locator('#ensayo')).toBeVisible();
    // sin entidades elegidas se practica con todas
    await expect(page.locator('#ensayo [data-cfg-ong="all"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#ensayo .fc-cfg-count')).toContainText(new RegExp(`^\\s*${d.length} cartas`), { useInnerText: true });
    await expect(page.locator('#cfg-start-btn')).toBeEnabled();

    await page.click('#ensayo [data-cfg-ong="FEC"]');
    await page.click('#ensayo [data-cfg-diff="3"]');
    const n = d.filter(f => f.ongs.includes('FEC') && f.diff === 3).length;
    expect(n).toBeGreaterThan(0);
    await page.click('#cfg-start-btn');

    for (let i = 0; i < n; i++) {
      await expect(page.locator('#ensayo .fc-counter')).toHaveText(`${i + 1} de ${n}`);
      await page.click('#fc-show');
      await page.click(i === 0 ? '#ensayo .fc-eval-btn[data-ev="bad"]' : '#ensayo .fc-eval-btn[data-ev="ok"]');
    }
    await expect(page.locator('#ensayo .fc-end-title')).toHaveText('Sesión completada');
    await expect(page.locator('#ensayo .fc-stat-bad .fc-stat-n')).toHaveText('1');
    const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('wob_stats') || '[]'));
    expect(stats[0]).toMatchObject({ total: n, bad: 1, ok: n - 1 });

    await page.click('#fc-retry');
    await expect(page.locator('#ensayo .fc-counter')).toHaveText('1 de 1');
    await page.click('#fc-exit-btn');
    await expect(page.locator('#ensayo')).toBeHidden();
  });

  test('atajos de teclado: Espacio muestra la respuesta', async ({ page }) => {
    await abrirAccion(page, '#ensayobtn');
    await page.click('#ensayo [data-cfg-ong="AI"]');
    await page.click('#cfg-start-btn');
    await expect(page.locator('#fc-show')).toBeVisible();
    await page.locator('#ensayo .fc-counter').click(); // foco dentro del ensayo, fuera de un botón
    await page.keyboard.press(' ');
    await expect(page.locator('#ensayo .fc-eval-btn')).toHaveCount(3);
  });
});

// 14 ────────────────────────────────────────────────────────────────────────
test.describe('Ventanas', () => {
  test('Añadir rebatida: valida los campos y se cancela', async ({ page }) => {
    await abrirAccion(page, '#fab-nueva');
    await expect(page.locator('#nueva-rebatida')).toBeVisible();
    await page.click('#nr-send-btn');
    await expect(page.locator('#nr-error')).toBeVisible();
    await page.locator('#nr-ong-pills .pill').first().click();
    await expect(page.locator('#nr-ong-pills .pill').first()).toHaveClass(/sel/);
    await page.fill('#nr-pregunta', 'Objeción de prueba');
    await page.click('#nr-exit-btn');
    await expect(page.locator('#nueva-rebatida')).toBeHidden();
  });

  test('Sugerir cambio: al elegir entidad aparece el selector de fichas', async ({ page }) => {
    const d = await datos(page);
    await abrirAccion(page, '#fab-modificar');
    await expect(page.locator('#sugerir-cambio')).toBeVisible();
    await page.click('#sc-send-btn');
    await expect(page.locator('#sc-error')).toBeVisible();
    await page.click('#sc-ong-pills .pill:has-text("WWF")');
    const opciones = page.locator('#sc-ficha-select option:not([value=""])');
    await expect(opciones).toHaveCount(d.filter(f => f.ongs.includes('WWF')).length);
    await page.selectOption('#sc-ficha-select', { index: 1 });
    await expect(page.locator('#sc-preview')).toBeVisible();
    await page.click('#sc-exit-btn');
    await expect(page.locator('#sugerir-cambio')).toBeHidden();
  });

  test('Ayuda se abre y se cierra', async ({ page }) => {
    await abrirAccion(page, '#fab-ayuda');
    await expect(page.locator('#ayuda')).toBeVisible();
    await page.click('#ayuda-exit-btn');
    await expect(page.locator('#ayuda')).toBeHidden();
  });
});

// 15 ────────────────────────────────────────────────────────────────────────
test.describe('Escape', () => {
  test('cierra cada ventana y devuelve el foco', async ({ page }) => {
    for (const [boton, ventana] of [['#ensayobtn', '#ensayo'], ['#fab-nueva', '#nueva-rebatida'], ['#fab-modificar', '#sugerir-cambio'], ['#fab-ayuda', '#ayuda']]) {
      await abrirAccion(page, boton);
      await expect(page.locator(ventana)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(ventana), `Escape en ${ventana}`).toBeHidden();
      await expect(page.locator(botonAccion(page, boton)), `foco tras cerrar ${ventana}`).toBeFocused();
    }

    await page.locator('.cat-section-hdr').first().click();
    await page.locator('#results .ocard-toggle').first().click();
    await page.locator('#results .ocard-read').first().click();
    await expect(page.locator('#lectura')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#lectura')).toBeHidden();
  });
});

// 16 ────────────────────────────────────────────────────────────────────────
test.describe('Teclado', () => {
  test('recorrido básico: saltar al contenido, sección, tarjeta y favorito', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.locator('#qinput')).toBeFocused();

    const cab = page.locator('.cat-section-hdr').first();
    await cab.focus();
    await page.keyboard.press('Enter');
    await expect(cab).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Tab');
    const pregunta = page.locator('#results .ocard-toggle').first();
    await expect(pregunta).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(pregunta).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Tab'); // favorito
    const fav = page.locator('#results .ocard-fav').first();
    await expect(fav).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(fav).toHaveAttribute('aria-pressed', 'true');
  });

  test('los filtros de entidad mantienen el foco al usarse con teclado', async ({ page }) => {
    if (esEscritorio(page)) {
      await page.locator('#rbSidebar .rb-sb-btn[data-oid="FJC"]').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#rbSidebar .rb-sb-btn[data-oid="FJC"]')).toBeFocused();
    } else {
      await page.locator('#ongFilt .ctag[data-oid="FJC"]').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#ongFilt .ctag[data-oid="FJC"]')).toBeFocused();
    }
  });
});

// 17 ────────────────────────────────────────────────────────────────────────
test.describe('Responsive', () => {
  test('sin desplazamiento horizontal y con la navegación adecuada al tamaño', async ({ page }) => {
    const sinScrollH = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await sinScrollH()).toBe(true);
    if (esEscritorio(page)) {
      await expect(page.locator('#rbSidebar')).toBeVisible();
      await expect(page.locator('#ongFilt')).toBeHidden();
    } else {
      await expect(page.locator('#rbSidebar')).toBeHidden();
      await expect(page.locator('#ongFilt')).toBeVisible();
    }
    // Hasta 600 px las acciones van en la barra inferior; por encima, en la cabecera
    if (esMovil(page)) {
      await expect(page.locator('#bnav')).toBeVisible();
      await expect(page.locator('#ensayobtn')).toBeHidden();
    } else {
      await expect(page.locator('#bnav')).toBeHidden();
      await expect(page.locator('#ensayobtn')).toBeVisible();
    }
    // Con una tarjeta y la ayuda abiertas tampoco debe haber scroll horizontal
    await page.locator('.cat-section-hdr').first().click();
    await page.locator('#results .ocard-toggle').first().click();
    expect(await sinScrollH()).toBe(true);
    await abrirAccion(page, '#fab-ayuda');
    expect(await sinScrollH()).toBe(true);
  });

  test('los controles principales tienen un área táctil de al menos 44 px', async ({ page }) => {
    await page.locator('.cat-section-hdr').first().click();
    await page.locator('#results .ocard-toggle').first().click(); // el botón de lectura está dentro de la ficha
    const medidas = await page.evaluate(() => {
      const sel = ['#thbtn', '#fab-ayuda', '#results .ocard-fav', '#results .ocard-read', '#results .ocard-share', '#sclr-btn', '.cat-section-hdr'];
      if (window.innerWidth >= 960) sel.push('#rbSidebar .rb-sb-btn'); else sel.push('#ongFilt .ctag[data-oid]');
      if (window.innerWidth <= 600) sel.push('#bnav .bnav-btn'); else sel.push('#ensayobtn');
      return sel.map(s => {
        const e = document.querySelector(s); if (!e) return { s, w: 0, h: 0 };
        const r = e.getBoundingClientRect(); let w = r.width, h = r.height;
        for (const ps of ['::before', '::after']) {
          const c = getComputedStyle(e, ps);
          if (c.content !== 'none' && c.position === 'absolute') {
            w = Math.max(w, r.width - parseFloat(c.left) - parseFloat(c.right) || w);
            h = Math.max(h, r.height - parseFloat(c.top) - parseFloat(c.bottom) || h);
          }
        }
        return { s, w: Math.round(w), h: Math.round(h) };
      });
    });
    for (const m of medidas) {
      if (m.s === '#sclr-btn' && m.w === 0) continue; // solo aparece con texto en el buscador
      expect(Math.min(m.w, m.h), `${m.s} mide ${m.w}×${m.h}`).toBeGreaterThanOrEqual(44);
    }
  });
});

// 18 ────────────────────────────────────────────────────────────────────────
// Enlace directo a una ficha: index.html#<id> abre esa ficha.
test.describe('Enlace directo', () => {
  // Carga nueva de la página con ese hash (pasar por about:blank evita que el
  // navegador lo trate como un simple cambio de hash sobre la página ya abierta)
  async function entrar(page, hash) {
    await page.goto('about:blank');
    await page.goto(URL_APP + '#' + hash);
    await expect(page.locator('#results .statsbar')).toBeVisible();
  }

  // La ficha está abierta, colocada justo bajo la cabecera y el buscador fijos,
  // y la página no tiene desplazamiento horizontal
  async function expectFichaLocalizada(page, id) {
    const ficha = page.locator(`#oc-${id}`);
    await expect(ficha).toHaveClass(/open/);
    await expect(ficha.locator('.ocard-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(ficha.locator('.ans-short')).toBeVisible();
    await expect.poll(() => page.evaluate(i => {
      const top = document.getElementById('oc-' + i).getBoundingClientRect().top;
      const fijo = document.querySelector('.sbar').getBoundingClientRect().bottom;
      return top >= fijo - 1 && top <= fijo + 24;
    }, id), `la ficha ${id} queda a la vista bajo la cabecera`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  async function expectAppNormal(page) {
    const d = await datos(page);
    expect(await recuento(page)).toBe(d.length);
    await expect(page.locator('#results .ocard.open')).toHaveCount(0);
    await expect(page.locator('#results .cat-section:not(.collapsed)')).toHaveCount(0);
    await expect(page.locator('#results .empty')).toHaveCount(0);
    expect(await page.evaluate(() => window.pageYOffset)).toBe(0);
  }

  test('hash válido: abre la ficha y su sección', async ({ page }) => {
    await entrar(page, 'gen_iban');
    await expectFichaLocalizada(page, 'gen_iban');
    expect(await page.evaluate(() => window.pageYOffset)).toBeGreaterThan(0);
    await expect(page.locator('.cat-section:has(#oc-gen_iban)')).not.toHaveClass(/collapsed/);
    // no se toca el foco ni se abren otras fichas
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await expect(page.locator('#results .ocard.open')).toHaveCount(1);
  });

  test('ficha de una categoría plegada: solo se despliega esa sección', async ({ page }) => {
    const d = await datos(page);
    const ultimaCat = [...new Set(d.map(f => f.cat))].pop(); // la sección más alejada del principio
    const ficha = d.find(f => f.cat === ultimaCat);
    await entrar(page, ficha.id);
    await expectFichaLocalizada(page, ficha.id);
    await expect(page.locator('#results .cat-section:not(.collapsed)')).toHaveCount(1);
    await expect(page.locator(`#results .cat-section[data-cat="${ficha.cat}"] .cat-section-hdr`)).toHaveAttribute('aria-expanded', 'true');
  });

  test('un filtro guardado o activo que oculta la ficha no impide encontrarla', async ({ page }) => {
    const d = await datos(page);
    // Entidad guardada de la sesión anterior que no incluye la ficha
    await page.evaluate(() => sessionStorage.setItem('wob_ong', 'WWF'));
    await entrar(page, 'gen_iban');
    await expectFichaLocalizada(page, 'gen_iban');
    expect(await recuento(page)).toBe(d.length);

    // Favoritos (sin esa ficha) y una búsqueda que no la contiene
    await page.click(esEscritorio(page) ? '#rbSidebar .rb-sb-btn[data-fav]' : esMovil(page) ? '#bnav [data-nav="fav"]' : '#ongFilt .ctag-fav');
    await expect(page.locator('#results .empty-t')).toHaveText('Aún no tienes favoritos');
    await page.evaluate(() => { location.hash = 'wwf14'; });
    await expectFichaLocalizada(page, 'wwf14');

    await elegirEntidad(page, 'AECC');
    await buscar(page, 'zzqxw no existe');
    await expect(page.locator('#results .empty-t')).toHaveText('Sin resultados');
    await page.evaluate(() => { location.hash = 'gen_iban'; });
    await expectFichaLocalizada(page, 'gen_iban');
    await expect(page.locator('#qinput')).toHaveValue('');
  });

  test('una búsqueda o entidad que ya muestra la ficha se conserva', async ({ page }) => {
    const d = await datos(page);
    await elegirEntidad(page, 'WWF');
    await page.evaluate(() => { location.hash = 'wwf14'; });
    await expectFichaLocalizada(page, 'wwf14');
    expect(await recuento(page)).toBe(d.filter(f => f.ongs.includes('WWF')).length);
  });

  test('hash inexistente, con otras mayúsculas o mal codificado: la app se comporta como siempre', async ({ page }) => {
    for (const hash of ['ficha_que_no_existe', 'GEN_IBAN', '%E0%A4%A', '<img src=x onerror=alert(1)>']) {
      await entrar(page, hash);
      await expectAppNormal(page);
    }
    // y sigue funcionando
    await buscar(page, 'IBAN');
    expect(await recuento(page)).toBeGreaterThan(0);
  });

  test('hash vacío: comportamiento normal', async ({ page }) => {
    await entrar(page, '');
    await expectAppNormal(page);
  });

  test('hash codificado: se decodifica antes de comparar', async ({ page }) => {
    await entrar(page, '%67en_iban');
    await expectFichaLocalizada(page, 'gen_iban');
  });

  test('cambio de hash y botón Atrás: se localiza y se resalta la ficha de cada hash', async ({ page }) => {
    await entrar(page, 'gen_iban');
    await expectFichaLocalizada(page, 'gen_iban');
    // con el foco dentro de la lista, pasa a la pregunta de la nueva ficha
    await page.locator('#oc-gen_iban .ocard-toggle').focus();
    // el resaltado se comprueba en el mismo instante del cambio, porque dura poco
    const resaltada = await page.evaluate(() => new Promise(ok => {
      window.addEventListener('hashchange', () => ok(document.getElementById('oc-wwf14').classList.contains('enlazada')), { once: true });
      location.hash = 'wwf14';
    }));
    expect(resaltada).toBe(true);
    await expectFichaLocalizada(page, 'wwf14');
    await expect(page.locator('#oc-wwf14')).not.toHaveClass(/enlazada/, { timeout: 4000 }); // es pasajero
    await expect(page.locator('#oc-wwf14')).toHaveClass(/open/);
    await expect(page.locator('#oc-wwf14 .ocard-toggle')).toBeFocused();
    await page.goBack();
    await expectFichaLocalizada(page, 'gen_iban');
  });

  // Compartir: el botón de la ficha entrega el enlace directo. En pantallas
  // táctiles abre el menú de compartir del sistema; en escritorio copia el enlace.
  // Las dos salidas se sustituyen por dobles para ver qué recibe cada una.
  async function espiarCompartir(page) {
    await page.evaluate(() => {
      window.__compartido = null; window.__copiado = null;
      navigator.share = d => { window.__compartido = d; return Promise.resolve(); };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copiado = t; return Promise.resolve(); } } });
    });
  }
  const tactil = page => page.evaluate(() => window.matchMedia('(pointer:coarse)').matches);

  async function expectEnlaceEntregado(page, id, q) {
    const enlace = URL_APP + '#' + id;
    if (await tactil(page)) {
      await expect.poll(() => page.evaluate(() => window.__compartido)).toEqual({ title: 'Banco de objeciones', text: q, url: enlace });
      expect(await page.evaluate(() => window.__copiado)).toBeNull();
    } else {
      await expect.poll(() => page.evaluate(() => window.__copiado)).toBe(enlace);
      await expect(page.locator('#toast')).toHaveText('Enlace copiado');
      await expect(page.locator('#toast')).toHaveClass(/show/);
    }
  }

  test('compartir desde la ficha entrega su enlace directo, y ese enlace la abre', async ({ page }) => {
    const d = await datos(page);
    await espiarCompartir(page);
    await page.locator('.cat-section-hdr').first().click();
    const tarjeta = page.locator('#results .ocard').first();
    const id = (await tarjeta.getAttribute('id')).slice(3);
    await tarjeta.locator('.ocard-toggle').click();
    await tarjeta.locator('.ocard-share').click();
    await expectEnlaceEntregado(page, id, d.find(f => f.id === id).q);
    // compartir no cierra la ficha ni cambia la dirección de la página
    await expect(tarjeta).toHaveClass(/open/);
    expect(page.url()).toBe(URL_APP);

    await entrar(page, id);
    await expectFichaLocalizada(page, id);
  });

  test('compartir desde el modo lectura', async ({ page }) => {
    const d = await datos(page);
    await espiarCompartir(page);
    await page.locator('.cat-section-hdr').first().click();
    const tarjeta = page.locator('#results .ocard').first();
    const id = (await tarjeta.getAttribute('id')).slice(3);
    await tarjeta.locator('.ocard-toggle').click();
    await tarjeta.locator('.ocard-read').click();
    await page.click('#lectura .lc-share');
    await expectEnlaceEntregado(page, id, d.find(f => f.id === id).q);
    await expect(page.locator('#lectura')).toBeVisible();
  });

  test('sin portapapeles moderno ni menú de compartir, el enlace se copia igualmente', async ({ page }) => {
    await page.evaluate(() => {
      navigator.share = undefined;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      const original = document.execCommand.bind(document);
      document.execCommand = function(orden) {
        if (orden === 'copy') { window.__copiado = document.activeElement.value; return true; }
        return original.apply(null, arguments);
      };
    });
    await page.locator('.cat-section-hdr').first().click();
    const tarjeta = page.locator('#results .ocard').first();
    const id = (await tarjeta.getAttribute('id')).slice(3);
    await tarjeta.locator('.ocard-toggle').click();
    await tarjeta.locator('.ocard-share').click();
    await expect.poll(() => page.evaluate(() => window.__copiado)).toBe(URL_APP + '#' + id);
    await expect(page.locator('#toast')).toHaveText('Enlace copiado');
    await expect(tarjeta.locator('.ocard-share')).toBeFocused(); // el foco vuelve al botón
  });

  test('al recargar se vuelve a la misma ficha', async ({ page }) => {
    await entrar(page, 'gen_iban');
    await expectFichaLocalizada(page, 'gen_iban');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.reload();
    await expect(page.locator('#results .statsbar')).toBeVisible();
    await expectFichaLocalizada(page, 'gen_iban');
  });
});
