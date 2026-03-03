/**
 * Mi Planilla - FLUJO COMPLETO HASTA BANCOLOMBIA
 *
 * Este script ejecuta el flujo completo:
 * 1. Login
 * 2. Generar planilla (si no hay pendiente)
 * 3. Ir a "Planillas disponibles para pago"
 * 4. Click en "Paga aquí"
 * 5. Seleccionar PSE como medio de pago
 * 6. Seleccionar Bancolombia
 * 7. Continuar hasta llegar a la página del banco
 * 8. STOP - Cuando pida la clave, NO continuar
 *
 * Credenciales: CC1047484978 / Ulecolombia123
 */

import { BrowserManager } from '../src/bots/utils/browser';

const URLS = {
  portal: 'https://independientes2.miplanilla.com/PublicoIndependientes/Publico/IndexIndependientes',
  dashboard: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Principal',
  generarPlanilla: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/GenerarPlanilla',
  administrarPlanillas: 'https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/AdministrarPlanillas',
};

const CREDENTIALS = {
  usuario: 'CC1047484978',
  password: 'Ulecolombia123',
};

const PSE_INFO = {
  email: 'ulecolombia@gmail.com',
  nit: '9020190314',
};

const BANCOLOMBIA_INFO = {
  usuario: 'Lbrochet01',
  // La contraseña NO se guarda aquí - el usuario la ingresa manualmente desde ULE
};

