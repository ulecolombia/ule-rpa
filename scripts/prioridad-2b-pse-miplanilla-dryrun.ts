/**
 * PRIORIDAD 2B: PSE Dry-Run Mi Planilla hasta Bancolombia
 *
 * Objetivo: Navegar desde planilla pendiente → PSE → Bancolombia (STOP)
 *
 * Planilla pendiente: #60786503 - $855,000 (Marzo 2026)
 * Usuario: CC1047484978 / Ulecolombia123
 */

import { Page } from 'puppeteer';
import { getMiPlanillaAuthBot } from '../src/bots/miplanilla/auth.bot';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const EVIDENCIAS_PATH = path.resolve('./tests/evidencias');

const TEST_USER = {
  documento: '1047484978',
  password: 'Ulecolombia123',
};

const PSE_DATA = {
  tipoPersona: 'J', // Jurídica
  nit: '9020190314',
  email: 'ulecolombia@gmail.com',
  banco: 'BANCOLOMBIA', // o código del banco
};

async function takeScreenshot(page: Page, name: string): Promise<string> {
  if (!fs.existsSync(EVIDENCIAS_PATH)) {
    fs.mkdirSync(EVIDENCIAS_PATH, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = path.join(EVIDENCIAS_PATH, `pse-miplanilla-${name}_${timestamp}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`   📸 Screenshot: ${path.basename(filepath)}`);
  return filepath;
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   PRIORIDAD 2B: PSE DRY-RUN MI PLANILLA → BANCOLOMBIA      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`👤 Usuario: CC${TEST_USER.documento}`);
  console.log(`🏦 Banco destino: ${PSE_DATA.banco}`);
  console.log(`📝 NIT: ${PSE_DATA.nit}`);
  console.log('');
  console.log('────────────────────────────────────────────────────────────');
  console.log('');

  const authBot = getMiPlanillaAuthBot();
  let page: Page | null = null;

  try {
    // ========================================
    // PASO 1: Login en Mi Planilla
    // ========================================
    console.log('📋 PASO 1/5: Login en Mi Planilla');

    // Inicializar browser y hacer login
    page = await authBot.initialize();

    const session = await authBot.login({
      tipoDocumento: 'CC',
      documento: TEST_USER.documento,
      password: TEST_USER.password,
    });

    if (!session?.isAuthenticated) {
      throw new Error('Login fallido en Mi Planilla');
    }

    console.log(`   ✅ Login exitoso: ${session.userName || 'Usuario autenticado'}`);
    await takeScreenshot(page, '01-login-ok');

    // ========================================
    // PASO 2: Navegar a Administrar Planillas
    // ========================================
    console.log('');
    console.log('📋 PASO 2/5: Navegar a planillas pendientes');

    // Ir a administrar planillas
    await page.goto('https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/AdministrarPlanillas', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '02a-administrar-planillas');

    // Buscar planilla pendiente
    const planillaInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const hasPlanilla60786503 = bodyText.includes('60786503');
      const has855000 = bodyText.includes('855.000') || bodyText.includes('855,000');
      const hasPagaAqui = bodyText.includes('Paga aquí') || bodyText.includes('Pagar');

      return {
        hasPlanilla60786503,
        has855000,
        hasPagaAqui,
        bodyPreview: bodyText.slice(0, 500)
      };
    });

    console.log(`   Planilla #60786503: ${planillaInfo.hasPlanilla60786503}`);
    console.log(`   Valor $855,000: ${planillaInfo.has855000}`);
    console.log(`   Botón pagar: ${planillaInfo.hasPagaAqui}`);

    // Buscar y click en "Paga aquí" (botón naranja)
    const clickedPagar = await page.evaluate(() => {
      // Buscar botones con texto "Paga aquí" o "Pagar"
      const buttons = document.querySelectorAll('button, a, input[type="button"], input[type="submit"]');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        if (text.includes('Paga aquí') || text === 'Pagar') {
          (btn as HTMLElement).click();
          return { clicked: true, text };
        }
      }

      // Buscar enlaces con href de pago
      const links = document.querySelectorAll('a[href*="pago"], a[href*="Pago"]');
      for (const link of links) {
        const text = link.textContent || '';
        if (text.toLowerCase().includes('pag')) {
          (link as HTMLElement).click();
          return { clicked: true, text: text.trim() };
        }
      }

      return { clicked: false };
    });

    if (clickedPagar.clicked) {
      console.log(`   ✅ Click en: "${clickedPagar.text}"`);
      await page.waitForTimeout(5000);
    } else {
      console.log('   ⚠️ No se encontró botón de pagar, intentando buscar manualmente...');
    }

    await takeScreenshot(page, '02b-despues-click-pagar');

    // ========================================
    // PASO 3: Seleccionar medio de pago
    // ========================================
    console.log('');
    console.log('📋 PASO 3/5: Seleccionar medio de pago');

    // Verificar si estamos en página de Resumen
    const urlActual = page.url();
    console.log(`   URL actual: ${urlActual}`);

    await takeScreenshot(page, '03a-resumen-planilla');

    // Verificar contenido de la página
    const resumenInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return {
        hasResumen: bodyText.includes('Resumen de la planilla'),
        hasTotal: bodyText.includes('855.000') || bodyText.includes('855,000'),
        hasSeleccionarMedio: bodyText.includes('Seleccionar medio de pago'),
        bodyPreview: bodyText.slice(0, 300)
      };
    });

    console.log(`   Resumen planilla: ${resumenInfo.hasResumen}`);
    console.log(`   Total $855,000: ${resumenInfo.hasTotal}`);
    console.log(`   Botón medio pago: ${resumenInfo.hasSeleccionarMedio}`);

    // Click en "Seleccionar medio de pago" (primer botón)
    const clickedMedioPago = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a, input[type="button"]');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        if (text.includes('Seleccionar medio de pago')) {
          (btn as HTMLElement).click();
          return { clicked: true, text };
        }
      }
      return { clicked: false };
    });

    if (clickedMedioPago.clicked) {
      console.log(`   ✅ Click en: "${clickedMedioPago.text}"`);
      await page.waitForTimeout(3000);
    } else {
      console.log('   ⚠️ No se encontró "Seleccionar medio de pago"');
    }

    await takeScreenshot(page, '03b-medios-de-pago');

    // Cerrar popup de cesantías si existe
    const closedPopup = await page.evaluate(() => {
      // Buscar botón X para cerrar modal
      const closeButtons = document.querySelectorAll('button.close, .modal-close, [aria-label="Close"], button[class*="close"]');
      for (const btn of closeButtons) {
        (btn as HTMLElement).click();
        return true;
      }
      // Buscar X en texto
      const allButtons = document.querySelectorAll('button');
      for (const btn of allButtons) {
        if (btn.textContent?.trim() === '×' || btn.textContent?.trim() === 'X') {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (closedPopup) {
      console.log('   ✅ Popup cerrado');
      await page.waitForTimeout(1000);
    }

    // Hacer click en la card de PSE usando coordenadas o selector más específico
    // La card de PSE tiene el logo PSE y el texto "Pago por PSE"
    const clickedPSE = await page.evaluate(() => {
      // Buscar la imagen PSE y hacer click en su contenedor
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        if (src.toLowerCase().includes('pse')) {
          // Encontrar el contenedor clickeable más cercano
          let container = img.parentElement;
          while (container && container.tagName !== 'BODY') {
            const style = window.getComputedStyle(container);
            // Si es un div con cursor pointer o es clickeable
            if (container.onclick || style.cursor === 'pointer' ||
                container.classList.contains('card') ||
                container.getAttribute('role') === 'button') {
              container.click();
              return { clicked: true, method: 'container-click' };
            }
            container = container.parentElement;
          }
          // Si no encontramos contenedor, click en la imagen directamente
          img.click();
          return { clicked: true, method: 'img-click' };
        }
      }

      // Alternativa: buscar por radio button o checkbox
      const radios = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      for (const radio of radios) {
        const label = radio.closest('label') || document.querySelector(`label[for="${radio.id}"]`);
        const text = label?.textContent || '';
        if (text.toLowerCase().includes('pse')) {
          (radio as HTMLInputElement).click();
          return { clicked: true, method: 'radio-click' };
        }
      }

      return { clicked: false };
    });

    if (clickedPSE.clicked) {
      console.log(`   ✅ PSE seleccionado: ${clickedPSE.method}`);
      await page.waitForTimeout(1000);
    } else {
      // Intentar click por posición en la primera card (izquierda)
      const cards = await page.$$('div[class*="card"], div[class*="opcion"], div[class*="medio"]');
      if (cards.length > 0) {
        await cards[0].click();
        console.log('   ✅ Click en primera card (PSE)');
        await page.waitForTimeout(1000);
      }
    }

    await takeScreenshot(page, '03c-pse-seleccionado');

    // Click en el botón "Seleccionar medio de pago" (botón naranja)
    const clickedConfirmarPSE = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        // Buscar específicamente "Seleccionar medio de pago" (el botón naranja)
        if (text === 'Seleccionar medio de pago') {
          (btn as HTMLElement).click();
          return { clicked: true, text };
        }
      }
      return { clicked: false };
    });

    if (clickedConfirmarPSE.clicked) {
      console.log(`   ✅ Click en: "${clickedConfirmarPSE.text}"`);
      await page.waitForTimeout(5000);
    } else {
      console.log('   ⚠️ No se encontró botón "Seleccionar medio de pago"');
    }

    await takeScreenshot(page, '03d-despues-confirmar-pse');

    // Cerrar popup si apareció después del click
    await page.evaluate(() => {
      const modals = document.querySelectorAll('.modal, [role="dialog"], .popup');
      modals.forEach(modal => {
        const closeBtn = modal.querySelector('button.close, [aria-label="Close"], .btn-close');
        if (closeBtn) (closeBtn as HTMLElement).click();
      });
    });
    await page.waitForTimeout(1000);

    // Ahora buscar selector de banco
    const hasBankSelector = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      let bankSelect = null;

      for (const select of selects) {
        const name = select.getAttribute('name') || '';
        const id = select.getAttribute('id') || '';
        const options = select.innerHTML;

        if (name.toLowerCase().includes('banco') ||
            id.toLowerCase().includes('banco') ||
            options.toLowerCase().includes('bancolombia')) {
          bankSelect = { name, id, optionsCount: select.options.length };
        }
      }

      return {
        hasBankSelect: !!bankSelect,
        bankSelect,
        bodyText: document.body.innerText.slice(0, 500)
      };
    });

    console.log(`   Selector de banco: ${hasBankSelector.hasBankSelect}`);

    // Si hay formulario PSE, llenarlo
    if (hasBankSelector.hasBankSelect || urlActual.includes('pse')) {
      // Seleccionar tipo persona jurídica
      try {
        await page.select('select[name*="persona"], select[name*="tipo"]', 'J');
        console.log('   ✅ Tipo persona: Jurídica');
      } catch {
        // Intentar con radio button
        const radioJ = await page.$('input[type="radio"][value="J"], input[type="radio"][value="juridica"]');
        if (radioJ) {
          await radioJ.click();
          console.log('   ✅ Tipo persona: Jurídica (radio)');
        }
      }

      // Seleccionar banco Bancolombia
      try {
        // Intentar diferentes selectores
        const bankSelectors = [
          'select[name*="banco"]',
          'select[name*="entidad"]',
          'select[id*="banco"]',
          'select[id*="entidad"]',
          '#idEntidad',
          'select.banco',
        ];

        for (const selector of bankSelectors) {
          const select = await page.$(selector);
          if (select) {
            // Obtener opciones disponibles
            const options = await page.evaluate((sel) => {
              const selectEl = document.querySelector(sel) as HTMLSelectElement;
              if (!selectEl) return [];
              return Array.from(selectEl.options).map(opt => ({
                value: opt.value,
                text: opt.text
              }));
            }, selector);

            // Buscar Bancolombia
            const bancolombia = options.find(opt =>
              opt.text.toLowerCase().includes('bancolombia') ||
              opt.value.toLowerCase().includes('bancolombia')
            );

            if (bancolombia) {
              await page.select(selector, bancolombia.value);
              console.log(`   ✅ Banco seleccionado: ${bancolombia.text}`);
              break;
            }
          }
        }
      } catch (e) {
        console.log(`   ⚠️ Error seleccionando banco: ${e}`);
      }

      await page.waitForTimeout(1000);
      await takeScreenshot(page, '03b-banco-seleccionado');
    }

    // ========================================
    // PASO 4: Llenar datos PSE
    // ========================================
    console.log('');
    console.log('📋 PASO 4/5: Llenar datos PSE');

    // NIT
    const nitInput = await page.$('input[name*="nit"], input[name*="documento"], input[id*="nit"]');
    if (nitInput) {
      await nitInput.click({ clickCount: 3 });
      await nitInput.type(PSE_DATA.nit);
      console.log(`   ✅ NIT: ${PSE_DATA.nit}`);
    }

    // Email
    const emailInput = await page.$('input[name*="email"], input[name*="correo"], input[type="email"]');
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(PSE_DATA.email);
      console.log(`   ✅ Email: ${PSE_DATA.email}`);
    }

    await takeScreenshot(page, '04-datos-pse-llenos');

    // Click en continuar/siguiente
    const clickedContinuar = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn');
      for (const btn of buttons) {
        const text = ((btn as HTMLInputElement).value || btn.textContent || '').toLowerCase();
        if (text.includes('continuar') || text.includes('siguiente') ||
            text.includes('pagar') || text.includes('confirmar')) {
          (btn as HTMLElement).click();
          return { clicked: true, text };
        }
      }
      return { clicked: false };
    });

    if (clickedContinuar.clicked) {
      console.log(`   ✅ Click en: "${clickedContinuar.text}"`);
      await page.waitForTimeout(5000);
    }

    await takeScreenshot(page, '04b-despues-continuar');

    // ========================================
    // PASO 5: Verificar llegada a Bancolombia
    // ========================================
    console.log('');
    console.log('📋 PASO 5/5: Verificar página Bancolombia');

    // Esperar posible redirección
    await page.waitForTimeout(3000);

    const urlFinal = page.url();
    console.log(`   URL final: ${urlFinal}`);

    const esBancolombia = urlFinal.includes('bancolombia') ||
                          urlFinal.includes('pse.com.co') ||
                          urlFinal.includes('ach.com.co');

    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        bodyText: document.body.innerText.slice(0, 500),
        hasBancolombia: document.body.innerText.toLowerCase().includes('bancolombia'),
        hasLogin: document.body.innerText.toLowerCase().includes('usuario') &&
                  document.body.innerText.toLowerCase().includes('clave'),
      };
    });

    console.log(`   Título: ${pageContent.title}`);
    console.log(`   Es Bancolombia: ${esBancolombia || pageContent.hasBancolombia}`);
    console.log(`   Tiene login: ${pageContent.hasLogin}`);

    await takeScreenshot(page, '05-pagina-final');

    // ========================================
    // RESULTADO FINAL
    // ========================================
    console.log('');
    console.log('════════════════════════════════════════════════════════════');

    if (esBancolombia || pageContent.hasBancolombia) {
      console.log('✅ ÉXITO: Llegamos a la página de Bancolombia');
      console.log('   🛑 BOT DETENIDO - Admin debe completar manualmente');
      console.log(`   URL: ${urlFinal}`);
    } else {
      console.log('⚠️ PARCIAL: No llegamos a Bancolombia directamente');
      console.log(`   URL actual: ${urlFinal}`);
      console.log(`   Contenido: ${pageContent.bodyText.slice(0, 200)}...`);
    }

    console.log('');
    console.log('────────────────────────────────────────────────────────────');

  } catch (error) {
    console.log('');
    console.log(`❌ ERROR: ${error instanceof Error ? error.message : error}`);
    if (page) {
      await takeScreenshot(page, 'error-final');
    }
  } finally {
    if (page) {
      const browser = page.browser();
      await browser.close();
      console.log('Browser cerrado');
    }
  }
}

main().catch(console.error);
