/**
 * Mi Planilla Login - Dry Run Test
 *
 * Prueba el flujo completo de login SIN realizar acciones destructivas.
 *
 * Credenciales de prueba:
 * - Usuario: cc1047484978
 * - Password: Ulecolombia123
 *
 * Flujo:
 * 1. Ir a portal de independientes
 * 2. Ingresar tipo documento, número, password
 * 3. Click "Entrar"
 * 4. Verificar redirección a dashboard
 */

import { BrowserManager } from '../src/bots/utils/browser';

const MIPLANILLA_URLS = {
  portal: 'https://independientes2.miplanilla.com/PublicoIndependientes/Publico/IndexIndependientes',
  dashboard: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Principal',
};

// Credenciales de prueba
const TEST_CREDENTIALS = {
  tipoDocumento: 'CC',
  documento: '1047484978',
  password: 'Ulecolombia123',
  // El campo usuario espera: TipoDoc + Numero (sin espacio)
  get usuario() {
    return `${this.tipoDocumento}${this.documento}`;
  },
};

async function testMiPlanillaLogin() {
  console.log(`
═══════════════════════════════════════════════════════════════
   MI PLANILLA LOGIN - DRY RUN TEST
═══════════════════════════════════════════════════════════════

Este script probará el flujo de login.
Usuario: CC${TEST_CREDENTIALS.documento}

`);

  const browserManager = new BrowserManager({
    headless: false,
    downloadsPath: './downloads/test-miplanilla-login',
  });

  try {
    await browserManager.launch();
    const page = await browserManager.newPage();

    // ═══════════════════════════════════════════════════════════════
    // PASO 1: Navegar al portal de independientes
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 1] Navegando al portal de independientes...');

    await page.goto(MIPLANILLA_URLS.portal, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Esperar un poco más para que cargue completamente
    await page.waitForTimeout(3000);

    await browserManager.takeScreenshot(page, 'login-01-portal');
    console.log('✓ Portal cargado');

    // ═══════════════════════════════════════════════════════════════
    // PASO 2: Cerrar popup si existe
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 2] Verificando popup...');

    try {
      // Buscar botón de cerrar popup
      const closeButtons = await page.$$('button.close, .modal .close, [aria-label="Close"], button[class*="close"]');
      for (const btn of closeButtons) {
        const isVisible = await btn.boundingBox();
        if (isVisible) {
          await btn.click();
          console.log('  ✓ Popup cerrado');
          await page.waitForTimeout(500);
          break;
        }
      }
    } catch {
      console.log('  → No hay popup visible');
    }

    await browserManager.takeScreenshot(page, 'login-02-after-popup');

    // ═══════════════════════════════════════════════════════════════
    // PASO 3: Identificar formulario de login
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 3] Identificando formulario de login...');

    // Debug: listar todos los inputs visibles
    const inputs = await page.$$eval('input:not([type="hidden"])', (els) =>
      els.map(el => ({
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        className: el.className,
      }))
    );
    console.log('  [DEBUG] Inputs encontrados:', JSON.stringify(inputs, null, 2));

    // Debug: listar selects
    const selects = await page.$$eval('select', (els) =>
      els.map(el => ({
        name: el.name,
        id: el.id,
        className: el.className,
        options: Array.from(el.options).slice(0, 5).map(o => ({ value: o.value, text: o.text })),
      }))
    );
    console.log('  [DEBUG] Selects encontrados:', JSON.stringify(selects, null, 2));

    await browserManager.takeScreenshot(page, 'login-03-form-analysis');

    // ═══════════════════════════════════════════════════════════════
    // PASO 4: Llenar usuario (CC + documento)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 4] Ingresando usuario...');

    // Usar selector directo: #usuario
    const usuarioInput = await page.$('#usuario');
    if (usuarioInput) {
      await usuarioInput.click({ clickCount: 3 });
      await page.keyboard.type(TEST_CREDENTIALS.usuario, { delay: 50 });
      console.log(`  ✓ Usuario: ${TEST_CREDENTIALS.usuario}`);
    } else {
      console.log('  ✗ No se encontró #usuario');
    }

    await page.waitForTimeout(300);
    await browserManager.takeScreenshot(page, 'login-04-usuario');

    // ═══════════════════════════════════════════════════════════════
    // PASO 5: Ingresar contraseña
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 5] Ingresando contraseña...');

    // Usar selector directo: #clave
    const claveInput = await page.$('#clave');
    if (claveInput) {
      await claveInput.click({ clickCount: 3 });
      await page.keyboard.type(TEST_CREDENTIALS.password, { delay: 50 });
      console.log('  ✓ Contraseña ingresada');
    } else {
      console.log('  ✗ No se encontró #clave');
    }

    await page.waitForTimeout(300);
    await browserManager.takeScreenshot(page, 'login-05-password');

    // ═══════════════════════════════════════════════════════════════
    // PASO 6: Click en botón "Entrar"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 6] Click en botón Entrar...');

    // Usar selector específico: button.btn.btn-primary.button-cta
    const entrarBtn = await page.$('button.btn.btn-primary.button-cta');
    if (entrarBtn) {
      const text = await entrarBtn.evaluate(el => el.textContent?.trim());
      console.log(`  → Botón encontrado: "${text}"`);
      await entrarBtn.click();
      console.log('  ✓ Click en Entrar');
    } else {
      // Fallback: buscar por texto
      const allButtons = await page.$$('button');
      for (const btn of allButtons) {
        const text = await btn.evaluate(el => el.textContent?.trim() || '');
        if (text.toLowerCase() === 'entrar') {
          await btn.click();
          console.log('  ✓ Click en Entrar (por texto)');
          break;
        }
      }
    }

    await browserManager.takeScreenshot(page, 'login-06-before-submit');

    // ═══════════════════════════════════════════════════════════════
    // PASO 7: Esperar redirección y verificar login
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 7] Esperando respuesta del login...');

    await page.waitForTimeout(3000);
    await browserManager.takeScreenshot(page, 'login-07-after-submit');

    const currentUrl = page.url();
    console.log(`  → URL actual: ${currentUrl}`);

    // Verificar si llegamos al dashboard
    if (currentUrl.includes('Principal') || currentUrl.includes('Privado') || currentUrl.includes('Dashboard')) {
      console.log('  ✓ ¡LOGIN EXITOSO! Redirigido al dashboard');
      await browserManager.takeScreenshot(page, 'login-08-dashboard-success');
    } else if (currentUrl.includes('error') || currentUrl.includes('Error')) {
      console.log('  ✗ Error en login');

      // Capturar mensaje de error
      const errorMsg = await page.evaluate(() => {
        const errorEl = document.querySelector('.alert-danger, .error, [class*="error"], .mensaje-error');
        return errorEl?.textContent?.trim() || 'Error desconocido';
      });
      console.log(`  → Mensaje: ${errorMsg}`);
    } else {
      console.log('  → Verificando estado de la página...');

      // Verificar si hay mensaje de bienvenida o menú de usuario
      const isLoggedIn = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return bodyText.includes('bienvenido') ||
               bodyText.includes('cerrar sesión') ||
               bodyText.includes('mi cuenta') ||
               bodyText.includes('generar planilla');
      });

      if (isLoggedIn) {
        console.log('  ✓ Login exitoso (detectado por contenido)');
      } else {
        console.log('  ? Estado de login indeterminado');
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 8: Explorar dashboard (si login exitoso)
    // ═══════════════════════════════════════════════════════════════
    if (currentUrl.includes('Principal') || currentUrl.includes('Privado')) {
      console.log('\n[PASO 9] Explorando dashboard...');

      // Capturar elementos del dashboard
      const dashboardElements = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a')).map(a => ({
          text: a.textContent?.trim(),
          href: a.href,
        })).filter(l => l.text && l.text.length > 0);

        const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.textContent?.trim(),
          className: b.className,
        })).filter(b => b.text && b.text.length > 0);

        return { links: links.slice(0, 20), buttons: buttons.slice(0, 10) };
      });

      console.log('  [DEBUG] Links del dashboard:', JSON.stringify(dashboardElements.links, null, 2));
      console.log('  [DEBUG] Botones del dashboard:', JSON.stringify(dashboardElements.buttons, null, 2));

      await browserManager.takeScreenshot(page, 'login-09-dashboard-elements');
    }

    console.log(`
═══════════════════════════════════════════════════════════════
   ✅ DRY RUN COMPLETADO
═══════════════════════════════════════════════════════════════

Revisa los screenshots en: ./screenshots/

Esperando 30 segundos para inspección visual...
(Puedes cerrar el navegador manualmente o esperar)
`);

    // Esperar para inspección manual
    await page.waitForTimeout(30000);

    console.log('\n✓ Cerrando navegador...');
    await browserManager.close();

  } catch (error) {
    console.error('\n✗ Error durante el test:', error);
    await browserManager.close();
    process.exit(1);
  }
}

// Ejecutar
testMiPlanillaLogin().catch(console.error);