async function main() {
  console.log(`
═══════════════════════════════════════════════════════════════
   MI PLANILLA - FLUJO COMPLETO HASTA BANCOLOMBIA
═══════════════════════════════════════════════════════════════

Este script ejecutará:
1. Login
2. Generar planilla (si no hay pendiente)
3. Ir a pagar → PSE → Bancolombia
4. STOP cuando llegue a la página del banco

Usuario: ${CREDENTIALS.usuario}

`);

  const browserManager = new BrowserManager({
    headless: false,
    downloadsPath: './downloads/flujo-completo',
  });

  try {
    await browserManager.launch();
    const page = await browserManager.newPage();

    // ═══════════════════════════════════════════════════════════════
    // PASO 1: LOGIN
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 1] Realizando login...');

    await page.goto(URLS.portal, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Scroll al top para asegurar que el formulario esté visible
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    await browserManager.takeScreenshot(page, 'flujo-00-portal-cargado');

    // Cerrar popup con múltiples intentos
    try {
      const closeButtons = await page.$$('.modal .close, button[aria-label="Close"], .btn-close, button.close, .modal-header .close, [data-dismiss="modal"]');
      for (const btn of closeButtons) {
        try {
          await btn.click();
          await page.waitForTimeout(500);
          console.log('  → Popup cerrado');
        } catch {}
      }
    } catch {}

    // Click en cualquier lugar para cerrar modal si aún está visible
    await page.evaluate(() => {
      const modal = document.querySelector('.modal-backdrop, .modal.show');
      if (modal) {
        const closeBtn = document.querySelector('.modal .close, button[data-dismiss="modal"]') as HTMLElement;
        closeBtn?.click();
      }
    });
    await page.waitForTimeout(500);

    // Esperar a que el campo de usuario esté disponible
    console.log('  → Esperando campo de usuario...');
    try {
      await page.waitForSelector('#usuario', { visible: true, timeout: 10000 });
    } catch {
      // Si no está el campo, quizás necesitamos navegar a independientes
      console.log('  → Campo no encontrado, buscando alternativas...');
      const goToIndep = await page.evaluate(() => {
        const links = document.querySelectorAll('a');
        for (const link of links) {
          if (link.textContent?.includes('Independientes')) {
            link.click();
            return true;
          }
        }
        return false;
      });
      if (goToIndep) {
        await page.waitForTimeout(3000);
        await page.waitForSelector('#usuario', { visible: true, timeout: 10000 });
      }
    }

    await browserManager.takeScreenshot(page, 'flujo-00b-antes-login');

    // Verificar que el campo existe antes de escribir
    const usuarioField = await page.$('#usuario');
    if (!usuarioField) {
      throw new Error('Campo de usuario no encontrado');
    }

    await page.type('#usuario', CREDENTIALS.usuario, { delay: 50 });
    await page.type('#clave', CREDENTIALS.password, { delay: 50 });

    const loginBtn = await page.$('button.btn.btn-primary.button-cta');
    if (loginBtn) await loginBtn.click();
    else {
      await page.evaluate(() => {
        document.querySelectorAll('button').forEach(b => {
          if (b.textContent?.toLowerCase().includes('entrar')) b.click();
        });
      });
    }

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const loginUrl = page.url();
    console.log(`  → URL después de login: ${loginUrl}`);

    // Verificar login exitoso con condición más flexible
    const isLoggedIn = loginUrl.includes('Principal') ||
                       loginUrl.includes('Privado') ||
                       !loginUrl.includes('IndexIndependientes');

    if (!isLoggedIn) {
      // Verificar si hay mensaje de error
      const errorMsg = await page.evaluate(() => {
        const errorEl = document.querySelector('.alert-danger, .error, [class*="error"]');
        return errorEl?.textContent?.trim() || null;
      });

      if (errorMsg) {
        console.log(`  → Error encontrado: ${errorMsg}`);
      }

      await browserManager.takeScreenshot(page, 'flujo-01-login-failed');
      throw new Error(`Login falló. URL: ${loginUrl}`);
    }

    await browserManager.takeScreenshot(page, 'flujo-01-login-ok');
    console.log('  ✓ Login exitoso');

    // ═══════════════════════════════════════════════════════════════
    // PASO 2: VERIFICAR SI HAY PLANILLAS PENDIENTES
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 2] Verificando planillas pendientes de pago...');

    await page.goto(URLS.administrarPlanillas, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    await browserManager.takeScreenshot(page, 'flujo-02-planillas-page');

    // Verificar si hay planillas pendientes
    const hasPendientes = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      // Si dice "no tienes planillas pendientes", no hay
      if (bodyText.includes('no tienes planillas pendientes')) return false;
      // Buscar botón "Paga aquí" o similar
      const payBtns = document.querySelectorAll('button, a');
      for (const btn of payBtns) {
        const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('paga aquí') || text === 'pagar') return true;
      }
      return false;
    });

    console.log(`  → Planillas pendientes: ${hasPendientes ? 'SÍ' : 'NO'}`);

    // ═══════════════════════════════════════════════════════════════
    // PASO 3: GENERAR PLANILLA (si no hay pendientes)
    // ═══════════════════════════════════════════════════════════════
    if (!hasPendientes) {
      console.log('\n[PASO 3] Generando planilla...');

      await page.goto(URLS.generarPlanilla, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);

      await browserManager.takeScreenshot(page, 'flujo-03a-generar-page');

      // Cerrar modal ARL si aparece
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('no') && (text.includes('continuar') || text.includes('actualizar'))) {
            btn.click();
            break;
          }
        }
      });
      await page.waitForTimeout(1000);

      // Seleccionar tipo de planilla: "Pagos de mis propios aportes"
      const radioI = await page.$('#I');
      if (radioI) {
        await radioI.click();
        console.log('  → Seleccionado: Pagos de mis propios aportes');
      } else {
        // Buscar por texto
        await page.evaluate(() => {
          const labels = document.querySelectorAll('label');
          for (const label of labels) {
            if (label.textContent?.toLowerCase().includes('propios aportes')) {
              label.click();
              break;
            }
          }
        });
      }
      await page.waitForTimeout(1000);

      await browserManager.takeScreenshot(page, 'flujo-03b-tipo-seleccionado');

      // Click en "Generar Planilla"
      console.log('  → Buscando botón "Generar Planilla"...');

      const generarClicked = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, input[type="submit"], a.btn');
        for (const btn of btns) {
          const text = (btn as HTMLElement).innerText?.toLowerCase() ||
                      (btn as HTMLInputElement).value?.toLowerCase() || '';
          if (text.includes('generar planilla') || text === 'generar') {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (generarClicked) {
        console.log('  ✓ Click en "Generar Planilla"');
        await page.waitForTimeout(5000);
        await browserManager.takeScreenshot(page, 'flujo-03c-planilla-generada');
      } else {
        console.log('  ⚠ No se encontró botón "Generar Planilla"');
      }

      // Volver a la página de planillas
      await page.goto(URLS.administrarPlanillas, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);

      await browserManager.takeScreenshot(page, 'flujo-03d-verificar-planilla');
    } else {
      console.log('\n[PASO 3] Planilla pendiente encontrada, saltando generación');
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 4: CLICK EN "PAGA AQUÍ"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 4] Buscando botón de pago...');

    // Si acabamos de generar una planilla, puede que aún esté procesándose
    // Esperamos y recargamos la página hasta encontrar una planilla disponible
    let clickedPagar = { clicked: false, text: '' };
    let attempts = 0;
    const maxAttempts = 10; // Aumentado a 10 intentos

    while (!clickedPagar.clicked && attempts < maxAttempts) {
      attempts++;
      console.log(`  → Intento ${attempts}/${maxAttempts} de encontrar planillas disponibles...`);

      if (attempts > 1) {
        // Refrescar la página para actualizar el estado de las planillas
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
      }

      await browserManager.takeScreenshot(page, `flujo-04a-antes-pagar-intento${attempts}`);

      // Verificar si hay sección de "Planillas disponibles para pago"
      const pageStatus = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const hasDisponibles = bodyText.includes('Planillas disponibles para pago');
        const hasPagaAqui = bodyText.includes('Paga aquí');
        const hasEnProceso = bodyText.includes('en proceso de generación');
        const hasPendienteConfirmacion = bodyText.includes('Pendiente de confirmación');

        return { hasDisponibles, hasPagaAqui, hasEnProceso, hasPendienteConfirmacion };
      });

      console.log(`  [DEBUG] Disponibles: ${pageStatus.hasDisponibles}, PagaAqui: ${pageStatus.hasPagaAqui}, EnProceso: ${pageStatus.hasEnProceso}, Pendiente: ${pageStatus.hasPendienteConfirmacion}`);

      // Si la planilla está en proceso o pendiente de confirmación, esperar
      if (!pageStatus.hasPagaAqui && (pageStatus.hasEnProceso || pageStatus.hasPendienteConfirmacion)) {
        console.log('  → Planilla aún en proceso/pendiente, esperando 8 segundos...');
        await page.waitForTimeout(8000);
        continue;
      }

      // Buscar y hacer click en el botón de pagar - ESTRATEGIA MEJORADA
      clickedPagar = await page.evaluate(() => {
        // MÉTODO 1: Buscar específicamente "Paga aquí" en cualquier elemento
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = (el as HTMLElement).innerText?.trim() || '';
          const directText = el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE
            ? el.childNodes[0].textContent?.trim() || ''
            : '';

          // Buscar elementos que tengan exactamente "Paga aquí" como texto directo
          if (directText.toLowerCase() === 'paga aquí' || text.toLowerCase() === 'paga aquí') {
            (el as HTMLElement).click();
            return { clicked: true, text: 'Paga aquí' };
          }
        }

        // MÉTODO 2: Buscar enlaces a ResumenPlanilla
        const resumenLinks = document.querySelectorAll('a[href*="ResumenPlanilla"]');
        for (const link of resumenLinks) {
          const text = (link as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('paga')) {
            (link as HTMLElement).click();
            return { clicked: true, text: (link as HTMLElement).innerText?.trim() || 'Link ResumenPlanilla' };
          }
        }

        // MÉTODO 3: Buscar botones o links con texto de pago
        const clickables = document.querySelectorAll('button, a, [role="button"], span[onclick], div[onclick]');
        for (const el of clickables) {
          const text = (el as HTMLElement).innerText?.toLowerCase() || '';
          const href = (el as HTMLAnchorElement).href?.toLowerCase() || '';

          // Ignorar links externos
          if (href.includes('cesant') || href.includes('voluntar')) continue;
          if (text.includes('cesant') || text.includes('voluntar')) continue;

          if (text.includes('paga aquí') || text === 'pagar' || text.includes('ir a pagar')) {
            (el as HTMLElement).click();
            return { clicked: true, text: (el as HTMLElement).innerText?.trim() || 'Pagar' };
          }
        }

        // MÉTODO 4: Buscar en cards/contenedores de planilla
        const cards = document.querySelectorAll('.card, .planilla, [class*="planilla"], div[class*="card"]');
        for (const card of cards) {
          const payButton = card.querySelector('a, button');
          if (payButton) {
            const text = (payButton as HTMLElement).innerText?.toLowerCase() || '';
            if (text.includes('pag') && !text.includes('pagad')) {
              (payButton as HTMLElement).click();
              return { clicked: true, text: (payButton as HTMLElement).innerText?.trim() || 'Pagar desde card' };
            }
          }
        }

        return { clicked: false, text: '' };
      });

      if (!clickedPagar.clicked && attempts < maxAttempts) {
        console.log('  → No se encontró botón de pago, reintentando...');
        await page.waitForTimeout(5000);
      }
    }

    if (clickedPagar.clicked) {
      console.log(`  ✓ Click en "${clickedPagar.text}"`);
      await page.waitForTimeout(2000);
      await browserManager.takeScreenshot(page, 'flujo-04b-despues-pagar');

      // Verificar si aparece modal de confirmación
      console.log('  → Verificando si hay modal de confirmación...');

      const modalResult = await page.evaluate(() => {
        // Buscar modal visible
        const modalText = document.body.innerText;
        const hasModal = modalText.includes('¡Importante!') ||
                        modalText.includes('¿Deseas continuar') ||
                        modalText.includes('Continuar') && modalText.includes('Cancelar');

        if (hasModal) {
          // Buscar botón "Continuar" en el modal
          const buttons = document.querySelectorAll('button, a.btn, a');
          for (const btn of buttons) {
            const text = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
            // Buscar exactamente "Continuar", no otros textos
            if (text === 'continuar') {
              (btn as HTMLElement).click();
              return { hadModal: true, clicked: 'Continuar' };
            }
          }
        }

        return { hadModal: hasModal, clicked: null };
      });

      if (modalResult.hadModal) {
        console.log(`  → Modal de confirmación detectado`);
        if (modalResult.clicked) {
          console.log(`  ✓ Click en "${modalResult.clicked}"`);
          await page.waitForTimeout(3000);
        }
      }

      await browserManager.takeScreenshot(page, 'flujo-04c-despues-modal');
    } else {
      console.log('  ⚠ No se encontró botón de pago');
      console.log('  → Verificando contenido de la página...');

      const pageContent = await page.evaluate(() => {
        return {
          url: window.location.href,
          bodyPreview: document.body.innerText.substring(0, 500),
        };
      });
      console.log(`  → URL: ${pageContent.url}`);
      console.log(`  → Contenido: ${pageContent.bodyPreview.replace(/\s+/g, ' ').substring(0, 200)}...`);
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 5: CLICK EN "SELECCIONAR MEDIO DE PAGO"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 5] Buscando botón "Seleccionar medio de pago"...');

    await page.waitForTimeout(2000);
    await browserManager.takeScreenshot(page, 'flujo-05a-resumen-planilla');

    const currentPageUrl = page.url();
    console.log(`  → URL actual: ${currentPageUrl}`);

    // Verificar si estamos en página de resumen
    const isResumenPage = currentPageUrl.includes('ResumenPlanilla');

    if (isResumenPage) {
      console.log('  → Estamos en página de Resumen de Planilla');

      // Buscar y clickear botón "Seleccionar medio de pago"
      const medioPagoClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a.btn, a');
        for (const btn of buttons) {
          const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('seleccionar medio') || text.includes('medio de pago')) {
            (btn as HTMLElement).click();
            return { clicked: true, text: (btn as HTMLElement).innerText };
          }
        }
        return { clicked: false };
      });

      if (medioPagoClicked.clicked) {
        console.log(`  ✓ Click en "${medioPagoClicked.text}"`);
        await page.waitForTimeout(3000);
        await browserManager.takeScreenshot(page, 'flujo-05b-despues-seleccionar-medio');
      } else {
        console.log('  ⚠ No se encontró botón "Seleccionar medio de pago"');
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 5B: SELECCIONAR PSE COMO MEDIO DE PAGO
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 5B] Seleccionando PSE como medio de pago...');

    await page.waitForTimeout(2000);
    const newUrl = page.url();
    console.log(`  → URL actual: ${newUrl}`);

    // Verificar si estamos en la página de selección de medios de pago
    const isSeleccionPago = newUrl.includes('SeleccionOpcionPago');
    console.log(`  → Es página SeleccionOpcionPago: ${isSeleccionPago}`);

    await browserManager.takeScreenshot(page, 'flujo-05c-pagina-medios-pago');

    if (isSeleccionPago) {
      // Buscar el card PSE y clickearlo
      // El card tiene el logo PSE y el texto "Pago por PSE"
      // Cuando se clickea, el fondo cambia a naranja oscuro

      console.log('  → Buscando card "Pago por PSE"...');

      // Primero, analizar los elementos en la página
      const pageAnalysis = await page.evaluate(() => {
        const allImages = document.querySelectorAll('img');
        const pseImages: string[] = [];

        allImages.forEach(img => {
          const src = img.src || '';
          const alt = img.alt || '';
          if (src.toLowerCase().includes('pse') || alt.toLowerCase().includes('pse')) {
            pseImages.push(`src=${src}, alt=${alt}`);
          }
        });

        return {
          pseImages,
          bodyText: document.body.innerText.substring(0, 1000),
        };
      });

      console.log(`  [DEBUG] Imágenes PSE encontradas: ${pageAnalysis.pseImages.length}`);

      // Método 1: Buscar por el logo PSE y clickear su contenedor
      const pseClicked = await page.evaluate(() => {
        // Buscar todas las imágenes PSE
        const allImages = document.querySelectorAll('img');

        for (const img of allImages) {
          const src = (img as HTMLImageElement).src?.toLowerCase() || '';
          const alt = (img as HTMLImageElement).alt?.toLowerCase() || '';

          // Solo el logo PSE, no otros
          if (src.includes('pse') || alt.includes('pse')) {
            // El card es un div contenedor - subimos varios niveles para encontrarlo
            let card = img.parentElement;

            // Subir hasta encontrar un div que sea "clickeable" (el card)
            for (let i = 0; i < 6 && card; i++) {
              const tagName = card.tagName.toLowerCase();
              const classList = card.className || '';
              const innerText = card.innerText?.trim() || '';

              // El card contiene "Pago por PSE" y tiene cierto tamaño
              if (innerText.includes('Pago por PSE') && !innerText.includes('presencial')) {
                const rect = card.getBoundingClientRect();
                // Verificar tamaño razonable de un card
                if (rect.width > 80 && rect.height > 50 && rect.width < 400) {
                  // Este es el card PSE - clickear
                  (card as HTMLElement).click();
                  return {
                    clicked: true,
                    method: 'card-container',
                    dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
                    classList,
                  };
                }
              }
              card = card.parentElement;
            }
          }
        }

        // Método 2: Buscar por texto "Pago por PSE" directamente
        const allDivs = document.querySelectorAll('div, label, span');
        for (const el of allDivs) {
          const text = (el as HTMLElement).innerText?.trim() || '';

          if (text === 'Pago por PSE' || text.includes('Pago por PSE')) {
            // Si es solo el texto, buscar el contenedor clickeable
            let container = el.parentElement;
            for (let i = 0; i < 5 && container; i++) {
              const hasImage = container.querySelector('img');
              const rect = container.getBoundingClientRect();

              if (hasImage && rect.width > 80 && rect.height > 50 && rect.width < 400) {
                (container as HTMLElement).click();
                return {
                  clicked: true,
                  method: 'text-search',
                  dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
                };
              }
              container = container.parentElement;
            }
          }
        }

        return { clicked: false };
      });

      if (pseClicked.clicked) {
        console.log(`  ✓ Card PSE clickeado (${pseClicked.method}, ${pseClicked.dimensions})`);
        await page.waitForTimeout(1500);
        await browserManager.takeScreenshot(page, 'flujo-05d-pse-seleccionado');

        // Ahora buscar y clickear "Seleccionar medio de pago"
        console.log('  → Buscando botón "Seleccionar medio de pago"...');

        const seleccionarClicked = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button, a, input[type="submit"]');

          for (const btn of buttons) {
            const text = (btn as HTMLElement).innerText?.toLowerCase() ||
                        (btn as HTMLInputElement).value?.toLowerCase() || '';

            // Buscar exactamente "Seleccionar medio de pago"
            if (text.includes('seleccionar medio de pago')) {
              (btn as HTMLElement).click();
              return { clicked: true, text: (btn as HTMLElement).innerText?.trim() };
            }
          }

          return { clicked: false };
        });

        if (seleccionarClicked.clicked) {
          console.log(`  ✓ Click en "${seleccionarClicked.text}"`);

          // Esperar navegación a /pse/go.aspx
          console.log('  → Esperando navegación a página PSE...');
          await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
          await page.waitForTimeout(3000);
        } else {
          console.log('  ⚠ No se encontró botón "Seleccionar medio de pago"');
        }
      } else {
        console.log('  ⚠ No se pudo clickear el card PSE');

        // Mostrar contenido de la página para debug
        const debugInfo = await page.evaluate(() => {
          return {
            url: window.location.href,
            textPreview: document.body.innerText.substring(0, 500).replace(/\s+/g, ' '),
          };
        });
        console.log(`  [DEBUG] URL: ${debugInfo.url}`);
        console.log(`  [DEBUG] Texto: ${debugInfo.textPreview.substring(0, 200)}...`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 6: VERIFICAR QUE ESTAMOS EN /pse/go.aspx Y LLENAR DATOS
    // ═══════════════════════════════════════════════════════════════
    const urlPasoPSE = page.url();
    console.log(`\n[PASO 6] URL actual: ${urlPasoPSE}`);

    const isPSEGoPage = urlPasoPSE.includes('pse/go.aspx') || urlPasoPSE.includes('pse');

    if (isPSEGoPage) {
      console.log('  ✓ Estamos en la página de pago PSE');
      await browserManager.takeScreenshot(page, 'flujo-06a-pse-go-page');

      // Analizar los selects disponibles
      const selectsInfo = await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        const info: any[] = [];

        selects.forEach(select => {
          info.push({
            id: select.id,
            name: select.name,
            optionsCount: select.options.length,
            firstOptions: Array.from(select.options).slice(0, 5).map(o => ({
              value: o.value,
              text: o.text.trim(),
            })),
          });
        });

        return info;
      });

      console.log('  → Selects encontrados:', selectsInfo.length);
      selectsInfo.forEach(s => {
        console.log(`    - ${s.id || s.name}: ${s.optionsCount} opciones`);
        s.firstOptions.forEach((opt: any) => {
          console.log(`      * "${opt.text}" (${opt.value})`);
        });
      });

      // Seleccionar "Tipo de cliente" = "Persona Jurídica"
      console.log('  → Seleccionando Tipo de cliente: Persona Jurídica...');

      const tipoClienteSelected = await page.evaluate(() => {
        const selects = document.querySelectorAll('select');

        for (const select of selects) {
          const id = select.id?.toLowerCase() || '';
          const name = select.name?.toLowerCase() || '';

          // Buscar el select de tipo de cliente (suele tener pocas opciones)
          if (id.includes('tipo') || name.includes('tipo') || select.options.length <= 5) {
            for (const opt of select.options) {
              const text = opt.text.toLowerCase();
              // Seleccionar Persona JURÍDICA (no Natural)
              if (text.includes('jurídica') || text.includes('juridica')) {
                select.value = opt.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return { selected: true, value: opt.text };
              }
            }
          }
        }

        return { selected: false };
      });

      if (tipoClienteSelected.selected) {
        console.log(`  ✓ Tipo de cliente: ${tipoClienteSelected.value}`);
      }

      await page.waitForTimeout(1500);

      // Seleccionar Banco = Bancolombia
      console.log('  → Seleccionando Banco: Bancolombia...');

      const bancoSelected = await page.evaluate(() => {
        const selects = document.querySelectorAll('select');

        for (const select of selects) {
          const id = select.id?.toLowerCase() || '';
          const name = select.name?.toLowerCase() || '';

          // Buscar el select de banco (suele tener muchas opciones)
          if (id.includes('banco') || name.includes('banco') || select.options.length > 10) {
            for (const opt of select.options) {
              const text = opt.text.toLowerCase();
              if (text.includes('bancolombia')) {
                select.value = opt.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return { selected: true, value: opt.text };
              }
            }
          }
        }

        return { selected: false };
      });

      if (bancoSelected.selected) {
        console.log(`  ✓ Banco: ${bancoSelected.value}`);
        await page.waitForTimeout(1000);
        await browserManager.takeScreenshot(page, 'flujo-06b-banco-seleccionado');
      } else {
        console.log('  ⚠ No se pudo seleccionar Bancolombia');

        // Debug: mostrar todos los bancos disponibles
        const bancosDisponibles = await page.evaluate(() => {
          const selects = document.querySelectorAll('select');
          for (const select of selects) {
            if (select.options.length > 10) {
              return Array.from(select.options).map(o => o.text).slice(0, 20);
            }
          }
          return [];
        });
        console.log('  [DEBUG] Bancos disponibles:', bancosDisponibles.slice(0, 10));
      }

    } else {
      console.log('  ⚠ No estamos en la página PSE');
      console.log(`  → URL actual: ${urlPasoPSE}`);
      await browserManager.takeScreenshot(page, 'flujo-06-no-pse-page');
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 7: CLICK EN EL LOGO PSE CIRCULAR (BOTÓN PARA CONTINUAR)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 7] Buscando logo PSE circular para continuar...');

    await browserManager.takeScreenshot(page, 'flujo-07a-antes-continuar');

    // Scroll para asegurar que el logo PSE esté visible
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(1000);

    // Buscar el logo PSE circular (el botón azul para continuar)
    // Este logo está más abajo en la página después de los selects de banco
    const pseLogoAnalysis = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const pseLogos: any[] = [];

      for (const img of images) {
        const src = (img as HTMLImageElement).src?.toLowerCase() || '';
        const alt = (img as HTMLImageElement).alt?.toLowerCase() || '';
        const rect = img.getBoundingClientRect();

        // Buscar imágenes PSE que sean visibles y de tamaño razonable (el logo circular)
        if ((src.includes('pse') || alt.includes('pse')) && rect.width > 50 && rect.height > 50) {
          // Verificar si el logo o su padre es clickeable
          const parent = img.parentElement;
          const grandParent = parent?.parentElement;

          pseLogos.push({
            src: (img as HTMLImageElement).src,
            alt: (img as HTMLImageElement).alt,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            parentTag: parent?.tagName,
            parentHref: (parent as HTMLAnchorElement)?.href || '',
            grandParentTag: grandParent?.tagName,
            isVisible: rect.y > 0 && rect.y < window.innerHeight,
          });
        }
      }

      return pseLogos;
    });

    console.log('  [DEBUG] Logos PSE encontrados:', pseLogoAnalysis.length);
    pseLogoAnalysis.forEach((logo: any, i: number) => {
      console.log(`    [${i}] ${logo.width}x${logo.height} @ (${Math.round(logo.x)}, ${Math.round(logo.y)}) - parent: ${logo.parentTag}`);
    });

    let continuarClicked = { clicked: false, method: '', text: '' };

    // MÉTODO PRINCIPAL: Buscar el logo PSE circular (más grande, visible en pantalla)
    // El logo de submit es un círculo más grande con el texto "pse" y "Pagos Seguros en Línea"
    const submitPseLogo = pseLogoAnalysis.find((logo: any) =>
      logo.width >= 80 && logo.height >= 80 && logo.y > 400 // El logo de submit está más abajo
    ) || pseLogoAnalysis.find((logo: any) =>
      logo.width >= 80 && logo.height >= 80 // O simplemente el logo más grande
    );

    if (submitPseLogo) {
      console.log(`  → Encontrado logo PSE circular: ${submitPseLogo.width}x${submitPseLogo.height} en posición (${Math.round(submitPseLogo.x)}, ${Math.round(submitPseLogo.y)})`);

      // Click en el centro del logo PSE circular
      const clickX = submitPseLogo.x + submitPseLogo.width / 2;
      const clickY = submitPseLogo.y + submitPseLogo.height / 2;

      console.log(`  → Haciendo click en el centro del logo PSE: (${Math.round(clickX)}, ${Math.round(clickY)})`);

      try {
        await page.mouse.click(clickX, clickY);
        continuarClicked = { clicked: true, method: 'pse-logo-circle', text: 'Logo PSE Circular' };
      } catch (e) {
        console.log(`  → Click falló: ${e}`);
      }
    }

    // MÉTODO 2: Si no encontramos el logo grande, buscar input type="image" o submit con imagen PSE
    if (!continuarClicked.clicked) {
      console.log('  → Buscando input de imagen o botón PSE...');

      continuarClicked = await page.evaluate(() => {
        // Buscar input type="image"
        const imageInputs = document.querySelectorAll('input[type="image"]');
        for (const input of imageInputs) {
          const src = (input as HTMLInputElement).src?.toLowerCase() || '';
          if (src.includes('pse')) {
            (input as HTMLElement).click();
            return { clicked: true, method: 'input-image-pse', text: 'Input Image PSE' };
          }
        }

        // Buscar cualquier elemento clickeable con imagen PSE
        const allClickables = document.querySelectorAll('a, button, [onclick]');
        for (const el of allClickables) {
          const img = el.querySelector('img');
          if (img) {
            const src = (img as HTMLImageElement).src?.toLowerCase() || '';
            if (src.includes('pse')) {
              const rect = el.getBoundingClientRect();
              // Solo elementos visibles y de tamaño razonable
              if (rect.width > 50 && rect.height > 50) {
                (el as HTMLElement).click();
                return { clicked: true, method: 'clickable-with-pse-img', text: 'Elemento con logo PSE' };
              }
            }
          }
        }

        // Buscar el logo PSE directamente y clickearlo
        const images = document.querySelectorAll('img');
        for (const img of images) {
          const src = (img as HTMLImageElement).src?.toLowerCase() || '';
          const rect = img.getBoundingClientRect();
          // Buscar el logo circular grande (no el del header)
          if (src.includes('pse') && rect.width >= 80 && rect.height >= 80 && rect.y > 300) {
            img.click();
            return { clicked: true, method: 'direct-img-click', text: 'Click directo en imagen PSE' };
          }
        }

        return { clicked: false, method: '', text: '' };
      });
    }

    // MÉTODO 3: Submit del formulario
    if (!continuarClicked.clicked) {
      console.log('  → Intentando submit de formulario...');
      try {
        const formSubmitted = await page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return true;
          }
          return false;
        });
        if (formSubmitted) {
          continuarClicked = { clicked: true, method: 'form-submit', text: 'Form Submit' };
        }
      } catch (e) {
        console.log('  → Form submit falló');
      }
    }

    if (continuarClicked.clicked) {
      console.log(`  ✓ Click en "${continuarClicked.text}" (${continuarClicked.method})`);
    } else {
      console.log('  ⚠ No se encontró el logo PSE para continuar');
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 8: MANEJAR NUEVA VENTANA PSE (registro.pse.com.co)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 8] Esperando nueva ventana de PSE (registro.pse.com.co)...');

    // El click en el logo PSE abre una NUEVA VENTANA en registro.pse.com.co
    // Necesitamos detectarla y cambiar a ella

    const browser = page.browser();
    if (!browser) {
      throw new Error('No se pudo obtener referencia al browser');
    }

    // Obtener todas las páginas actuales
    const pagesBeforeCount = (await browser.pages()).length;
    console.log(`  → Páginas abiertas antes: ${pagesBeforeCount}`);

    // Esperar a que se abra la nueva ventana
    await page.waitForTimeout(3000);

    let pseWindow = null;
    let pseAttempts = 0;
    const pseMaxAttempts = 15;

    while (!pseWindow && pseAttempts < pseMaxAttempts) {
      pseAttempts++;
      const allPages = await browser.pages();
      console.log(`  → Intento ${pseAttempts}/${pseMaxAttempts}: ${allPages.length} páginas abiertas`);

      // Buscar la página de PSE
      for (const p of allPages) {
        const url = p.url();
        console.log(`    - ${url.substring(0, 80)}...`);

        if (url.includes('registro.pse.com.co') || url.includes('pse.com.co')) {
          pseWindow = p;
          console.log(`  ✓ Encontrada ventana PSE: ${url.substring(0, 80)}...`);
          break;
        }
      }

      if (!pseWindow) {
        // También verificar si miplanilla muestra página intermedia de redirección
        const miplanillaPage = allPages.find(p => p.url().includes('miplanilla.com'));
        if (miplanillaPage) {
          const hasRedirectLink = await miplanillaPage.evaluate(() => {
            const bodyText = document.body.innerText.toLowerCase();
            return bodyText.includes('no redirecciona') || bodyText.includes('clic aquí');
          }).catch(() => false);

          if (hasRedirectLink) {
            console.log('  → Página de redirección detectada, haciendo click en enlace...');
            await miplanillaPage.evaluate(() => {
              const links = document.querySelectorAll('a');
              for (const link of links) {
                const text = link.innerText?.toLowerCase() || '';
                if (text.includes('clic aquí') || text.includes('aquí')) {
                  link.click();
                  return true;
                }
              }
              return false;
            }).catch(() => {});
          }
        }

        await page.waitForTimeout(2000);
      }
    }

    if (!pseWindow) {
      console.log('  ⚠ No se encontró la ventana PSE, verificando página actual...');

      // Puede que se haya redirigido en la misma ventana
      const currentUrl = page.url();
      if (currentUrl.includes('pse.com.co')) {
        pseWindow = page;
        console.log('  → PSE se abrió en la misma ventana');
      } else {
        await browserManager.takeScreenshot(page, 'flujo-08-no-pse-window');
        throw new Error('No se pudo encontrar la ventana de PSE');
      }
    }

    // Ahora trabajamos con la ventana PSE
    await pseWindow.bringToFront();
    await pseWindow.waitForTimeout(2000);

    await browserManager.takeScreenshot(pseWindow, 'flujo-08a-pse-window');

    const pseUrl = pseWindow.url();
    console.log(`  → URL ventana PSE: ${pseUrl}`);

    // ═══════════════════════════════════════════════════════════════
    // PASO 8.1: Seleccionar tab "Jurídica"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 8.1] Seleccionando tab "Jurídica"...');

    const tabClicked = await pseWindow.evaluate(() => {
      // Buscar tabs Natural/Jurídica
      const allElements = document.querySelectorAll('*');

      for (const el of allElements) {
        const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';

        // Buscar tab "Jurídica"
        if (text === 'jurídica' || text === 'juridica') {
          const tagName = el.tagName.toLowerCase();
          // Puede ser un tab, link, botón, etc.
          if (tagName === 'a' || tagName === 'button' || tagName === 'li' ||
              tagName === 'span' || tagName === 'div') {
            (el as HTMLElement).click();
            return { clicked: true, element: tagName };
          }
        }
      }

      // Método alternativo: buscar por atributo o clase
      const juridicaTab = document.querySelector('[data-value="J"], [value="J"], .juridica, #juridica, [href*="juridica"]');
      if (juridicaTab) {
        (juridicaTab as HTMLElement).click();
        return { clicked: true, element: 'data-attr' };
      }

      return { clicked: false };
    });

    if (tabClicked.clicked) {
      console.log(`  ✓ Tab Jurídica clickeado (${tabClicked.element})`);
      await pseWindow.waitForTimeout(1500);
    } else {
      console.log('  ⚠ No se encontró tab Jurídica, puede que ya esté seleccionado');
    }

    await browserManager.takeScreenshot(pseWindow, 'flujo-08b-tab-juridica');

    // ═══════════════════════════════════════════════════════════════
    // PASO 8.2: Seleccionar "Soy un usuario registrado"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 8.2] Seleccionando "Soy un usuario registrado"...');

    const registradoClicked = await pseWindow.evaluate(() => {
      // Buscar radio button o elemento con texto "Soy un usuario registrado"
      const allElements = document.querySelectorAll('*');

      for (const el of allElements) {
        const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';

        if (text.includes('soy un usuario registrado') || text.includes('usuario registrado')) {
          // Si es un label, buscar el input asociado
          if (el.tagName.toLowerCase() === 'label') {
            const forId = (el as HTMLLabelElement).htmlFor;
            if (forId) {
              const input = document.getElementById(forId) as HTMLInputElement;
              if (input) {
                input.click();
                return { clicked: true, method: 'label-for' };
              }
            }
            // Click en el label directamente
            (el as HTMLElement).click();
            return { clicked: true, method: 'label-click' };
          }

          // Click en el elemento
          (el as HTMLElement).click();
          return { clicked: true, method: 'direct' };
        }
      }

      // Buscar radio buttons
      const radios = document.querySelectorAll('input[type="radio"]');
      for (const radio of radios) {
        const label = radio.closest('label') || document.querySelector(`label[for="${radio.id}"]`);
        const labelText = (label as HTMLElement)?.innerText?.toLowerCase() || '';

        if (labelText.includes('registrado')) {
          (radio as HTMLInputElement).click();
          return { clicked: true, method: 'radio' };
        }
      }

      return { clicked: false };
    });

    if (registradoClicked.clicked) {
      console.log(`  ✓ "Soy un usuario registrado" seleccionado (${registradoClicked.method})`);
      await pseWindow.waitForTimeout(1000);
    } else {
      console.log('  ⚠ No se encontró opción "usuario registrado", puede que ya esté seleccionada');
    }

    await browserManager.takeScreenshot(pseWindow, 'flujo-08c-usuario-registrado');

    // ═══════════════════════════════════════════════════════════════
    // PASO 8.3: Llenar NIT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 8.3] Llenando NIT...');

    // Analizar los inputs disponibles
    const inputsInfo = await pseWindow.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])');
      const info: any[] = [];

      inputs.forEach(input => {
        const el = input as HTMLInputElement;
        const placeholder = el.placeholder || '';
        const name = el.name || '';
        const id = el.id || '';
        const label = document.querySelector(`label[for="${id}"]`) as HTMLLabelElement;
        const labelText = label?.innerText?.trim() || '';

        info.push({
          id, name, placeholder, labelText,
          visible: el.offsetParent !== null,
        });
      });

      return info;
    });

    console.log('  [DEBUG] Inputs encontrados:');
    inputsInfo.forEach((inp: any) => {
      if (inp.visible) {
        console.log(`    - id="${inp.id}" name="${inp.name}" placeholder="${inp.placeholder}" label="${inp.labelText}"`);
      }
    });

    // Llenar NIT
    const nitFilled = await pseWindow.evaluate((nit) => {
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])');

      for (const input of inputs) {
        const el = input as HTMLInputElement;

        // IMPORTANTE: Solo considerar campos visibles
        if (el.offsetParent === null) continue;

        const id = el.id?.toLowerCase() || '';
        const name = el.name?.toLowerCase() || '';
        const placeholder = el.placeholder?.toLowerCase() || '';
        const label = document.querySelector(`label[for="${el.id}"]`) as HTMLLabelElement;
        const labelText = label?.innerText?.toLowerCase() || '';

        // Buscar campo NIT (visible)
        if (id.includes('nit') || name.includes('nit') ||
            placeholder.includes('nit') || labelText.includes('nit')) {
          el.value = nit;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return { filled: true, field: id || name || 'nit' };
        }
      }

      return { filled: false };
    }, PSE_INFO.nit);

    if (nitFilled.filled) {
      console.log(`  ✓ NIT llenado: ${PSE_INFO.nit} (campo: ${nitFilled.field})`);
    } else {
      console.log('  ⚠ No se encontró campo NIT');
    }

    await pseWindow.waitForTimeout(500);

    // ═══════════════════════════════════════════════════════════════
    // PASO 8.4: Llenar Correo Electrónico
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 8.4] Llenando Correo Electrónico...');

    const emailFilled = await pseWindow.evaluate((email) => {
      const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input:not([type])');

      for (const input of inputs) {
        const el = input as HTMLInputElement;

        // IMPORTANTE: Solo considerar campos visibles
        if (el.offsetParent === null) continue;

        const id = el.id?.toLowerCase() || '';
        const name = el.name?.toLowerCase() || '';
        const placeholder = el.placeholder?.toLowerCase() || '';
        const label = document.querySelector(`label[for="${el.id}"]`) as HTMLLabelElement;
        const labelText = label?.innerText?.toLowerCase() || '';

        // Buscar campo de correo (visible)
        if (id.includes('email') || id.includes('correo') || id.includes('mail') ||
            name.includes('email') || name.includes('correo') || name.includes('mail') ||
            placeholder.includes('email') || placeholder.includes('correo') ||
            labelText.includes('correo') || labelText.includes('email') || labelText.includes('e-mail')) {
          el.value = email;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return { filled: true, field: id || name || 'email' };
        }
      }

      return { filled: false };
    }, PSE_INFO.email);

    if (emailFilled.filled) {
      console.log(`  ✓ Email llenado: ${PSE_INFO.email} (campo: ${emailFilled.field})`);
    } else {
      console.log('  ⚠ No se encontró campo de correo');
    }

    await pseWindow.waitForTimeout(1000);
    await browserManager.takeScreenshot(pseWindow, 'flujo-08d-formulario-llenado');

    // ═══════════════════════════════════════════════════════════════
    // PASO 8.5: Click en "Ir al Banco"
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 8.5] Haciendo click en "Ir al Banco"...');

    const irAlBancoClicked = await pseWindow.evaluate(() => {
      // Buscar botón "Ir al Banco"
      const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, a');

      for (const btn of buttons) {
        const text = (btn as HTMLElement).innerText?.toLowerCase() ||
                    (btn as HTMLInputElement).value?.toLowerCase() || '';

        if (text.includes('ir al banco') || text.includes('continuar') ||
            text === 'ir al banco' || text === 'continuar') {
          // Evitar "Regresar al comercio"
          if (text.includes('regresar') || text.includes('volver') || text.includes('cancelar')) {
            continue;
          }
          (btn as HTMLElement).click();
          return { clicked: true, text: (btn as HTMLElement).innerText?.trim() || (btn as HTMLInputElement).value };
        }
      }

      // Buscar botón por clase/estilo (el botón amarillo/naranja es el de continuar)
      const primaryButtons = document.querySelectorAll('.btn-primary, .btn-warning, [class*="primary"], [class*="continue"]');
      for (const btn of primaryButtons) {
        const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
        if (!text.includes('regresar') && !text.includes('cancelar')) {
          (btn as HTMLElement).click();
          return { clicked: true, text: (btn as HTMLElement).innerText?.trim() || 'Primary Button' };
        }
      }

      return { clicked: false };
    });

    if (irAlBancoClicked.clicked) {
      console.log(`  ✓ Click en "${irAlBancoClicked.text}"`);
    } else {
      console.log('  ⚠ No se encontró botón "Ir al Banco"');
    }

    // Esperar navegación a Bancolombia
    console.log('\n[PASO 8.6] Esperando redirección a Bancolombia...');

    await pseWindow.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await pseWindow.waitForTimeout(5000);

    // Verificar si llegamos a Bancolombia
    let currentUrl = pseWindow.url();
    console.log(`  → URL actual: ${currentUrl}`);

    await browserManager.takeScreenshot(pseWindow, 'flujo-08-pagina-banco');

    // Analizar página del banco
    const bankPageInfo = await pseWindow.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      return {
        isBancolombia: bodyText.includes('bancolombia'),
        isPSE: bodyText.includes('pse') || bodyText.includes('pagos seguros'),
        hasClaveField: !!document.querySelector('input[type="password"]'),
        hasUsuarioField: bodyText.includes('usuario') || bodyText.includes('documento'),
        url: window.location.href,
        title: document.title,
      };
    });

    console.log('\n  [INFO] Página actual:');
    console.log(`    - Título: ${bankPageInfo.title}`);
    console.log(`    - Es Bancolombia: ${bankPageInfo.isBancolombia}`);
    console.log(`    - Es PSE: ${bankPageInfo.isPSE}`);
    console.log(`    - Tiene campo clave: ${bankPageInfo.hasClaveField}`);

    // ═══════════════════════════════════════════════════════════════
    // PASO 9: CLICK EN "BANCOLOMBIA NEGOCIOS" Y LLENAR USUARIO
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 9] Seleccionando "Bancolombia Negocios" y llenando usuario...');

    // La página de Bancolombia tiene 3 opciones:
    // 1. Bancolombia Personas (naranja)
    // 2. Bancolombia Empresas (naranja)
    // 3. Bancolombia Negocios (verde) <-- ESTA ES LA QUE NECESITAMOS

    // Click en "Bancolombia Negocios"
    const negociosClicked = await pseWindow.evaluate(() => {
      // Buscar el card/botón de "Bancolombia Negocios"
      const allElements = document.querySelectorAll('*');

      for (const el of allElements) {
        const text = (el as HTMLElement).innerText?.trim() || '';

        // Buscar elemento que contenga "Bancolombia Negocios" o "Negocios"
        if (text.includes('Bancolombia Negocios') || text === 'Negocios') {
          // Verificar que sea clickeable (card, botón, link)
          const tagName = el.tagName.toLowerCase();
          const rect = el.getBoundingClientRect();

          // Debe tener tamaño razonable de un card
          if (rect.width > 100 && rect.height > 50) {
            (el as HTMLElement).click();
            return { clicked: true, text: text.substring(0, 50), method: 'text-match' };
          }
        }
      }

      // Método alternativo: buscar por el card verde (tiene clase o estilo diferente)
      const cards = document.querySelectorAll('div, a, button');
      for (const card of cards) {
        const cardText = (card as HTMLElement).innerText?.toLowerCase() || '';
        const hasNegocios = cardText.includes('negocios') && cardText.includes('bancolombia');

        if (hasNegocios) {
          const rect = card.getBoundingClientRect();
          // El card de Negocios tiene un indicador verde
          if (rect.width > 100 && rect.height > 50 && rect.width < 500) {
            (card as HTMLElement).click();
            return { clicked: true, text: 'Bancolombia Negocios card', method: 'card-search' };
          }
        }
      }

      // Método 3: Buscar el enlace con el chevron verde
      const links = document.querySelectorAll('a, [role="button"], [onclick]');
      for (const link of links) {
        const linkText = (link as HTMLElement).innerText?.toLowerCase() || '';
        if (linkText.includes('negocios') && !linkText.includes('personas') && !linkText.includes('empresas')) {
          (link as HTMLElement).click();
          return { clicked: true, text: (link as HTMLElement).innerText?.trim(), method: 'link-search' };
        }
      }

      return { clicked: false };
    });

    if (negociosClicked.clicked) {
      console.log(`  ✓ Click en "${negociosClicked.text}" (${negociosClicked.method})`);
      await pseWindow.waitForTimeout(3000);
      await browserManager.takeScreenshot(pseWindow, 'flujo-09a-bancolombia-negocios');
    } else {
      console.log('  ⚠ No se encontró opción "Bancolombia Negocios"');

      // Debug: mostrar opciones disponibles
      const pageOptions = await pseWindow.evaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.substring(0, 500);
      });
      console.log(`  [DEBUG] Contenido página: ${pageOptions.replace(/\s+/g, ' ').substring(0, 200)}...`);
    }

    // Esperar a que cargue la página de login de Negocios
    await pseWindow.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await pseWindow.waitForTimeout(2000);

    const negociosUrl = pseWindow.url();
    console.log(`  → URL después de click: ${negociosUrl}`);

    await browserManager.takeScreenshot(pseWindow, 'flujo-09b-login-negocios');

    // ═══════════════════════════════════════════════════════════════
    // PASO 9.1: LLENAR USUARIO BANCOLOMBIA
    // ═══════════════════════════════════════════════════════════════
    console.log('\n[PASO 9.1] Llenando usuario Bancolombia...');

    // Buscar campo de usuario y llenarlo
    const usuarioFilled = await pseWindow.evaluate((usuario) => {
      // Buscar campo de usuario por diferentes atributos
      const inputs = document.querySelectorAll('input[type="text"], input:not([type]), input[type="number"]');

      for (const input of inputs) {
        const el = input as HTMLInputElement;

        // Solo campos visibles
        if (el.offsetParent === null) continue;

        const id = el.id?.toLowerCase() || '';
        const name = el.name?.toLowerCase() || '';
        const placeholder = el.placeholder?.toLowerCase() || '';
        const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';

        // Buscar campo de usuario/documento
        if (id.includes('user') || id.includes('usuario') || id.includes('document') ||
            name.includes('user') || name.includes('usuario') || name.includes('document') ||
            placeholder.includes('user') || placeholder.includes('usuario') ||
            placeholder.includes('document') || placeholder.includes('ingres') ||
            ariaLabel.includes('user') || ariaLabel.includes('usuario')) {

          el.focus();
          el.value = usuario;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));

          return { filled: true, field: id || name || 'usuario', value: usuario };
        }
      }

      // Si no encontramos por atributos, buscar el primer input visible de texto
      for (const input of inputs) {
        const el = input as HTMLInputElement;
        if (el.offsetParent === null) continue;
        if (el.type === 'password' || el.type === 'hidden') continue;

        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 20) {
          el.focus();
          el.value = usuario;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));

          return { filled: true, field: 'first-visible-input', value: usuario };
        }
      }

      return { filled: false };
    }, BANCOLOMBIA_INFO.usuario);

    if (usuarioFilled.filled) {
      console.log(`  ✓ Usuario llenado: ${usuarioFilled.value} (campo: ${usuarioFilled.field})`);
    } else {
      console.log('  ⚠ No se encontró campo de usuario');

      // Debug: mostrar inputs disponibles
      const availableInputs = await pseWindow.evaluate(() => {
        const inputs = document.querySelectorAll('input');
        return Array.from(inputs).map(i => ({
          type: i.type,
          id: i.id,
          name: i.name,
          placeholder: i.placeholder,
          visible: (i as HTMLInputElement).offsetParent !== null,
        })).filter(i => i.visible);
      });
      console.log('  [DEBUG] Inputs visibles:', JSON.stringify(availableInputs, null, 2));
    }

    await pseWindow.waitForTimeout(1000);
    await browserManager.takeScreenshot(pseWindow, 'flujo-09c-usuario-llenado');

    // Obtener URL final
    currentUrl = pseWindow.url();

    // ═══════════════════════════════════════════════════════════════
    // FIN - LISTO PARA QUE EL USUARIO INGRESE CONTRASEÑA
    // ═══════════════════════════════════════════════════════════════
    console.log(`

═══════════════════════════════════════════════════════════════
   ✅  FLUJO COMPLETADO - LISTO PARA INGRESO DE CONTRASEÑA
═══════════════════════════════════════════════════════════════

URL Final: ${currentUrl}

El bot ha completado los siguientes pasos:
1. Login en Mi Planilla ✓
2. Generar/encontrar planilla ✓
3. Seleccionar PSE como medio de pago ✓
4. Seleccionar Bancolombia + Persona Jurídica ✓
5. Llenar formulario PSE (NIT + Email) ✓
6. Click "Ir al Banco" ✓
7. Seleccionar "Bancolombia Negocios" ✓
8. Llenar usuario: ${BANCOLOMBIA_INFO.usuario} ✓

🔐 ESPERANDO: El usuario debe ingresar su contraseña manualmente desde ULE

Revisa los screenshots en: ./screenshots/

Manteniendo navegador abierto por 120 segundos para que el usuario complete el login...
(Puedes cerrar manualmente o esperar)

`);

    await page.waitForTimeout(120000);

  } catch (error) {
    console.error('\n[ERROR]', error);
    // El screenshot de error ya se toma antes de lanzar la excepción
  } finally {
    console.log('✓ Cerrando navegador...');
    await browserManager.close();
  }
}

main().catch(console.error);
