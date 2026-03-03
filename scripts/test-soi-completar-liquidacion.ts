/**
 * Script para completar la liquidación de una planilla GUARDADA en SOI
 * Después de liquidar, la planilla quedará lista para pagar vía PSE
 */

import { getSOIAuthBot, resetSOIAuthBot } from '../src/bots/soi/auth.bot';

async function completarLiquidacion() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 COMPLETAR LIQUIDACIÓN - SOI                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();
  let step = 0;

  try {
    // Login
    console.log('📍 Login...');
    await authBot.login();
    const page = authBot.getPage();
    if (!page) throw new Error('No page');
    console.log('✅ Login OK\n');

    await page.waitForTimeout(2000);
    await ss(page, 'liq-01-dashboard');

    // Ver info de planilla en dashboard
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 DASHBOARD - Planillas disponibles');
    console.log('═══════════════════════════════════════════════════════════\n');

    const planillaInfo = await page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return null;

      const rows = table.querySelectorAll('tbody tr');
      const planillas: any[] = [];

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
          const checkbox = cells[0]?.querySelector('input[type="checkbox"]');
          planillas.push({
            numero: cells[1]?.textContent?.trim(),
            tipo: cells[2]?.textContent?.trim(),
            estado: cells[3]?.textContent?.trim(),
            valor: cells[5]?.textContent?.trim(),
            periodo: cells[6]?.textContent?.trim(),
            hasCheckbox: !!checkbox,
          });
        }
      });

      return planillas;
    });

    if (planillaInfo && planillaInfo.length > 0) {
      console.log('   Planillas encontradas:');
      planillaInfo.forEach((p, i) => {
        console.log(`   ${i+1}. ${p.numero} | ${p.estado} | ${p.valor} | ${p.periodo}`);
      });
      console.log('');
    }

    // Click en el botón Pagar/Abrir de la primera planilla GUARDADA
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 INICIANDO LIQUIDACIÓN');
    console.log('═══════════════════════════════════════════════════════════\n');

    const clickResult = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');

      for (const row of rows) {
        const estado = row.textContent?.toLowerCase() || '';

        // Buscar planilla GUARDADA
        if (estado.includes('guardada')) {
          // Click en el botón de la columna "Pagar" o "Abrir"
          const cells = row.querySelectorAll('td');

          // Columna Pagar (índice 7) o Abrir (índice 8)
          for (let i = 6; i < cells.length; i++) {
            const btn = cells[i]?.querySelector('button, a, svg, [onclick]');
            if (btn) {
              (btn as HTMLElement).click();
              return { clicked: true, column: i };
            }
          }
        }
      }
      return { clicked: false };
    });

    console.log('   Click en planilla:', clickResult.clicked ? '✅' : '❌');

    await page.waitForTimeout(3000);
    await ss(page, 'liq-02-despues-click');

    // Detectar en qué página estamos
    const currentPage = await page.evaluate(() => {
      const url = window.location.href;
      const title = document.querySelector('h1, h2, .titulo, .title')?.textContent?.trim();
      const stepIndicator = document.body.textContent?.match(/Paso\s*(\d)\s*de\s*(\d)/i);

      return {
        url,
        title: title || document.title,
        step: stepIndicator ? parseInt(stepIndicator[1]) : 0,
        totalSteps: stepIndicator ? parseInt(stepIndicator[2]) : 0,
      };
    });

    console.log(`\n   URL: ${currentPage.url}`);
    console.log(`   Página: ${currentPage.title}`);
    console.log(`   Paso: ${currentPage.step} de ${currentPage.totalSteps || '?'}\n`);

    // Si estamos en el wizard de liquidación, completar los pasos
    if (currentPage.url.includes('crear') || currentPage.url.includes('Crear') ||
        currentPage.title?.toLowerCase().includes('crear') ||
        currentPage.step > 0) {

      console.log('═══════════════════════════════════════════════════════════');
      console.log('📍 WIZARD DE LIQUIDACIÓN');
      console.log('═══════════════════════════════════════════════════════════\n');

      // Completar hasta 4 pasos
      for (step = 1; step <= 4; step++) {
        console.log(`\n📋 PASO ${step}/4`);

        // Analizar campos del paso actual
        const stepInfo = await page.evaluate(() => {
          const selects = Array.from(document.querySelectorAll('select')).map(s => ({
            name: s.name || s.id,
            value: s.value,
            required: s.required,
          }));

          const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])')).map(i => ({
            name: (i as HTMLInputElement).name || (i as HTMLInputElement).id,
            type: (i as HTMLInputElement).type,
            value: (i as HTMLInputElement).value,
          }));

          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'))
            .map(b => b.textContent?.trim() || (b as HTMLInputElement).value)
            .filter(t => t && t.length > 1);

          const messages = Array.from(document.querySelectorAll('.alert, .error, .warning, .mensaje'))
            .map(m => m.textContent?.trim())
            .filter(Boolean);

          return { selects, inputs, buttons, messages };
        });

        console.log(`   Selects: ${stepInfo.selects.length}`);
        stepInfo.selects.slice(0, 5).forEach(s => {
          console.log(`     - ${s.name}: ${s.value || 'vacío'}`);
        });

        if (stepInfo.messages.length > 0) {
          console.log(`   Mensajes:`);
          stepInfo.messages.forEach(m => console.log(`     ⚠️ ${m?.substring(0, 80)}`));
        }

        console.log(`   Botones: ${stepInfo.buttons.join(', ')}`);

        await ss(page, `liq-step-${step}`);

        // Intentar completar campos requeridos si están vacíos
        await page.evaluate(() => {
          // Seleccionar primera opción válida en selects vacíos
          document.querySelectorAll('select').forEach(select => {
            if (!select.value || select.value === 'SELECCIONE' || select.value === '') {
              const options = Array.from(select.options);
              const validOption = options.find(opt =>
                opt.value && opt.value !== 'SELECCIONE' && opt.value !== '' && opt.value !== '0'
              );
              if (validOption) {
                select.value = validOption.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          });

          // Marcar checkboxes de aceptación
          document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const label = cb.closest('label')?.textContent?.toLowerCase() || '';
            const name = (cb as HTMLInputElement).name?.toLowerCase() || '';
            if (label.includes('acepto') || label.includes('autorizo') ||
                name.includes('acepto') || name.includes('termino')) {
              (cb as HTMLInputElement).checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        });

        // Click en Siguiente/Liquidar/Finalizar
        const nextClicked = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button, input[type="submit"], a.btn');

          // Prioridad: Liquidar > Finalizar > Siguiente > Continuar
          const priorities = ['liquidar', 'finalizar', 'confirmar', 'siguiente', 'continuar', 'next'];

          for (const priority of priorities) {
            for (const btn of buttons) {
              const text = (btn.textContent?.toLowerCase() || (btn as HTMLInputElement).value?.toLowerCase() || '');
              if (text.includes(priority)) {
                (btn as HTMLElement).click();
                return { clicked: true, button: text.trim() };
              }
            }
          }
          return { clicked: false };
        });

        console.log(`   Click: ${nextClicked.clicked ? `✅ "${nextClicked.button}"` : '❌'}`);

        if (!nextClicked.clicked) {
          console.log('   ⚠️ No se encontró botón para continuar');
          break;
        }

        await page.waitForTimeout(3000);

        // Verificar si terminamos
        const afterStep = await page.evaluate(() => {
          const url = window.location.href;
          const hasSuccess = document.body.textContent?.toLowerCase().includes('exitosa') ||
                            document.body.textContent?.toLowerCase().includes('liquidada') ||
                            document.querySelector('.alert-success') !== null;
          const backToDashboard = url.includes('inicio.do');

          return { url, hasSuccess, backToDashboard };
        });

        if (afterStep.hasSuccess) {
          console.log('\n   🎉 LIQUIDACIÓN COMPLETADA EXITOSAMENTE');
          break;
        }

        if (afterStep.backToDashboard) {
          console.log('\n   ↩️ Regresamos al dashboard');
          break;
        }
      }
    }

    // Verificar estado final
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 ESTADO FINAL');
    console.log('═══════════════════════════════════════════════════════════\n');

    await ss(page, 'liq-final');

    const finalState = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        hasPagarButton: !!document.querySelector('button:has-text("Pagar"), a:has-text("PSE")'),
        planillaStatus: document.body.textContent?.match(/Estado:\s*(\w+)/i)?.[1],
        successMessage: document.querySelector('.alert-success, .mensaje-exito')?.textContent?.trim(),
      };
    });

    console.log('   URL:', finalState.url);
    console.log('   Estado planilla:', finalState.planillaStatus || 'No detectado');
    console.log('   Mensaje éxito:', finalState.successMessage || 'No detectado');
    console.log('   Botón Pagar:', finalState.hasPagarButton ? '✅ Visible' : '❌ No visible');

    // Resumen
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESUMEN                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`✅ Pasos completados: ${step}`);
    console.log('📸 Screenshots guardados en ./screenshots/liq-*.png');

  } catch (error) {
    console.error('\n❌ Error:', error);
    const page = authBot.getPage();
    if (page) await ss(page, 'liq-error');
  } finally {
    console.log('\n🔄 Cerrando navegador...');
    await resetSOIAuthBot();
    console.log('✅ Cerrado');
  }
}

async function ss(page: any, name: string) {
  try {
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  } catch (e) {
    // ignore
  }
}

completarLiquidacion().catch(console.error);
