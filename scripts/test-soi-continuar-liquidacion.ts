/**
 * CONTINUAR LIQUIDACIÓN SOI
 * Usa la sesión existente (navegador ya abierto)
 * Prioriza "Siguiente" sobre "Guardar"
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

async function continuarLiquidacion() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🔄 CONTINUAR LIQUIDACIÓN SOI                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();

  // Verificar si hay sesión existente
  let page = authBot.getPage();

  if (!page) {
    console.log('📍 No hay sesión activa. Iniciando login...');
    await authBot.login();
    page = authBot.getPage();
    if (!page) throw new Error('No page');
    console.log('✅ Login OK\n');
    await page.waitForTimeout(2000);
  } else {
    console.log('✅ Usando sesión existente\n');
  }

  // Ir al inicio primero (casita)
  console.log('📍 Navegando al inicio...');
  await page.evaluate(() => {
    const homeBtn = document.querySelector('a[href*="inicio"], [title*="Inicio"], .home-icon') as HTMLElement;
    if (homeBtn) homeBtn.click();
  });
  await page.waitForTimeout(2000);

  // Navegar: Gestionar Planillas → Activos → En línea
  console.log('📍 Navegando al wizard: Gestionar Planillas → Activos → En línea');
  await clickMenu(page, 'gestionar planillas');
  await page.waitForTimeout(800);
  await clickMenu(page, 'activos');
  await page.waitForTimeout(800);
  await clickMenu(page, 'en línea');
  await page.waitForTimeout(2500);

  await ss(page, 'continuar-01-wizard');
  console.log('✅ En wizard de liquidación\n');

  // Completar los 4 pasos
  for (let paso = 1; paso <= 4; paso++) {
    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`📋 PASO ${paso} de 4`);
    console.log(`═══════════════════════════════════════════════════════════\n`);

    await ss(page, `continuar-paso${paso}-inicio`);

    // Detectar paso actual y botones
    const info = await page.evaluate(() => {
      const stepText = document.body.innerText.match(/Paso\s*(\d)\s*de\s*4/i);
      const allBtns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
      const btnTexts = allBtns.map(b => {
        const el = b as HTMLElement;
        return el.innerText?.trim() || (b as HTMLInputElement).value || '';
      }).filter(t => t.length > 0);

      return {
        paso: stepText ? stepText[1] : '?',
        botones: btnTexts,
      };
    });

    console.log(`   Paso detectado: ${info.paso}`);
    console.log(`   Botones: ${info.botones.join(' | ')}`);

    // Completar campos obligatorios si es necesario
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

    // PRIORIDAD CORREGIDA: "siguiente" ANTES que "guardar"
    // Solo usar "liquidar" o "finalizar" al final
    const btnClick = await page.evaluate((pasoActual) => {
      const allBtns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));

      // En pasos 1-3: priorizar "siguiente"
      // En paso 4: priorizar "liquidar" o "finalizar"
      let prioridades: string[];

      if (pasoActual < 4) {
        prioridades = ['siguiente', 'continuar'];
      } else {
        prioridades = ['liquidar', 'finalizar', 'confirmar', 'siguiente'];
      }

      for (const prio of prioridades) {
        for (const btn of allBtns) {
          const texto = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').toLowerCase().trim();
          if (texto.includes(prio)) {
            (btn as HTMLElement).click();
            return { ok: true, btn: texto };
          }
        }
      }

      return { ok: false };
    }, paso);

    if (btnClick.ok) {
      console.log(`   ✅ Click en: "${btnClick.btn}"\n`);
    } else {
      console.log(`   ⚠️ No se encontró botón de navegación\n`);

      // Intentar click en el botón más a la derecha (suele ser Siguiente)
      const fallback = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
        // El último botón visible suele ser "Siguiente"
        for (let i = btns.length - 1; i >= 0; i--) {
          const btn = btns[i] as HTMLElement;
          const texto = (btn.innerText || (btn as HTMLInputElement).value || '').toLowerCase();
          if (!texto.includes('anterior') && !texto.includes('guardar') && !texto.includes('agregar')) {
            btn.click();
            return texto.trim();
          }
        }
        return null;
      });

      if (fallback) {
        console.log(`   ✅ Fallback click en: "${fallback}"\n`);
      }
    }

    await page.waitForTimeout(3000);
    await ss(page, `continuar-paso${paso}-despues`);

    // Verificar si terminamos
    const terminado = await page.evaluate(() => {
      const texto = document.body.innerText.toLowerCase();
      return texto.includes('exitosa') ||
             texto.includes('liquidada correctamente') ||
             texto.includes('completada') ||
             texto.includes('ha sido liquidada');
    });

    if (terminado) {
      console.log(`🎉 ¡LIQUIDACIÓN COMPLETADA!\n`);
      await ss(page, 'continuar-liquidacion-exitosa');
      break;
    }
  }

  // Ir a Pendientes de pago para verificar
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 Verificando en Pendientes de pago...');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Click en inicio
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

  await ss(page, 'continuar-pendientes-pago');

  // Buscar planilla
  const numeroPlanilla = '6008280827';
  console.log(`   Buscando planilla: ${numeroPlanilla}`);

  await page.evaluate((num) => {
    const inputs = document.querySelectorAll('input[type="text"]');
    for (const input of inputs) {
      const inp = input as HTMLInputElement;
      if (inp.name?.includes('planilla') || inp.name?.includes('numero') || inp.id?.includes('planilla')) {
        inp.value = num;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }
    // Si no encontró por nombre, usar el primer input de texto
    if (inputs.length > 0) {
      (inputs[0] as HTMLInputElement).value = num;
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, numeroPlanilla);

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
  await ss(page, 'continuar-resultado-busqueda');

  // Verificar estado
  const resultado = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    let estado = 'No encontrado';
    let valor = '';

    for (const row of rows) {
      const texto = row.textContent || '';
      if (texto.includes('6008280827')) {
        if (texto.includes('LIQUIDADA')) estado = 'LIQUIDADA';
        else if (texto.includes('GUARDADA')) estado = 'GUARDADA';
        else if (texto.includes('PAGADA')) estado = 'PAGADA';

        const valorMatch = texto.match(/\$\s*([\d.,]+)/);
        if (valorMatch) valor = valorMatch[0];
      }
    }

    return { estado, valor };
  });

  console.log(`\n   📊 Estado planilla: ${resultado.estado}`);
  console.log(`   💰 Valor: ${resultado.valor}\n`);

  // Resumen
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 RESUMEN                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('📸 Screenshots en ./screenshots/continuar-*.png');
  console.log('⚠️  Navegador abierto - No se cerró la sesión');
  console.log('\n   Esperando 30 segundos...\n');

  await page.waitForTimeout(30000);

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

continuarLiquidacion().catch(console.error);
