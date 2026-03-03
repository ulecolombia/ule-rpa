/**
 * LIQUIDACIÓN SOI - Script mejorado
 * Completa los 4 pasos del wizard de liquidación
 * Mantiene navegador abierto
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

async function liquidar() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 LIQUIDACIÓN SOI - 4 PASOS                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();

  try {
    // Login
    console.log('📍 Login...');
    await authBot.login();
    const page = authBot.getPage();
    if (!page) throw new Error('No page');
    console.log('✅ Login OK\n');

    await page.waitForTimeout(2000);

    // Ir al wizard
    console.log('📍 Navegando al wizard de liquidación...');
    await clickByText(page, 'Gestionar Planillas');
    await page.waitForTimeout(1000);
    await clickByText(page, 'Activos');
    await page.waitForTimeout(1000);
    await clickByText(page, 'En línea');
    await page.waitForTimeout(2500);

    console.log('✅ En wizard de liquidación\n');

    // Completar 4 pasos
    for (let paso = 1; paso <= 4; paso++) {
      console.log(`═══════════════════════════════════════════════════════════`);
      console.log(`📋 PASO ${paso} de 4`);
      console.log(`═══════════════════════════════════════════════════════════\n`);

      await ss(page, `liquidar-paso${paso}-inicio`);

      // Detectar paso actual
      const info = await page.evaluate(() => {
        const stepText = document.body.innerText.match(/Paso\s*(\d)\s*de\s*4/i);
        const titulo = document.querySelector('fieldset legend, .titulo, h2')?.textContent?.trim();
        const allBtns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
        const btnTexts = allBtns.map(b => (b as HTMLElement).innerText?.trim() || (b as HTMLInputElement).value || '');

        return {
          paso: stepText ? stepText[1] : '?',
          titulo: titulo || 'No detectado',
          botones: btnTexts.filter(t => t.length > 0),
        };
      });

      console.log(`   Paso actual: ${info.paso}`);
      console.log(`   Título: ${info.titulo}`);
      console.log(`   Botones: ${info.botones.join(' | ')}`);

      // Llenar campos si es necesario
      const camposLlenados = await page.evaluate(() => {
        let count = 0;

        // Selects vacíos
        document.querySelectorAll('select').forEach(sel => {
          if (!sel.value || sel.value === 'SELECCIONE' || sel.value === '') {
            const opts = Array.from(sel.options);
            const valid = opts.find(o => o.value && o.value !== 'SELECCIONE' && o.value !== '' && o.value !== '0');
            if (valid) {
              sel.value = valid.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              count++;
            }
          }
        });

        // Checkboxes
        document.querySelectorAll('input[type="checkbox"]:not(:checked)').forEach(cb => {
          (cb as HTMLInputElement).checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          count++;
        });

        return count;
      });

      if (camposLlenados > 0) {
        console.log(`   Campos completados: ${camposLlenados}`);
      }

      await page.waitForTimeout(500);

      // Click en Siguiente/Liquidar/Finalizar
      const btnClick = await page.evaluate(() => {
        const allBtns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));

        // Buscar por prioridad
        const prioridades = ['liquidar', 'finalizar', 'confirmar', 'guardar', 'siguiente', 'continuar'];

        for (const prio of prioridades) {
          for (const btn of allBtns) {
            const texto = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').toLowerCase();
            if (texto.includes(prio)) {
              (btn as HTMLElement).click();
              return { ok: true, btn: texto.trim() };
            }
          }
        }

        return { ok: false };
      });

      if (btnClick.ok) {
        console.log(`   ✅ Click en: "${btnClick.btn}"\n`);
      } else {
        console.log(`   ⚠️ No se encontró botón. Intentando por índice...\n`);

        // Intentar click en el último botón visible (suele ser Siguiente)
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
          const lastBtn = btns[btns.length - 1];
          if (lastBtn) (lastBtn as HTMLElement).click();
        });
      }

      await page.waitForTimeout(3000);
      await ss(page, `liquidar-paso${paso}-fin`);

      // Verificar si terminamos
      const terminado = await page.evaluate(() => {
        const texto = document.body.innerText.toLowerCase();
        return texto.includes('exitosa') ||
               texto.includes('liquidada correctamente') ||
               texto.includes('completada') ||
               window.location.href.includes('inicio.do');
      });

      if (terminado) {
        console.log(`🎉 ¡LIQUIDACIÓN COMPLETADA!\n`);
        await ss(page, 'liquidar-completado');
        break;
      }
    }

    // Ir a Pendientes de pago
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 Navegando a Pendientes de pago...');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Click en casita (inicio)
    await page.evaluate(() => {
      const home = document.querySelector('[href*="inicio"], [title*="Inicio"], .home-icon, a svg');
      if (home) (home as HTMLElement).click();
    });
    await page.waitForTimeout(2000);

    await clickByText(page, 'Gestionar Planillas');
    await page.waitForTimeout(800);
    await clickByText(page, 'Activos');
    await page.waitForTimeout(800);
    await clickByText(page, 'Pendientes de pago');
    await page.waitForTimeout(2500);

    await ss(page, 'liquidar-pendientes-pago');
    console.log('✅ En página Pendientes de pago\n');

    // Buscar planilla
    const numeroPlanilla = '6008280827';
    console.log(`   Buscando planilla: ${numeroPlanilla}`);

    await page.evaluate((num) => {
      const input = document.querySelector('input[name*="planilla"], input[name*="numero"], input[type="text"]') as HTMLInputElement;
      if (input) {
        input.value = num;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, numeroPlanilla);

    // Click Buscar
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
    await ss(page, 'liquidar-resultado-busqueda');

    // Resumen
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESUMEN                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('📸 Screenshots en ./screenshots/liquidar-*.png');
    console.log('⚠️  Navegador abierto - No se cerró la sesión');
    console.log('\n   Esperando 60 segundos...\n');

    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('\n❌ Error:', error);
    const page = authBot.getPage();
    if (page) await ss(page, 'liquidar-error');
  }

  console.log('✅ Finalizado');
}

async function clickByText(page: any, text: string) {
  await page.evaluate((searchText: string) => {
    const elements = document.querySelectorAll('a, button, [onclick]');
    for (const el of elements) {
      const elText = (el as HTMLElement).innerText?.trim().toLowerCase() || '';
      if (elText === searchText.toLowerCase() || elText.includes(searchText.toLowerCase())) {
        (el as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, text);
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

liquidar().catch(console.error);
