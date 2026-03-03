/**
 * PAGO SOI - FLUJO FINAL CORRECTO
 *
 * 1. Dashboard → Click en botón $ verde (columna "Pagar")
 * 2. Página detalle → Scroll abajo → Click en logo PSE
 * 3. Formulario PSE → Llenar datos ULE
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

const PLANILLA_NUMERO = '6008280827';
const ULE_PSE = {
  tipoPersona: 'Jurídica',
  tipoDocumento: 'NIT',
  numeroDocumento: '9020190314',
  email: 'pagos.ule@gmail.com',
  banco: 'BANCOLOMBIA',
};

async function pagarFinal() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   💰 PAGO SOI - FLUJO FINAL                                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();

  let page = authBot.getPage();
  if (!page) {
    console.log('📍 Iniciando login...');
    await authBot.login();
    page = authBot.getPage();
    if (!page) throw new Error('No page');
    console.log('✅ Login OK\n');
    await page.waitForTimeout(2000);
  } else {
    console.log('✅ Usando sesión existente\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // PASO 1: Ir al Dashboard (inicio) donde está la tabla de planillas
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 1: Ir al Dashboard (inicio)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Click en casita (inicio)
  await page.evaluate(() => {
    const home = document.querySelector('a[href*="inicio"], [title*="Inicio"], img[src*="home"]') as HTMLElement;
    if (home) {
      const link = home.closest('a') || home;
      (link as HTMLElement).click();
    }
  });
  await page.waitForTimeout(3000);

  // Verificar que estamos en el dashboard
  const enDashboard = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    return texto.includes('bienvenido') || texto.includes('últimas planillas');
  });

  if (!enDashboard) {
    // Navegar manualmente al inicio
    await page.goto('https://servicio.nuevosoi.com.co/soi/inicio.do');
    await page.waitForTimeout(3000);
  }

  await ss(page, 'final-01-dashboard');
  console.log('✅ En Dashboard\n');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 2: Buscar y hacer click en el botón PAGAR ($) de la planilla
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 2: Click en botón Pagar ($) de planilla', PLANILLA_NUMERO);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Buscar la tabla "Últimas planillas disponibles"
  const clickPagar = await page.evaluate((numPlanilla) => {
    // Buscar todas las tablas
    const tables = document.querySelectorAll('table');

    for (const table of tables) {
      const rows = table.querySelectorAll('tr');

      for (const row of rows) {
        const rowText = row.textContent || '';

        // Buscar la fila que contiene el número de planilla
        if (rowText.includes(numPlanilla)) {
          console.log('Encontrada fila con planilla');

          // Buscar el botón de pagar en esta fila
          // Puede ser un <a> con imagen, o un botón con icono $
          const cells = row.querySelectorAll('td');

          for (const cell of cells) {
            // Buscar links o botones con iconos de pago
            const clickables = cell.querySelectorAll('a, button, img, [onclick]');

            for (const el of clickables) {
              const href = (el as HTMLAnchorElement).href || '';
              const onclick = el.getAttribute('onclick') || '';
              const src = (el as HTMLImageElement).src || '';
              const className = el.className || '';

              // Buscar por href que contenga "pago" o por imagen de pago
              if (href.includes('Pago') || href.includes('pago') ||
                  onclick.includes('pago') || onclick.includes('Pago') ||
                  src.includes('pago') || src.includes('ventanilla') ||
                  className.includes('pago')) {

                // Click en el elemento o su padre <a>
                const link = el.closest('a') || el;
                (link as HTMLElement).click();
                return { success: true, method: 'href/onclick', info: href || onclick || src };
              }
            }

            // Buscar cualquier botón/link en la columna "Pagar" (suele tener icono $)
            const link = cell.querySelector('a');
            if (link) {
              const linkHref = link.href || '';
              // Si el link tiene pago en la URL
              if (linkHref.includes('inicioPago') || linkHref.includes('Pago')) {
                link.click();
                return { success: true, method: 'link-pago', href: linkHref };
              }
            }
          }

          // Fallback: buscar por posición de columna
          // La columna "Pagar" suele estar después de Valor y Periodo
          // En tu screenshot es la columna 8 (0-indexed = 7)
          const pagarCell = cells[7] || cells[8]; // Columna Pagar
          if (pagarCell) {
            const link = pagarCell.querySelector('a, button, [onclick]') as HTMLElement;
            if (link) {
              link.click();
              return { success: true, method: 'column-position' };
            }
          }

          return { success: false, error: 'No encontró botón pagar en la fila' };
        }
      }
    }

    return { success: false, error: 'No encontró fila con la planilla' };
  }, PLANILLA_NUMERO);

  console.log('   Resultado click Pagar:', JSON.stringify(clickPagar));

  if (!clickPagar.success) {
    console.log('⚠️ Intentando método alternativo...');

    // Buscar directamente cualquier link que contenga "inicioPagoPlanillas"
    const fallbackClick = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="inicioPago"], a[href*="Pago"]');
      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        if (href.includes('inicioPago') || href.includes('PagoPlanilla')) {
          (link as HTMLElement).click();
          return { success: true, href };
        }
      }
      return { success: false };
    });

    console.log('   Fallback:', JSON.stringify(fallbackClick));
  }

  await page.waitForTimeout(3000);
  await ss(page, 'final-02-detalle-pago');

  // Verificar que llegamos a la página de detalle
  const enDetalle = await page.evaluate(() => {
    const url = window.location.href;
    const texto = document.body.innerText;
    return {
      url,
      esPaginaPago: url.includes('inicioPago') || url.includes('Pago'),
      tieneTotal: texto.includes('TOTAL POR PAGAR') || texto.includes('Total por Pagar'),
      tienePSE: texto.includes('PSE') || texto.includes('Pago PSE'),
    };
  });

  console.log(`\n   URL: ${enDetalle.url}`);
  console.log(`   ¿Es página de pago?: ${enDetalle.esPaginaPago}`);
  console.log(`   ¿Tiene TOTAL?: ${enDetalle.tieneTotal}`);
  console.log(`   ¿Tiene PSE?: ${enDetalle.tienePSE}\n`);

  if (!enDetalle.esPaginaPago) {
    console.log('❌ No llegamos a la página de pago. Verificar manualmente.');
    await page.waitForTimeout(60000);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PASO 3: Scroll abajo y click en botón PSE
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 3: Click en botón PSE');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Scroll al fondo
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(1000);

  await ss(page, 'final-03-seccion-pse');

  // Click en el logo/botón de PSE
  const clickPSE = await page.evaluate(() => {
    // Buscar el logo de PSE o el link de Pago PSE
    const elements = document.querySelectorAll('a, img, button, [onclick]');

    for (const el of elements) {
      const src = (el as HTMLImageElement).src || '';
      const alt = (el as HTMLImageElement).alt || '';
      const text = (el as HTMLElement).innerText || '';
      const href = (el as HTMLAnchorElement).href || '';
      const onclick = el.getAttribute('onclick') || '';

      // Buscar PSE
      const combined = `${src} ${alt} ${text} ${href} ${onclick}`.toLowerCase();

      if (combined.includes('pse')) {
        // Click en el elemento o su contenedor <a>
        const link = el.closest('a') || el;
        (link as HTMLElement).click();
        return { success: true, element: el.tagName, info: combined.substring(0, 100) };
      }
    }

    // Buscar por texto "Pago PSE"
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if ((el as HTMLElement).innerText?.trim() === 'Pago PSE') {
        const link = el.closest('a') || el.querySelector('a') || el;
        (link as HTMLElement).click();
        return { success: true, element: 'text-match', info: 'Pago PSE' };
      }
    }

    return { success: false };
  });

  console.log('   Resultado click PSE:', JSON.stringify(clickPSE));

  await page.waitForTimeout(3000);
  await ss(page, 'final-04-formulario-pse');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 4: Llenar formulario PSE
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 4: Llenar formulario PSE con datos ULE');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Verificar si estamos en el formulario PSE
  const enFormularioPSE = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    return texto.includes('tipo de persona') ||
           texto.includes('entidad financiera') ||
           texto.includes('banco') ||
           texto.includes('número de documento');
  });

  if (enFormularioPSE) {
    console.log('✅ En formulario PSE. Llenando datos...\n');

    const camposLlenados = await page.evaluate((uleData) => {
      const log: string[] = [];

      // Tipo de Persona -> Jurídica
      document.querySelectorAll('select').forEach(sel => {
        const name = (sel.name || sel.id || '').toLowerCase();
        const label = sel.closest('tr, div, label')?.textContent?.toLowerCase() || '';

        if (name.includes('persona') || label.includes('tipo de persona') || label.includes('tipo persona')) {
          const opt = Array.from(sel.options).find(o =>
            o.text.toLowerCase().includes('jurídica') || o.text.toLowerCase().includes('juridica')
          );
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            log.push(`✓ Tipo Persona: ${opt.text}`);
          }
        }

        // Tipo Documento -> NIT
        if (name.includes('tipo') && (name.includes('doc') || label.includes('documento'))) {
          const opt = Array.from(sel.options).find(o => o.text.includes('NIT'));
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            log.push(`✓ Tipo Doc: ${opt.text}`);
          }
        }

        // Banco -> Bancolombia
        if (name.includes('banco') || name.includes('entidad') || label.includes('banco') || label.includes('entidad financiera')) {
          const opt = Array.from(sel.options).find(o =>
            o.text.toLowerCase().includes('bancolombia')
          );
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            log.push(`✓ Banco: ${opt.text}`);
          }
        }
      });

      // Número de documento (NIT)
      document.querySelectorAll('input').forEach(inp => {
        const name = (inp.name || inp.id || '').toLowerCase();
        const label = inp.closest('tr, div, label')?.textContent?.toLowerCase() || '';

        if ((name.includes('numero') || name.includes('nit') || name.includes('document')) ||
            (label.includes('número') && label.includes('documento'))) {
          inp.value = uleData.numeroDocumento;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          log.push(`✓ Número Doc: ${uleData.numeroDocumento}`);
        }

        // Email
        if (name.includes('email') || name.includes('correo') || inp.type === 'email' ||
            label.includes('correo') || label.includes('email')) {
          inp.value = uleData.email;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          log.push(`✓ Email: ${uleData.email}`);
        }
      });

      return log;
    }, ULE_PSE);

    camposLlenados.forEach(l => console.log(`   ${l}`));

    await page.waitForTimeout(1000);
    await ss(page, 'final-05-formulario-lleno');

    // Mostrar botones disponibles
    const botones = await page.evaluate(() => {
      const btns = document.querySelectorAll('button, input[type="submit"], a.btn');
      return Array.from(btns).map(b =>
        (b as HTMLElement).innerText?.trim() || (b as HTMLInputElement).value || ''
      ).filter(t => t.length > 0);
    });

    console.log(`\n   Botones disponibles: ${botones.join(' | ')}`);
  } else {
    console.log('⚠️ No parece ser un formulario PSE estándar');
    await ss(page, 'final-05-pagina-actual');
  }

  // Resumen
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 RESUMEN FINAL                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const urlFinal = page.url();
  console.log(`   URL final: ${urlFinal}`);
  console.log('   📸 Screenshots en ./screenshots/final-*.png');
  console.log('   ⚠️  Navegador abierto - 60s para revisar\n');

  await page.waitForTimeout(60000);
  console.log('✅ Script finalizado');
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

pagarFinal().catch(console.error);
