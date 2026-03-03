/**
 * Script para explorar "Pendientes de pago" - Planillas listas para PSE
 * Ruta: Gestionar Planillas → Activos → Pendientes de pago
 */

import { getSOIAuthBot, resetSOIAuthBot } from '../src/bots/soi/auth.bot';

async function testPendientesPago() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 PENDIENTES DE PAGO - Planillas listas para PSE        ║');
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

    // Navegar: Gestionar Planillas → Activos → Pendientes de pago
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 Navegando a: Pendientes de pago');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Click en Gestionar Planillas
    await page.evaluate(() => {
      const links = document.querySelectorAll('a, [onclick]');
      for (const link of links) {
        if (link.textContent?.trim().toLowerCase() === 'gestionar planillas') {
          (link as HTMLElement).click();
          return;
        }
      }
    });
    await page.waitForTimeout(1000);

    // Click en Activos
    await page.evaluate(() => {
      const links = document.querySelectorAll('a, [onclick]');
      for (const link of links) {
        if (link.textContent?.trim().toLowerCase() === 'activos') {
          (link as HTMLElement).click();
          return;
        }
      }
    });
    await page.waitForTimeout(1000);

    // Click en Pendientes de pago
    const pendientesClicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a, [onclick]');
      for (const link of links) {
        const text = link.textContent?.trim().toLowerCase() || '';
        if (text.includes('pendientes') && text.includes('pago')) {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    console.log('   Click en Pendientes de pago:', pendientesClicked ? '✅' : '❌');
    await page.waitForTimeout(2500);
    await ss(page, 'pendientes-01-pagina');

    // Analizar página
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 Análisis de página "Pendientes de pago"');
    console.log('═══════════════════════════════════════════════════════════\n');

    const pageInfo = await page.evaluate(() => {
      const body = document.body.textContent?.toLowerCase() || '';
      return {
        url: window.location.href,
        title: document.querySelector('h1, h2, .titulo')?.textContent?.trim(),
        hasPSE: body.includes('pse'),
        hasBanco: body.includes('banco'),
        hasLiquidada: body.includes('liquidada'),
        hasPendiente: body.includes('pendiente'),
        tables: document.querySelectorAll('table').length,
        forms: document.querySelectorAll('form').length,
        checkboxes: document.querySelectorAll('input[type="checkbox"]').length,
      };
    });

    console.log('   URL:', pageInfo.url);
    console.log('   Título:', pageInfo.title || document.title);
    console.log('   ¿PSE?:', pageInfo.hasPSE ? '✅' : '❌');
    console.log('   ¿Banco?:', pageInfo.hasBanco ? '✅' : '❌');
    console.log('   ¿Liquidada?:', pageInfo.hasLiquidada ? '✅' : '❌');
    console.log('   ¿Pendiente?:', pageInfo.hasPendiente ? '✅' : '❌');
    console.log('   Tablas:', pageInfo.tables);
    console.log('   Checkboxes:', pageInfo.checkboxes);

    // Buscar planillas pendientes de pago
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 Buscando planillas pendientes de pago');
    console.log('═══════════════════════════════════════════════════════════\n');

    const planillas = await page.evaluate(() => {
      const data: { numero: string; estado: string; valor: string; periodo: string }[] = [];
      const rows = document.querySelectorAll('table tbody tr, table tr');

      rows.forEach(row => {
        const text = row.textContent || '';
        const numero = text.match(/\d{9,}/)?.[0];
        const valor = text.match(/\$\s*[\d.,]+/)?.[0];
        const periodo = text.match(/20\d{2}-\d{2}|ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE/i)?.[0];
        const estado = text.match(/(LIQUIDADA|PENDIENTE|PAGADA|GUARDADA)/i)?.[0];

        if (numero) {
          data.push({
            numero,
            estado: estado || 'N/A',
            valor: valor || 'N/A',
            periodo: periodo || 'N/A'
          });
        }
      });

      return data.slice(0, 10);
    });

    if (planillas.length > 0) {
      console.log('   Planillas encontradas:');
      planillas.forEach((p, i) => {
        console.log(`   ${i+1}. ${p.numero} | ${p.estado} | ${p.valor} | ${p.periodo}`);
      });
    } else {
      console.log('   ⚠️ No se encontraron planillas pendientes de pago');
      console.log('   (Puede que no haya planillas liquidadas aún)');
    }

    // Si hay planillas, seleccionar una y buscar botón de pago
    if (pageInfo.checkboxes > 0 || planillas.length > 0) {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('📍 Seleccionando planilla y buscando opción de pago');
      console.log('═══════════════════════════════════════════════════════════\n');

      // Seleccionar primer checkbox
      await page.evaluate(() => {
        const cb = document.querySelector('table input[type="checkbox"]:not(:checked)') as HTMLInputElement;
        if (cb) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          cb.click();
        }
      });
      await page.waitForTimeout(500);
      await ss(page, 'pendientes-02-seleccionada');

      // Buscar botones de pago
      const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, input[type="submit"], a.btn, [onclick]'))
          .map(b => ({
            text: b.textContent?.trim() || (b as HTMLInputElement).value,
            tag: b.tagName,
          }))
          .filter(b => b.text && b.text.length > 1 && b.text.length < 50)
          .slice(0, 15);
      });

      console.log('   Botones disponibles:');
      buttons.forEach(b => console.log(`   - [${b.tag}] ${b.text}`));

      // Click en botón de pago si existe
      const pagarClicked = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, input[type="submit"], a.btn, a');
        for (const btn of btns) {
          const text = (btn.textContent?.toLowerCase() || (btn as HTMLInputElement).value?.toLowerCase() || '');
          if (text.includes('pagar') || text.includes('pse') || text.includes('continuar')) {
            (btn as HTMLElement).click();
            return { clicked: true, text: btn.textContent?.trim() };
          }
        }
        return { clicked: false };
      });

      console.log('\n   Click Pagar/PSE:', pagarClicked.clicked ? `✅ "${pagarClicked.text}"` : '❌');

      if (pagarClicked.clicked) {
        await page.waitForTimeout(3000);
        await ss(page, 'pendientes-03-pago');

        // Analizar página de pago
        const pagoInfo = await page.evaluate(() => {
          const body = document.body.textContent?.toLowerCase() || '';
          return {
            url: window.location.href,
            hasPSE: body.includes('pse'),
            hasBanco: body.includes('banco') || body.includes('entidad financiera'),
            hasNIT: body.includes('nit'),
            hasEmail: body.includes('correo') || body.includes('email'),
            hasTipoPersona: body.includes('tipo de persona') || body.includes('jurídica'),
            selects: Array.from(document.querySelectorAll('select')).map(s => s.name || s.id).filter(Boolean),
            inputs: Array.from(document.querySelectorAll('input:not([type="hidden"])')).map(i =>
              (i as HTMLInputElement).name || (i as HTMLInputElement).id
            ).filter(Boolean),
          };
        });

        console.log('\n   📄 Página de pago PSE:');
        console.log('   URL:', pagoInfo.url);
        console.log('   ¿PSE?:', pagoInfo.hasPSE ? '✅' : '❌');
        console.log('   ¿Banco?:', pagoInfo.hasBanco ? '✅' : '❌');
        console.log('   ¿NIT?:', pagoInfo.hasNIT ? '✅' : '❌');
        console.log('   ¿Email?:', pagoInfo.hasEmail ? '✅' : '❌');
        console.log('   ¿Tipo Persona?:', pagoInfo.hasTipoPersona ? '✅' : '❌');
        console.log('   Selects:', pagoInfo.selects.join(', ') || 'Ninguno');
        console.log('   Inputs:', pagoInfo.inputs.join(', ') || 'Ninguno');

        // Si es formulario PSE, llenarlo con datos de ULE
        if (pagoInfo.hasPSE || pagoInfo.hasBanco || pagoInfo.hasTipoPersona) {
          console.log('\n   🔧 Llenando formulario PSE con datos ULE...');

          const filled = await page.evaluate(() => {
            let count = 0;

            // Tipo Persona -> Jurídica
            document.querySelectorAll('select').forEach(sel => {
              const name = sel.name?.toLowerCase() || sel.id?.toLowerCase() || '';
              if (name.includes('persona') || name.includes('tipo')) {
                const opt = Array.from(sel.options).find(o => o.text.toLowerCase().includes('jurídica'));
                if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); count++; }
              }
              if (name.includes('documento') || name.includes('doc')) {
                const opt = Array.from(sel.options).find(o => o.text.includes('NIT'));
                if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); count++; }
              }
              if (name.includes('banco') || name.includes('entidad')) {
                const opt = Array.from(sel.options).find(o => o.text.toLowerCase().includes('bancolombia'));
                if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); count++; }
              }
            });

            // NIT y Email
            document.querySelectorAll('input').forEach(inp => {
              const name = inp.name?.toLowerCase() || inp.id?.toLowerCase() || '';
              if (name.includes('numero') || name.includes('documento') || name.includes('nit')) {
                inp.value = '9020190314';
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                count++;
              }
              if (name.includes('email') || name.includes('correo')) {
                inp.value = 'pagos.ule@gmail.com';
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                count++;
              }
            });

            return count;
          });

          console.log(`   Campos llenados: ${filled}`);
          await ss(page, 'pendientes-04-form-pse');
        }
      }
    }

    // Resumen
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESUMEN                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('📸 Screenshots en ./screenshots/pendientes-*.png');

  } catch (error) {
    console.error('\n❌ Error:', error);
    const page = authBot.getPage();
    if (page) await ss(page, 'pendientes-error');
  } finally {
    console.log('\n🔄 Cerrando navegador...');
    await resetSOIAuthBot();
    console.log('✅ Cerrado');
  }
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

testPendientesPago().catch(console.error);
