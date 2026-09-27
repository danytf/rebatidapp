// Pruebas funcionales de RebatidApp con Playwright.
//
//   npm test                  todas las pruebas en los 4 tamaños de pantalla
//   npx playwright test --project=movil-375     solo un tamaño
//
// La app es un único index.html sin servidor: las pruebas la abren con file://.
// Cada prueba se ejecuta en los cuatro tamaños de pantalla que se usan de verdad.
const { defineConfig, devices } = require('@playwright/test');

const escritorio = devices['Desktop Chrome'];

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    ...escritorio,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'movil-375',    use: { viewport: { width: 375,  height: 667  }, hasTouch: true } },
    { name: 'tablet-768',   use: { viewport: { width: 768,  height: 1024 }, hasTouch: true } },
    { name: 'tablet-1024',  use: { viewport: { width: 1024, height: 768  }, hasTouch: true } },
    { name: 'escritorio-1440', use: { viewport: { width: 1440, height: 900 } } }
  ]
});
