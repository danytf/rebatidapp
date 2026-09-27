// Pruebas funcionales de RebatidApp. Cada prueba corre en 4 tamaños de pantalla
// (ver playwright.config.js). Los números esperados se calculan a partir de los
// datos del propio HTML, así que las pruebas no se rompen al añadir fichas.
const { test, expect, esEscritorio, normalizar, abrirApp, datos, recuento, buscar, elegirEntidad, abrirMenu } = require('./utils');

test.beforeEach(async ({ page }) => { await abrirApp(page); });

// 1 ─────────────────────────────────────────────────────────────────────────
test.describe('Carga', () => {
  test('carga sin errores y muestra todas las fichas', async ({ page }) => {
    const d = await datos(page);
    expect(await recuento(page)).toBe(d.length);
    await expect(page.locator('h1')).toHaveText('Banco de Objeciones Wesser');
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
    test.skip(true, 'La app no tiene filtro por frecuencia: la frecuencia solo se muestra como icono (🔥 ⭐ 📌) en cada tarjeta.');
  });

  test('por dificultad (disponible en el Modo ensayo)', async ({ page }) => {
    // La vista principal no filtra por dificultad; el Modo ensayo sí.
    const d = await datos(page);
    await abrirMenu(page, '#ensayobtn');
    await page.click('#ensayo [data-cfg-ong="AECC"]');
    for (const [v, nombre] of [[1, 'Fácil'], [2, 'Media'], [3, 'Difícil']]) {
      await page.click(`#ensayo [data-cfg-diff="${v}"]`);
      const esperado = d.filter(f => f.ongs.includes('AECC') && f.diff === v).length;
      await expect(page.locator('#ensayo .fc-cfg-count')).toContainText(esperado ? `${esperado} cartas` : 'Sin cartas', { useInnerText: true });
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
test.describe('Favoritos', () => {
  const filtroFavoritos = page => esEscritorio(page)
    ? page.locator('#ongFilt .ctag-fav, #rbSidebar [data-fav]').first()
    : page.locator('#ongFilt .ctag-fav');

  test('marcar, persistir al recargar, filtrar y desmarcar', async ({ page }) => {
    // FALLO CONOCIDO: a partir de 960 px el botón "⭐ Favoritos" está dentro de
    // los filtros de móvil, que se ocultan, y la barra lateral no lo incluye.
    // Cuando se arregle, esta prueba avisará de que ya pasa: quitar esta línea.
    test.fail(esEscritorio(page), 'Fallo conocido: sin filtro de Favoritos en pantallas de 960 px o más');
    await page.locator('.cat-section-hdr').first().click();
    const tarjeta = page.locator('#results .ocard').first();
    const id = (await tarjeta.getAttribute('id')).slice(3);
    const estrella = tarjeta.locator('.ocard-fav');
    await estrella.click();
    await expect(estrella).toHaveAttribute('aria-pressed', 'true');
    await expect(tarjeta).not.toHaveClass(/open/); // marcar no despliega la tarjeta

    await page.reload();
    await expect(page.locator(`#oc-${id} .ocard-fav`)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wob_favs') || '{}'))).toHaveProperty(id);

    // Filtro de favoritos
    if (!esEscritorio(page)) await page.click('#ong-toggle-btn');
    const filtro = filtroFavoritos(page);
    await expect(filtro, 'el filtro de Favoritos debe estar accesible en este tamaño').toBeVisible();
    await filtro.click();
    await expect(page.locator('#results .ocard')).toHaveCount(1);
    await expect(page.locator('#results-status')).toHaveText('1 favorito');

    // Desmarcar desde la lista de favoritos: la tarjeta sale y queda el estado vacío
    await page.locator(`#oc-${id} .ocard-fav`).click();
    await expect(page.locator('#results .empty-t')).toHaveText('Aún no tienes favoritos');
    await page.reload();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wob_favs') || '{}'))).not.toHaveProperty(id);
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
    await abrirMenu(page, '#thbtn');
    await expect(page.locator('body')).not.toHaveClass(/light/);
    await expect(page.locator('#thbtn')).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(page.locator('body')).not.toHaveClass(/light/);
    await abrirMenu(page, '#thbtn');
    await expect(page.locator('body')).toHaveClass(/light/);
    await page.reload();
    await expect(page.locator('body')).toHaveClass(/light/);
  });
});

// 13 ────────────────────────────────────────────────────────────────────────
test.describe('Modo ensayo', () => {
  test('configurar, recorrer las cartas, ver el resumen y repetir las falladas', async ({ page }) => {
    const d = await datos(page);
    await abrirMenu(page, '#ensayobtn');
    await expect(page.locator('#ensayo')).toBeVisible();
    await expect(page.locator('#cfg-start-btn')).toBeDisabled(); // sin entidades elegidas

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
    await abrirMenu(page, '#ensayobtn');
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
    await abrirMenu(page, '#fab-nueva');
    await expect(page.locator('#nueva-rebatida')).toBeVisible();
    await page.click('#nr-send-btn');
    await expect(page.locator('#nr-error')).toBeVisible();
    await page.locator('#nr-ong-pills .nr-pill').first().click();
    await expect(page.locator('#nr-ong-pills .nr-pill').first()).toHaveClass(/sel/);
    await page.fill('#nr-pregunta', 'Objeción de prueba');
    await page.click('#nr-exit-btn');
    await expect(page.locator('#nueva-rebatida')).toBeHidden();
  });

  test('Sugerir cambio: al elegir entidad aparece el selector de fichas', async ({ page }) => {
    const d = await datos(page);
    await abrirMenu(page, '#fab-modificar');
    await expect(page.locator('#sugerir-cambio')).toBeVisible();
    await page.click('#sc-send-btn');
    await expect(page.locator('#sc-error')).toBeVisible();
    await page.click('#sc-ong-pills .nr-pill:has-text("WWF")');
    const opciones = page.locator('#sc-ficha-select option:not([value=""])');
    await expect(opciones).toHaveCount(d.filter(f => f.ongs.includes('WWF')).length);
    await page.selectOption('#sc-ficha-select', { index: 1 });
    await expect(page.locator('#sc-preview')).toBeVisible();
    await page.click('#sc-exit-btn');
    await expect(page.locator('#sugerir-cambio')).toBeHidden();
  });

  test('Ayuda se abre y se cierra', async ({ page }) => {
    await abrirMenu(page, '#fab-ayuda');
    await expect(page.locator('#ayuda')).toBeVisible();
    await page.click('#ayuda-exit-btn');
    await expect(page.locator('#ayuda')).toBeHidden();
  });
});

// 15 ────────────────────────────────────────────────────────────────────────
test.describe('Escape', () => {
  test('cierra el menú y cada ventana, y devuelve el foco', async ({ page }) => {
    await page.click('#hdr-menu-btn');
    await expect(page.locator('#hdr-menu')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#hdr-menu')).not.toHaveClass(/open/);
    await expect(page.locator('#hdr-menu-btn')).toBeFocused();

    for (const [boton, ventana] of [['#ensayobtn', '#ensayo'], ['#fab-nueva', '#nueva-rebatida'], ['#fab-modificar', '#sugerir-cambio'], ['#fab-ayuda', '#ayuda']]) {
      await abrirMenu(page, boton);
      await expect(page.locator(ventana)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(ventana), `Escape en ${ventana}`).toBeHidden();
    }

    await page.locator('.cat-section-hdr').first().click();
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

    await page.keyboard.press('Tab'); // lectura
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
      await page.locator('#ong-toggle-btn').focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Shift+Tab'); // el panel se abre encima del botón
      const activo = await page.evaluate(() => !!document.activeElement.closest('#ongFilt'));
      expect(activo).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.locator('#ong-toggle-btn')).toBeFocused();
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
      await expect(page.locator('#ong-toggle-btn')).toBeHidden();
    } else {
      await expect(page.locator('#rbSidebar')).toBeHidden();
      await expect(page.locator('#ong-toggle-btn')).toBeVisible();
    }
    // Con una tarjeta y la ayuda abiertas tampoco debe haber scroll horizontal
    await page.locator('.cat-section-hdr').first().click();
    await page.locator('#results .ocard-toggle').first().click();
    expect(await sinScrollH()).toBe(true);
    await abrirMenu(page, '#fab-ayuda');
    expect(await sinScrollH()).toBe(true);
  });

  test('los controles principales tienen un área táctil de al menos 44 px', async ({ page }) => {
    // FALLO CONOCIDO: las cabeceras de sección miden 40 px de alto. Cuando se
    // arregle, esta prueba avisará de que ya pasa: quitar esta línea.
    test.fail(true, 'Fallo conocido: las cabeceras de sección miden 40 px de alto');
    await page.locator('.cat-section-hdr').first().click();
    const medidas = await page.evaluate(() => {
      const sel = ['#hdr-menu-btn', '#results .ocard-fav', '#results .ocard-read', '#sclr-btn', '.cat-section-hdr'];
      if (window.innerWidth >= 960) sel.push('#rbSidebar .rb-sb-btn'); else sel.push('#ong-toggle-btn');
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
