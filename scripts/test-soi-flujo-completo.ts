/**
 * FLUJO COMPLETO SOI: Liquidación → Pago PSE
 *
 * IMPORTANTE: Mantiene el navegador abierto al final
 * Usa botón "Inicio" (casita) para navegar, no cierra sesión
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

const PLANILLA_NUMERO = '6008280827';

async function flujoCompleto() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🚀 FLUJO COMPLETO SOI: Liquidación → Pago PSE            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();

  try {
    // ═══════════════════════════════════════════════════════════
    // FASE 1: LOGIN (una sola vez)
    // ═══════════════════════════════════════════════════════════
    console.log('📍 FASE 1: Login único...');
    await authBot.login();
    const page = authBot.getPage();
    if (!page) throw new Error('No page');
    console.log('✅ Sesión iniciada - Mantendré el navegador abierto\n');

    await page.waitForTimeout(2000);

    // ═══════════════════════════════════════════════════════════
    // FASE 2: IR A LIQUIDACIÓN
    // ═══════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 FASE 2: Navegando al wizard de liquidación');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Navegar: Gestionar Planillas → Activos → En línea
    await clickMenu(page, 'gestionar planillas');
    await page.waitForTimeout(800);
    await clickMenu(page, 'activos');
    await page.waitForTimeout(800);
    await clickMenu(page, 'en línea');
    await page.waitForTimeout(2000);

    await ss(page, 'flujo-01-wizard');
    console.log('   ✅ En wizard de liquidación\n');

    // ═══════════════════════════════════════════════════════════
    // FASE 3: COMPLETAR 4 PASOS DE LIQUIDACIÓN
    // ═══════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 FASE 3: Completando liquidación (4 pasos)');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (let paso = 1; paso <= 4; paso++) {
      console.log(`\n   ┌─────────────────────────────────────┐`);
      console.log(`   │  PASO ${paso} de 4                         │`);
      console.log(`   └─────────────────────────────────────┘`);

      // Detectar paso actual
      const stepInfo = await page.evaluate(() => {
        const stepMatch = document.body.textContent?.match(/Paso\s*(\d)\s*de\s*4/i);
        const titulo = document.querySelector('h1, h2, .titulo, fieldset legend')?.textContent?.trim();
        return {
          currentStep: stepMatch ? parseInt(stepMatch[1]) : 0,
          titulo: titulo || 'No detectado',
        };
      });

      console.log(`   Título: ${stepInfo.titulo}`);
      console.log(`   Paso detectado: ${stepInfo.currentStep || 'Inicio'}`);

      // Completar campos obligatorios
      await page.evaluate(() => {
        // Seleccionar opciones en selects vacíos
        document.querySelectorAll('select').forEach(sel => {
          if (!sel.value || sel.value === 'SELECCIONE' || sel.value === '') {
            const validOpt = Array.from(sel.options).find(o =>
              o.value && o.value !== 'SELECCIONE' && o.value !== '' && o.value !== '0'
            );
            if (validOpt) {
              sel.value = validOpt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        });

        // Marcar checkboxes de términos
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          if (!(cb as HTMLInputElement).checked) {
            (cb as HTMLInputElement).checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });

      await ss(page, `flujo-paso${paso}-antes`);

      // Buscar y hacer click en el botón correcto
      const btnClicked = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, input[type="submit"], a.btn');
        const priorities = ['liquidar', 'finalizar', 'confirmar', 'guardar', 'siguiente', 'continuar'];

        for (const priority of priorities) {
          for (const btn of btns) {
            const text = (btn.textContent?.toLowerCase() || (btn as HTMLInputElement).value?.toLowerCase() || '');
            if (text.includes(priority)) {
              (btn as HTMLElement).click();
              return { clicked: true, btn: text.trim() };
            }
          }
        }
        return { clicked: false };
      });

      if (btnClicked.clicked) {
        console.log(`   Click: "${btnClicked.btn}" ✅`);
      } else {
        console.log(`   ⚠️ No se encontró botón para continuar`);
        break;
      }

      await page.waitForTimeout(3000);
      await ss(page, `flujo-paso${paso}-despues`);

      // Verificar si terminamos
      const finished = await page.evaluate(() => {
        const text = document.body.textContent?.toLowerCase() || '';
        return text.includes('exitosa') ||
               text.includes('liquidada') ||
               text.includes('correctamente') ||
               window.location.href.includes('inicio.do');
      });

      if (finished) {
        console.log(`\n   🎉 ¡LIQUIDACIÓN COMPLETADA!`);
        break;
      }
    }

    await ss(page, 'flujo-02-post-liquidacion');

    // ═══════════════════════════════════════════════════════════
    // FASE 4: IR A INICIO Y LUEGO A PENDIENTES DE PAGO
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 FASE 4: Navegando a Pendientes de pago');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Click en casita (Inicio)
    await page.evaluate(() => {
      const homeBtn = document.querySelector('a[href*="inicio"], [title*="inicio"], [title*="Inicio"], .home, [class*="home"]');
      if (homeBtn) (homeBtn as HTMLElement).click();
    });
    await page.waitForTimeout(2000);

    // Navegar a Pendientes de pago
    await clickMenu(page, 'gestionar planillas');
    await page.waitForTimeout(800);
    await clickMenu(page, 'activos');
    await page.waitForTimeout(800);
    await clickMenu(page, 'pendientes de pago');
    await page.waitForTimeout(2000);

    await ss(page, 'flujo-03-pendientes');
    console.log('   ✅ En página Pendientes de pago\n');

    // Buscar la planilla
    console.log(`   Buscando planilla: ${PLANILLA_NUMERO}`);

    await page.evaluate((numPlanilla) => {
      const input = document.querySelector('input[name*="planilla"], input[name*="numero"]') as HTMLInputElement;
      if (input) {
        input.value = numPlanilla;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, PLANILLA_NUMERO);

    // Click en Buscar
    await page.evaluate(() => {
      const btn = document.querySelector('button:has-text("Buscar"), input[value="Buscar"]');
      if (btn) (btn as HTMLElement).click();
    });

    await page.waitForTimeout(2500);
    await ss(page, 'flujo-04-busqueda');

    // Ver resultados
    const resultados = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      let found = false;
      rows.forEach(row => {
        if (row.textContent?.includes('LIQUID') || row.textContent?.match(/\d{9,}/)) {
          found = true;
        }
      });
      return { found, rowCount: rows.length };
    });

    console.log(`   Resultados: ${resultados.rowCount} filas, Planilla encontrada: ${resultados.found ? '✅' : '❌'}\n`);

    // ═══════════════════════════════════════════════════════════
    // FASE 5: FLUJO PSE (si hay planilla)
    // ═══════════════════════════════════════════════════════════
    if (resultados.found) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📍 FASE 5: Iniciando pago PSE');
      console.log('═══════════════════════════════════════════════════════════\n');

      // Seleccionar planilla
      await page.evaluate(() => {
        const cb = document.querySelector('table input[type="checkbox"]') as HTMLInputElement;
        if (cb) { cb.checked = true; cb.click(); }
      });

      // Buscar botón de pagar
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button, a, input[type="submit"]');
        for (const btn of btns) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('pagar') || text.includes('pse')) {
            (btn as HTMLElement).click();
            return;
          }
        }
      });

      await page.waitForTimeout(3000);
      await ss(page, 'flujo-05-pse');

      // Llenar formulario PSE con datos ULE
      console.log('   Llenando formulario PSE con datos ULE...');

      const pseFields = await page.evaluate(() => {
        let filled = 0;

        // Tipo Persona -> Jurídica
        document.querySelectorAll('select').forEach(sel => {
          const name = (sel.name || sel.id || '').toLowerCase();
          if (name.includes('persona') || name.includes('tipo')) {
            const opt = Array.from(sel.options).find(o => o.text.toLowerCase().includes('jurídica'));
            if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); filled++; }
          }
          if (name.includes('documento') || name.includes('doc')) {
            const opt = Array.from(sel.options).find(o => o.text.includes('NIT'));
            if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); filled++; }
          }
          if (name.includes('banco') || name.includes('entidad')) {
            const opt = Array.from(sel.options).find(o => o.text.toLowerCase().includes('bancolombia'));
            if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); filled++; }
          }
        });

        // NIT y Email
        document.querySelectorAll('input').forEach(inp => {
          const name = (inp.name || inp.id || '').toLowerCase();
          if (name.includes('numero') || name.includes('documento') || name.includes('nit')) {
            inp.value = '9020190314';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            filled++;
          }
          if (name.includes('email') || name.includes('correo')) {
            inp.value = 'pagos.ule@gmail.com';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            filled++;
          }
        });

        return filled;
      });

      console.log(`   Campos llenados: ${pseFields}`);
      await ss(page, 'flujo-06-pse-lleno');
    }

    // ═══════════════════════════════════════════════════════════
    // RESUMEN FINAL
    // ═══════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESUMEN                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const finalUrl = page.url();
    console.log(`   URL final: ${finalUrl}`);
    console.log('   📸 Screenshots en ./screenshots/flujo-*.png');
    console.log('\n   ⚠️  NAVEGADOR ABIERTO - No se cerró la sesión');
    console.log('   💡 Puedes continuar navegando manualmente si lo deseas\n');

    // NO cerrar el navegador - mantener sesión abierta
    console.log('   Esperando 30 segundos antes de continuar...');
    console.log('   (Presiona Ctrl+C si quieres mantener el navegador abierto indefinidamente)\n');

    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ Error:', error);
    const page = authBot.getPage();
    if (page) await ss(page, 'flujo-error');
  }

  // NO llamamos resetSOIAuthBot() para mantener el navegador abierto
  console.log('✅ Script finalizado - Navegador permanece abierto');
}

async function clickMenu(page: any, menuText: string) {
  await page.evaluate((text: string) => {
    const links = document.querySelectorAll('a, button, [onclick]');
    for (const link of links) {
      const linkText = link.textContent?.trim().toLowerCase() || '';
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

flujoCompleto().catch(console.error);
