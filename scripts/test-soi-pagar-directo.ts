/**
 * PAGO DIRECTO SOI
 * Busca la planilla en Pendientes de pago y hace click en el botón "Pagar"
 * Luego completa el formulario PSE con datos ULE
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

const PLANILLA_NUMERO = '6008280827';
const ULE_DATA = {
  tipoPersona: 'Jurídica',
  tipoDocumento: 'NIT',
  numeroDocumento: '9020190314', // Sin guión
  email: 'pagos.ule@gmail.com',
  banco: 'BANCOLOMBIA',
};

async function pagarDirecto() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   💰 PAGO DIRECTO SOI - Click en botón Pagar               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();

  // Login
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

  // Ir a Pendientes de pago
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 Navegando a Pendientes de pago');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Click en inicio primero
  await page.evaluate(() => {
    const home = document.querySelector('a[href*="inicio"], [title*="Inicio"]') as HTMLElement;
    if (home) home.click();
  });
  await page.waitForTimeout(2000);

  await clickMenu(page, 'gestionar planillas');
  await page.waitForTimeout(800);
  await clickMenu(page, 'activos');
  await page.waitForTimeout(800);
  await clickMenu(page, 'pendientes de pago');
  await page.waitForTimeout(2500);

  await ss(page, 'pagar-01-pendientes');
  console.log('✅ En Pendientes de pago\n');

  // Buscar planilla
  console.log(`📍 Buscando planilla: ${PLANILLA_NUMERO}`);

  await page.evaluate((num) => {
    const inputs = document.querySelectorAll('input[type="text"]');
    for (const input of inputs) {
      const inp = input as HTMLInputElement;
      inp.value = num;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      break;
    }
  }, PLANILLA_NUMERO);

  // Click en Buscar
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
    for (const btn of btns) {
      const texto = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').toLowerCase();
      if (texto.includes('buscar')) {
        (btn as HTMLElement).click();
        return;
      }
    }
  });

  await page.waitForTimeout(2500);
  await ss(page, 'pagar-02-resultado');

  // Verificar que encontramos la planilla
  const planillaEncontrada = await page.evaluate((numPlanilla) => {
    const rows = document.querySelectorAll('table tbody tr');
    for (const row of rows) {
      if (row.textContent?.includes(numPlanilla)) {
        return true;
      }
    }
    return false;
  }, PLANILLA_NUMERO);

  if (!planillaEncontrada) {
    console.log('❌ Planilla no encontrada en la tabla');
    await ss(page, 'pagar-error-no-encontrada');
    return;
  }

  console.log('✅ Planilla encontrada\n');

  // Click en el botón/ícono de PAGAR
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 Haciendo click en botón PAGAR');
  console.log('═══════════════════════════════════════════════════════════\n');

  const clickResult = await page.evaluate((numPlanilla) => {
    const rows = document.querySelectorAll('table tbody tr');

    for (const row of rows) {
      if (row.textContent?.includes(numPlanilla)) {
        // Buscar el botón/link de pagar en esta fila
        const links = row.querySelectorAll('a, button, [onclick], img');

        for (const link of links) {
          const el = link as HTMLElement;
          const texto = el.innerText?.toLowerCase() || '';
          const title = el.getAttribute('title')?.toLowerCase() || '';
          const onclick = el.getAttribute('onclick')?.toLowerCase() || '';
          const alt = (el as HTMLImageElement).alt?.toLowerCase() || '';
          const src = (el as HTMLImageElement).src?.toLowerCase() || '';

          // Buscar cualquier referencia a pagar/pse
          if (texto.includes('pagar') || title.includes('pagar') ||
              onclick.includes('pagar') || onclick.includes('pse') ||
              alt.includes('pagar') || src.includes('pagar') || src.includes('pse')) {
            el.click();
            return { clicked: true, type: 'pagar', info: texto || title || alt || 'ícono' };
          }
        }

        // Si no encontró "pagar", buscar el ícono verde (PSE) - suele ser una imagen
        const imgs = row.querySelectorAll('img');
        for (const img of imgs) {
          const src = img.src || '';
          const alt = img.alt || '';
          // Buscar imagen de PSE o pago
          if (src.includes('pse') || src.includes('pago') || src.includes('pay') ||
              alt.includes('pse') || alt.includes('pago')) {
            (img as HTMLElement).click();
            return { clicked: true, type: 'img-pse', info: src };
          }
        }

        // Intentar click en cualquier link en las columnas de acción (después del estado)
        const cells = row.querySelectorAll('td');
        // Las columnas de acción suelen estar después del estado (columna 8 en adelante)
        for (let i = 8; i < cells.length; i++) {
          const cell = cells[i];
          const clickable = cell.querySelector('a, img, button, [onclick]') as HTMLElement;
          if (clickable) {
            // Verificar que no sea "Abrir" o "Deshabilitar"
            const txt = (clickable.innerText || clickable.getAttribute('title') || '').toLowerCase();
            if (!txt.includes('abrir') && !txt.includes('deshabilitar') && !txt.includes('eliminar')) {
              clickable.click();
              return { clicked: true, type: 'action-cell', info: `columna ${i}` };
            }
          }
        }

        return { clicked: false, error: 'No se encontró botón de pagar' };
      }
    }

    return { clicked: false, error: 'Fila no encontrada' };
  }, PLANILLA_NUMERO);

  console.log('   Resultado click:', JSON.stringify(clickResult));

  if (!clickResult.clicked) {
    // Intentar click directo en la columna "Pagar" por índice
    console.log('   Intentando click por índice de columna...');

    const fallbackClick = await page.evaluate((numPlanilla) => {
      const rows = document.querySelectorAll('table tbody tr');
      for (const row of rows) {
        if (row.textContent?.includes(numPlanilla)) {
          const cells = row.querySelectorAll('td');
          // Columna 11 es "Pagar" según la tabla (0-indexed = 10)
          for (let i = 9; i <= 12; i++) {
            if (cells[i]) {
              const el = cells[i].querySelector('a, img, [onclick]') as HTMLElement;
              if (el) {
                el.click();
                return { clicked: true, column: i };
              }
            }
          }
        }
      }
      return { clicked: false };
    }, PLANILLA_NUMERO);

    console.log('   Fallback:', JSON.stringify(fallbackClick));
  }

  await page.waitForTimeout(3000);
  await ss(page, 'pagar-03-despues-click');

  // Verificar si llegamos al formulario PSE
  const enFormularioPSE = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    return {
      esPSE: texto.includes('pse') || texto.includes('tipo de persona') ||
             texto.includes('banco') || texto.includes('entidad financiera'),
      url: window.location.href,
      titulo: document.querySelector('h1, h2, .titulo')?.textContent?.trim() || 'No detectado',
    };
  });

  console.log(`\n   URL: ${enFormularioPSE.url}`);
  console.log(`   Título: ${enFormularioPSE.titulo}`);
  console.log(`   Es formulario PSE: ${enFormularioPSE.esPSE ? '✅ SÍ' : '❌ NO'}\n`);

  if (enFormularioPSE.esPSE) {
    // Llenar formulario PSE
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 Llenando formulario PSE con datos ULE');
    console.log('═══════════════════════════════════════════════════════════\n');

    await ss(page, 'pagar-04-formulario-pse');

    const camposLlenados = await page.evaluate((uleData) => {
      let filled = 0;
      const log: string[] = [];

      // Tipo de Persona -> Jurídica
      document.querySelectorAll('select').forEach(sel => {
        const name = (sel.name || sel.id || '').toLowerCase();
        const label = sel.closest('tr, div')?.textContent?.toLowerCase() || '';

        if (name.includes('persona') || label.includes('tipo de persona') || label.includes('tipo persona')) {
          const opt = Array.from(sel.options).find(o =>
            o.text.toLowerCase().includes('jurídica') || o.text.toLowerCase().includes('juridica')
          );
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
            log.push(`Tipo Persona: ${opt.text}`);
          }
        }

        // Tipo Documento -> NIT
        if (name.includes('documento') || name.includes('doc') || label.includes('tipo de documento')) {
          const opt = Array.from(sel.options).find(o => o.text.includes('NIT'));
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
            log.push(`Tipo Doc: ${opt.text}`);
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
            filled++;
            log.push(`Banco: ${opt.text}`);
          }
        }
      });

      // Número de documento (NIT)
      document.querySelectorAll('input').forEach(inp => {
        const name = (inp.name || inp.id || '').toLowerCase();
        const label = inp.closest('tr, div')?.textContent?.toLowerCase() || '';

        if ((name.includes('numero') && name.includes('doc')) || name.includes('nit') ||
            (label.includes('número') && label.includes('documento'))) {
          inp.value = uleData.numeroDocumento;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          filled++;
          log.push(`NIT: ${uleData.numeroDocumento}`);
        }

        // Email
        if (name.includes('email') || name.includes('correo') || inp.type === 'email' ||
            label.includes('correo') || label.includes('email')) {
          inp.value = uleData.email;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          filled++;
          log.push(`Email: ${uleData.email}`);
        }
      });

      return { filled, log };
    }, ULE_DATA);

    console.log(`   Campos llenados: ${camposLlenados.filled}`);
    camposLlenados.log.forEach(l => console.log(`   - ${l}`));

    await page.waitForTimeout(1000);
    await ss(page, 'pagar-05-formulario-lleno');

    // Buscar botón de continuar/pagar
    const btnInfo = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn'));
      return btns.map(b => (b as HTMLElement).innerText?.trim() || (b as HTMLInputElement).value || '').filter(t => t.length > 0);
    });

    console.log(`\n   Botones disponibles: ${btnInfo.join(' | ')}`);
  }

  // Resumen final
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 RESUMEN                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('📸 Screenshots en ./screenshots/pagar-*.png');
  console.log('⚠️  Navegador abierto');
  console.log('\n   Esperando 60 segundos para revisar...\n');

  await page.waitForTimeout(60000);

  console.log('✅ Finalizado');
}

async function clickMenu(page: any, menuText: string) {
  await page.evaluate((text: string) => {
    const links = document.querySelectorAll('a, button, [onclick], li');
    for (const link of links) {
      const linkText = (link as HTMLElement).innerText?.trim().toLowerCase() || '';
      if (linkText === text || linkText.includes(text)) {
        (link as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, menuText.toLowerCase());
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

pagarDirecto().catch(console.error);
