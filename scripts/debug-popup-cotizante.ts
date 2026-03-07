/**
 * Debug script to understand what happens in the popup when selecting tipoCotizante
 * This script will pause at key moments so we can inspect the state
 */

import { BrowserManager } from '../src/bots/utils/browser';
import { loginIndependiente } from '../src/bots/soi/auth.bot';
import { prisma } from '../src/db/prisma';
import { decrypt } from '../src/utils/crypto';

async function main() {
  console.log('============================================================');
  console.log('DEBUG: Popup Cotizante SOI');
  console.log('============================================================\n');

  // Get credentials
  const user = await prisma.uleUser.findFirst({
    where: { numeroDocumento: '1047478670' },
  });

  if (!user || !user.soiPassword || !user.soiPasswordIV) {
    throw new Error('Usuario no encontrado o sin credenciales SOI');
  }

  const password = decrypt(user.soiPassword, user.soiPasswordIV);
  console.log(`[1] Cédula: ${user.numeroDocumento}`);

  // Launch browser
  const browserManager = new BrowserManager({ headless: false });
  const { browser, page } = await browserManager.launch();

  try {
    // Login
    console.log('\n[2] Logging in...');
    await loginIndependiente(page, {
      tipoDocumento: 'CC',
      documento: user.numeroDocumento,
      password,
    });
    console.log('    Login exitoso');

    // Get session ID
    const currentUrl = page.url();
    const sessionMatch = currentUrl.match(/nuevoSoiAchColombiaSessionID=([^&]+)/);
    if (!sessionMatch) {
      throw new Error('No se encontró sessionID');
    }
    const sessionId = sessionMatch[1];

    // Navigate to crear planilla
    console.log('\n[3] Navigating to crear planilla...');
    const targetUrl = `https://servicio.nuevosoi.com.co/soi/inicioPlanillaEnLinea.do;nuevoSoiAchColombiaSessionID=${sessionId}`;
    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Select tipo planilla I
    console.log('\n[4] Selecting tipo planilla I-INDEPENDIENTES...');
    await page.select('select[name="tipoPlanilla"]', 'I');
    await page.waitForTimeout(500);

    // Select periodo FEBRERO 2026
    await page.select('#periodoLiquidacionMes', '2');
    await page.select('#periodoLiquidacionAnnio', '2026');
    await page.waitForTimeout(500);

    // Click Siguiente
    console.log('\n[5] Clicking Siguiente (Paso 1 -> Paso 2)...');
    const btnSiguiente = await page.$('#siguiente1, #siguiente2, input[value="Siguiente"]');
    if (btnSiguiente) {
      await btnSiguiente.click();
      await page.waitForTimeout(3000);
    }

    console.log('\n[6] Now on Paso 2. Opening popup...');

    // Execute agregarCotizante()
    await page.evaluate(() => {
      if (typeof (window as any).agregarCotizante === 'function') {
        (window as any).agregarCotizante();
      }
    });

    // Wait for popup
    await page.waitForTimeout(3000);

    // Find popup
    const pages = await browser.pages();
    let popupPage = null;
    for (const p of pages) {
      if (p.url().includes('ingresarCotizante')) {
        popupPage = p;
        break;
      }
    }

    if (!popupPage) {
      console.log('    ❌ Popup not found!');
      console.log('    Pages:', pages.map(p => p.url()));
      return;
    }

    console.log('    ✅ Popup found:', popupPage.url());

    // Enter cedula
    console.log('\n[7] Entering cedula...');
    await popupPage.waitForSelector('input[name="numeroIdentificacionCotizante"]', { visible: true });
    await popupPage.type('input[name="numeroIdentificacionCotizante"]', '1047478670', { delay: 50 });

    // Trigger blur
    await popupPage.evaluate(() => {
      const input = document.querySelector('input[name="numeroIdentificacionCotizante"]') as HTMLInputElement;
      if (input) {
        input.blur();
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    });

    // Wait for autocomplete
    console.log('    Waiting for BDUA autocomplete...');
    await popupPage.waitForTimeout(3000);

    // Check if names were filled
    const primerNombre = await popupPage.evaluate(() => {
      const input = document.querySelector('input[name="primerNombreCotizante"]') as HTMLInputElement;
      return input?.value || '';
    });
    console.log(`    Primer nombre: ${primerNombre || '(vacío)'}`);

    // Take screenshot before selecting tipoCotizante
    await popupPage.screenshot({ path: 'logs/screenshots/debug_before_tipo_cotizante.png', fullPage: true });
    console.log('    Screenshot saved: debug_before_tipo_cotizante.png');

    // NOW SELECT TIPO COTIZANTE
    console.log('\n[8] SELECTING TIPO COTIZANTE 3-INDEPENDIENTE...');
    console.log('    (This is where the popup closes unexpectedly)');

    // First, log all options
    const opciones = await popupPage.evaluate(() => {
      const select = document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement;
      if (!select) return [];
      return Array.from(select.options).map(o => ({ value: o.value, text: o.text }));
    });
    console.log('    Opciones:', JSON.stringify(opciones, null, 2));

    // Check if there's an onchange handler
    const onchangeHandler = await popupPage.evaluate(() => {
      const select = document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement;
      return select?.getAttribute('onchange') || '(none)';
    });
    console.log('    onchange handler:', onchangeHandler);

    // Select the value
    console.log('    Selecting value "3,3"...');
    await popupPage.select('select[name="tipoCotizante"]', '3,3');

    // Wait and check if popup is still open
    console.log('    Waiting 3 seconds...');
    await popupPage.waitForTimeout(3000);

    // Check popup state
    try {
      const popupUrl = popupPage.url();
      console.log(`    Popup URL after selection: ${popupUrl}`);

      // Take screenshot
      await popupPage.screenshot({ path: 'logs/screenshots/debug_after_tipo_cotizante.png', fullPage: true });
      console.log('    Screenshot saved: debug_after_tipo_cotizante.png');

      // Check for error messages
      const errorMessages = await popupPage.evaluate(() => {
        const errors = [];
        // Check alert messages
        const alerts = document.querySelectorAll('.alert, .error, .mensaje-error, .alert-danger');
        alerts.forEach(a => {
          if (a.textContent?.trim()) errors.push(a.textContent.trim());
        });
        // Check body for error text
        const bodyText = document.body.innerText;
        if (bodyText.includes('error') || bodyText.includes('Error')) {
          const lines = bodyText.split('\n').filter(l => l.toLowerCase().includes('error'));
          errors.push(...lines.slice(0, 5));
        }
        return errors;
      });

      if (errorMessages.length > 0) {
        console.log('    ⚠️ Error messages found:', errorMessages);
      }

      // Check visible fields
      const visibleFields = await popupPage.evaluate(() => {
        const fields = [];
        const departamento = document.querySelector('select[name="departamento"]') as HTMLSelectElement;
        const municipio = document.querySelector('select[name="municipio"]') as HTMLSelectElement;
        fields.push(`Departamento: ${departamento ? 'visible' : 'not found'}`);
        fields.push(`Municipio: ${municipio ? 'visible' : 'not found'}`);
        return fields;
      });
      console.log('    Fields status:', visibleFields);

    } catch (err) {
      console.log(`    ❌ Popup closed! Error: ${err}`);

      // Take screenshot of main page
      await page.screenshot({ path: 'logs/screenshots/debug_main_after_popup_close.png', fullPage: true });
      console.log('    Screenshot of main page saved');

      // Check main page for error
      const mainPageText = await page.evaluate(() => document.body.innerText);
      console.log('    Main page text (first 500 chars):', mainPageText.substring(0, 500));
    }

    console.log('\n[9] Waiting 30 seconds before closing (inspect the browser)...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
    // prisma is a singleton, no need to disconnect
    console.log('\nFinished.');
  }
}

main();
