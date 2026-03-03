/**
 * Script para explorar el menú "Unificar para pago" de SOI
 * Este menú parece ser el camino correcto para el pago PSE
 */

import { getSOIAuthBot, resetSOIAuthBot } from '../src/bots/soi/auth.bot';

async function testUnificarPago() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 TEST: UNIFICAR PARA PAGO - SOI PSE                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();

  try {
    // Login
    console.log('📍 PASO 1: Login...');
    const session = await authBot.login();
    if (!session.isAuthenticated) throw new Error('Login fallido');
    console.log('✅ Login exitoso\n');

    const page = authBot.getPage();
    if (!page) throw new Error('No page');

    await page.waitForTimeout(2000);

    // Explorar menú lateral
    console.log('📍 PASO 2: Explorando menú lateral...');

    const menuItems = await page.evaluate(() => {
      const items: { text: string; hasSubmenu: boolean }[] = [];
      const menuLinks = document.querySelectorAll('[class*="menu"] a, nav a, aside a, .sidebar a, [class*="nav"] a');

      menuLinks.forEach(link => {
        const text = link.textContent?.trim();
        if (text && text.length > 2) {
          const hasSubmenu = link.querySelector('svg, i, .arrow') !== null ||
                            link.closest('li')?.querySelector('ul') !== null;
          items.push({ text, hasSubmenu });
        }
      });

      return items;
    });

    console.log('   Menú encontrado:');
    menuItems.forEach(item => {
      console.log(`   - ${item.text} ${item.hasSubmenu ? '▼' : ''}`);
    });

    // Click en "Unificar para pago"
    console.log('\n📍 PASO 3: Click en "Unificar para pago"...');

    const unificarClicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a, button, [onclick]');
      for (const link of links) {
        const text = link.textContent?.toLowerCase() || '';
        if (text.includes('unificar') && text.includes('pago')) {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    console.log('   Click en Unificar:', unificarClicked ? '✅' : '❌');

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/unificar-1-menu.png', fullPage: true });

    // Ver submenú o página
    console.log('\n📍 PASO 4: Analizando opciones de Unificar para pago...');

    const submenuOptions = await page.evaluate(() => {
      // Buscar submenú expandido
      const subItems = document.querySelectorAll('[class*="submenu"] a, [class*="dropdown"] a, ul ul a');
      const options: string[] = [];

      subItems.forEach(item => {
        const text = item.textContent?.trim();
        if (text) options.push(text);
      });

      // Si no hay submenú, buscar en la página actual
      if (options.length === 0) {
        const pageLinks = document.querySelectorAll('main a, .content a, article a');
        pageLinks.forEach(link => {
          const text = link.textContent?.trim();
          if (text && text.length > 3) options.push(text);
        });
      }

      return options;
    });

    if (submenuOptions.length > 0) {
      console.log('   Opciones encontradas:');
      submenuOptions.slice(0, 10).forEach(opt => console.log(`   - ${opt}`));
    }

    // Verificar URL actual
    const currentUrl = page.url();
    console.log('\n   URL actual:', currentUrl);

    await page.screenshot({ path: 'screenshots/unificar-2-submenu.png', fullPage: true });

    // Buscar opciones relacionadas con PSE o pago
    console.log('\n📍 PASO 5: Buscando flujo de pago PSE...');

    // Click en cualquier opción que mencione PSE, pago, o planilla
    const pseClicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a, button');

      // Primero buscar PSE específicamente
      for (const link of links) {
        const text = link.textContent?.toLowerCase() || '';
        if (text.includes('pse') || text.includes('pago en línea') || text.includes('pagar planilla')) {
          (link as HTMLElement).click();
          return { clicked: true, text: link.textContent?.trim() };
        }
      }

      // Luego buscar opciones de pago
      for (const link of links) {
        const text = link.textContent?.toLowerCase() || '';
        if ((text.includes('pagar') || text.includes('pago')) && !text.includes('proyectar')) {
          (link as HTMLElement).click();
          return { clicked: true, text: link.textContent?.trim() };
        }
      }

      // Buscar "Activos" o "En línea"
      for (const link of links) {
        const text = link.textContent?.toLowerCase() || '';
        if (text.includes('activos') || text.includes('en línea') || text.includes('planillas liquidadas')) {
          (link as HTMLElement).click();
          return { clicked: true, text: link.textContent?.trim() };
        }
      }

      return { clicked: false };
    });

    console.log('   Click PSE/Pago:', pseClicked.clicked ? `✅ (${pseClicked.text})` : '❌');

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/unificar-3-pse.png', fullPage: true });

    // Analizar página de pago
    console.log('\n📍 PASO 6: Analizando página...');

    const pageAnalysis = await page.evaluate(() => {
      const body = document.body.textContent?.toLowerCase() || '';
      return {
        url: window.location.href,
        title: document.title,
        hasPSE: body.includes('pse'),
        hasBanco: body.includes('banco') || body.includes('entidad financiera'),
        hasNIT: body.includes('nit'),
        hasEmail: body.includes('correo') || body.includes('email'),
        hasTipoPersona: body.includes('tipo de persona') || body.includes('natural') || body.includes('jurídica'),
        hasTotal: body.includes('total') || body.includes('valor'),
        forms: document.querySelectorAll('form').length,
        selects: Array.from(document.querySelectorAll('select')).map(s => ({
          name: s.name || s.id,
          options: Array.from(s.options).slice(0, 5).map(o => o.text)
        })),
        inputs: Array.from(document.querySelectorAll('input:not([type="hidden"])')).map(i => ({
          type: (i as HTMLInputElement).type,
          name: (i as HTMLInputElement).name || (i as HTMLInputElement).placeholder
        })).slice(0, 10),
        buttons: Array.from(document.querySelectorAll('button, input[type="submit"]'))
          .map(b => b.textContent?.trim() || (b as HTMLInputElement).value)
          .filter(t => t && t.length > 1)
          .slice(0, 10),
        tables: document.querySelectorAll('table').length,
      };
    });

    console.log('\n   📄 Análisis de página:');
    console.log('   URL:', pageAnalysis.url);
    console.log('   Título:', pageAnalysis.title);
    console.log('   ────────────────────────────');
    console.log('   ¿PSE?:', pageAnalysis.hasPSE ? '✅' : '❌');
    console.log('   ¿Banco?:', pageAnalysis.hasBanco ? '✅' : '❌');
    console.log('   ¿NIT?:', pageAnalysis.hasNIT ? '✅' : '❌');
    console.log('   ¿Email?:', pageAnalysis.hasEmail ? '✅' : '❌');
    console.log('   ¿Tipo Persona?:', pageAnalysis.hasTipoPersona ? '✅' : '❌');
    console.log('   ¿Total/Valor?:', pageAnalysis.hasTotal ? '✅' : '❌');
    console.log('   ────────────────────────────');
    console.log('   Formularios:', pageAnalysis.forms);
    console.log('   Tablas:', pageAnalysis.tables);

    if (pageAnalysis.selects.length > 0) {
      console.log('   Selects:');
      pageAnalysis.selects.forEach(s => {
        console.log(`     - ${s.name}: ${s.options.join(', ')}`);
      });
    }

    if (pageAnalysis.inputs.length > 0) {
      console.log('   Inputs:');
      pageAnalysis.inputs.forEach(i => {
        console.log(`     - [${i.type}] ${i.name}`);
      });
    }

    if (pageAnalysis.buttons.length > 0) {
      console.log('   Botones:', pageAnalysis.buttons.join(', '));
    }

    // Si encontramos formulario PSE, intentar llenarlo
    if (pageAnalysis.hasPSE || pageAnalysis.hasBanco || pageAnalysis.hasTipoPersona) {
      console.log('\n📍 PASO 7: Intentando llenar formulario PSE...');

      const formFilled = await page.evaluate(() => {
        let filled = 0;

        // Tipo de persona -> Jurídica
        const tipoPersonaSelect = document.querySelector('select[name*="persona"], select[name*="tipo"]') as HTMLSelectElement;
        if (tipoPersonaSelect) {
          const juridicaOption = Array.from(tipoPersonaSelect.options).find(o =>
            o.text.toLowerCase().includes('jurídica') || o.value.toLowerCase().includes('juridica')
          );
          if (juridicaOption) {
            tipoPersonaSelect.value = juridicaOption.value;
            tipoPersonaSelect.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
          }
        }

        // Tipo documento -> NIT
        const tipoDocSelect = document.querySelector('select[name*="documento"], select[name*="tipoDoc"]') as HTMLSelectElement;
        if (tipoDocSelect) {
          const nitOption = Array.from(tipoDocSelect.options).find(o =>
            o.text.includes('NIT') || o.value.includes('NIT')
          );
          if (nitOption) {
            tipoDocSelect.value = nitOption.value;
            tipoDocSelect.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
          }
        }

        // Número documento -> 902019031-4
        const numDocInput = document.querySelector('input[name*="numero"], input[name*="documento"], input[name*="nit"]') as HTMLInputElement;
        if (numDocInput && numDocInput.type !== 'hidden') {
          numDocInput.value = '9020190314';
          numDocInput.dispatchEvent(new Event('input', { bubbles: true }));
          filled++;
        }

        // Email -> pagos.ule@gmail.com
        const emailInput = document.querySelector('input[name*="email"], input[name*="correo"], input[type="email"]') as HTMLInputElement;
        if (emailInput) {
          emailInput.value = 'pagos.ule@gmail.com';
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          filled++;
        }

        // Banco -> Bancolombia
        const bancoSelect = document.querySelector('select[name*="banco"], select[name*="entidad"]') as HTMLSelectElement;
        if (bancoSelect) {
          const bancolombiaOption = Array.from(bancoSelect.options).find(o =>
            o.text.toLowerCase().includes('bancolombia')
          );
          if (bancolombiaOption) {
            bancoSelect.value = bancolombiaOption.value;
            bancoSelect.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
          }
        }

        return filled;
      });

      console.log(`   Campos llenados: ${formFilled}`);
      await page.screenshot({ path: 'screenshots/unificar-4-form-filled.png', fullPage: true });
    }

    // Resumen
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESUMEN                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('✅ Login: OK');
    console.log(`✅ Menú Unificar: ${unificarClicked ? 'Encontrado' : 'No encontrado'}`);
    console.log(`✅ Página PSE: ${pageAnalysis.hasPSE ? 'Detectada' : 'No detectada'}`);
    console.log(`✅ Formulario: ${pageAnalysis.forms > 0 ? pageAnalysis.forms + ' encontrado(s)' : 'No encontrado'}`);
    console.log('\n📸 Screenshots en ./screenshots/unificar-*.png');

  } catch (error) {
    console.error('\n❌ Error:', error);
    const page = authBot.getPage();
    if (page) {
      await page.screenshot({ path: 'screenshots/unificar-error.png', fullPage: true });
    }
  } finally {
    console.log('\n🔄 Cerrando navegador...');
    await resetSOIAuthBot();
    console.log('✅ Cerrado');
  }
}

testUnificarPago().catch(console.error);
