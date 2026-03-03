/**
 * Script para navegar: Gestionar Planillas → Activos → En línea
 * Siguiendo el flujo exacto mostrado en los screenshots del usuario
 */

import { getSOIAuthBot, resetSOIAuthBot } from '../src/bots/soi/auth.bot';

async function testMenuGestionar() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 NAVEGACIÓN: Gestionar Planillas → Activos → En línea  ║');
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
    await ss(page, 'menu-01-dashboard');

    // PASO 1: Click en "Gestionar Planillas" del menú lateral
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 PASO 1: Click en "Gestionar Planillas"');
    console.log('═══════════════════════════════════════════════════════════\n');

    let clicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a, button, [onclick]');
      for (const link of links) {
        const text = link.textContent?.trim().toLowerCase() || '';
        if (text === 'gestionar planillas' || text.includes('gestionar planilla')) {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    console.log('   Click Gestionar Planillas:', clicked ? '✅' : '❌');
    await page.waitForTimeout(1500);
    await ss(page, 'menu-02-gestionar-planillas');

    // Ver submenú expandido
    const submenu1 = await page.evaluate(() => {
      const items = document.querySelectorAll('[class*="submenu"] a, [class*="dropdown"] a, ul ul a, li li a');
      const texts: string[] = [];
      items.forEach(item => {
        const t = item.textContent?.trim();
        if (t && t.length > 2) texts.push(t);
      });
      return texts;
    });

    console.log('   Submenú:', submenu1.length > 0 ? submenu1.join(', ') : 'No visible');

    // PASO 2: Click en "Activos"
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 PASO 2: Click en "Activos"');
    console.log('═══════════════════════════════════════════════════════════\n');

    clicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a, button, [onclick]');
      for (const link of links) {
        const text = link.textContent?.trim().toLowerCase() || '';
        if (text === 'activos' || text === 'activo') {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    console.log('   Click Activos:', clicked ? '✅' : '❌');
    await page.waitForTimeout(1500);
    await ss(page, 'menu-03-activos');

    // Ver submenú de Activos
    const submenu2 = await page.evaluate(() => {
      const items = document.querySelectorAll('[class*="submenu"] a, [class*="dropdown"] a, ul ul a, li li a');
      const texts: string[] = [];
      items.forEach(item => {
        const t = item.textContent?.trim();
        if (t && t.length > 2) texts.push(t);
      });
      return texts;
    });

    console.log('   Submenú Activos:', submenu2.length > 0 ? submenu2.slice(0, 10).join(', ') : 'No visible');

    // PASO 3: Click en "En línea"
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 PASO 3: Click en "En línea"');
    console.log('═══════════════════════════════════════════════════════════\n');

    clicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a, button, [onclick]');
      for (const link of links) {
        const text = link.textContent?.trim().toLowerCase() || '';
        if (text === 'en línea' || text === 'en linea' || text.includes('línea')) {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    console.log('   Click En línea:', clicked ? '✅' : '❌');
    await page.waitForTimeout(2000);
    await ss(page, 'menu-04-en-linea');

    // Analizar página actual
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 ANÁLISIS DE PÁGINA ACTUAL');
    console.log('═══════════════════════════════════════════════════════════\n');

    const pageInfo = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.querySelector('h1, h2, .titulo')?.textContent?.trim() || document.title,
        tables: document.querySelectorAll('table').length,
        forms: document.querySelectorAll('form').length,
        buttons: Array.from(document.querySelectorAll('button, input[type="submit"]'))
          .map(b => b.textContent?.trim() || (b as HTMLInputElement).value)
          .filter(t => t && t.length > 1)
          .slice(0, 15),
        hasLiquidar: document.body.textContent?.toLowerCase().includes('liquidar'),
        hasPagar: document.body.textContent?.toLowerCase().includes('pagar'),
        hasPSE: document.body.textContent?.toLowerCase().includes('pse'),
      };
    });

    console.log('   URL:', pageInfo.url);
    console.log('   Título:', pageInfo.title);
    console.log('   Tablas:', pageInfo.tables);
    console.log('   Formularios:', pageInfo.forms);
    console.log('   ¿Liquidar?:', pageInfo.hasLiquidar ? '✅' : '❌');
    console.log('   ¿Pagar?:', pageInfo.hasPagar ? '✅' : '❌');
    console.log('   ¿PSE?:', pageInfo.hasPSE ? '✅' : '❌');
    console.log('   Botones:', pageInfo.buttons.join(', ') || 'Ninguno');

    // Si hay tabla, buscar planillas
    if (pageInfo.tables > 0) {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('📍 PLANILLAS EN TABLA');
      console.log('═══════════════════════════════════════════════════════════\n');

      const planillas = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr');
        const data: { numero: string; estado: string; valor: string }[] = [];

        rows.forEach(row => {
          const text = row.textContent || '';
          // Buscar número de planilla (10+ dígitos)
          const numero = text.match(/\d{9,}/)?.[0];
          // Buscar estado
          const estado = text.match(/(GUARDADA|LIQUIDADA|PAGADA|PENDIENTE)/i)?.[0];
          // Buscar valor
          const valor = text.match(/\$\s*[\d.,]+/)?.[0];

          if (numero || estado || valor) {
            data.push({ numero: numero || '', estado: estado || '', valor: valor || '' });
          }
        });

        return data.filter(d => d.numero || d.estado);
      });

      if (planillas.length > 0) {
        planillas.forEach((p, i) => {
          console.log(`   ${i+1}. ${p.numero} | ${p.estado} | ${p.valor}`);
        });
      } else {
        console.log('   No se detectaron planillas estructuradas');
      }
    }

    // PASO 4: Si estamos en página de planillas, seleccionar una y continuar
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 PASO 4: Seleccionar planilla y continuar');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Seleccionar primer checkbox disponible
    const selected = await page.evaluate(() => {
      const checkbox = document.querySelector('table input[type="checkbox"]:not(:checked)') as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        checkbox.click();
        return true;
      }
      return false;
    });

    console.log('   Planilla seleccionada:', selected ? '✅' : '❌');
    await page.waitForTimeout(500);
    await ss(page, 'menu-05-planilla-seleccionada');

    // Click en Continuar
    clicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, input[type="submit"], a.btn');
      for (const btn of buttons) {
        const text = (btn.textContent?.toLowerCase() || (btn as HTMLInputElement).value?.toLowerCase() || '');
        if (text.includes('continuar') || text.includes('siguiente') || text.includes('pagar')) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    console.log('   Click Continuar:', clicked ? '✅' : '❌');
    await page.waitForTimeout(3000);
    await ss(page, 'menu-06-despues-continuar');

    // Analizar resultado
    const result = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.querySelector('h1, h2, .titulo')?.textContent?.trim(),
        step: document.body.textContent?.match(/Paso\s*(\d)\s*de\s*(\d)/i),
        hasPSE: document.body.textContent?.toLowerCase().includes('pse'),
        hasBanco: document.body.textContent?.toLowerCase().includes('banco'),
        hasLiquidacion: document.body.textContent?.toLowerCase().includes('liquidación'),
      };
    });

    console.log('\n   📄 Resultado:');
    console.log('   URL:', result.url);
    console.log('   Título:', result.title || 'No detectado');
    console.log('   ¿Wizard?:', result.step ? `Paso ${result.step[1]} de ${result.step[2]}` : 'No');
    console.log('   ¿PSE?:', result.hasPSE ? '✅' : '❌');
    console.log('   ¿Banco?:', result.hasBanco ? '✅' : '❌');
    console.log('   ¿Liquidación?:', result.hasLiquidacion ? '✅' : '❌');

    // Resumen
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESUMEN                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('📸 Screenshots guardados en ./screenshots/menu-*.png');

  } catch (error) {
    console.error('\n❌ Error:', error);
    const page = authBot.getPage();
    if (page) await ss(page, 'menu-error');
  } finally {
    console.log('\n🔄 Cerrando navegador...');
    await resetSOIAuthBot();
    console.log('✅ Cerrado');
  }
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

testMenuGestionar().catch(console.error);
