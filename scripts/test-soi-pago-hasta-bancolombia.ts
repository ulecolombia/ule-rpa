/**
 * FLUJO PAGO COMPLETO: SOI → PSE → BANCOLOMBIA
 * Incluye llenado de datos en página PSE
 *
 * 1. Dashboard → Click en imagen pagar.png
 * 2. Página detalle → Click en PSE
 * 3. Diálogo advertencia → Click "Sí"
 * 4. Formulario PSE SOI → JURIDICA + BANCOLOMBIA
 * 5. Click "Pagar" → Redirige a PSE (ACH)
 * 6. Página PSE → Ingresar NIT y Email de ULE
 * 7. Click "Ir al Banco" → Redirige a Bancolombia
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

// Datos de ULE para PSE
const ULE_PSE_DATA = {
  nit: '9020190314',  // Sin guión
  email: 'pagos.ule@gmail.com',
};

async function flujoHastaBancolombia() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   💰 FLUJO COMPLETO: SOI → PSE → BANCOLOMBIA               ║');
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
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 1: Dashboard → Click en imagen pagar.png
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 1: Dashboard → Click en botón Pagar');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.goto('https://servicio.nuevosoi.com.co/soi/inicio.do', { waitUntil: 'networkidle0' });
  await page.waitForTimeout(2000);

  const pagarImg = await page.$('img[src*="pagar.png"]');
  if (pagarImg) {
    console.log('   ✅ Encontrada imagen pagar.png');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      pagarImg.click(),
    ]);
    console.log('   ✅ Navegación completada\n');
  }

  await page.waitForTimeout(2000);
  console.log(`   URL: ${page.url()}`);

  // ═══════════════════════════════════════════════════════════════
  // PASO 2: Click en botón PSE
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 2: Click en botón PSE');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  const pseImg = await page.$('img[src*="pse"]');
  if (pseImg) {
    console.log('   ✅ Encontrada imagen PSE');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
      pseImg.click(),
    ]);
  }

  await page.waitForTimeout(2000);

  // ═══════════════════════════════════════════════════════════════
  // PASO 3: Diálogo advertencia → Click "Sí"
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 3: Diálogo advertencia → Click "Sí"');
  console.log('═══════════════════════════════════════════════════════════\n');

  const hayAdvertencia = await page.evaluate(() => {
    const texto = document.body.innerText;
    return texto.includes('Advertencia') && texto.includes('Desea continuar');
  });

  if (hayAdvertencia) {
    console.log('   ✅ Detectado diálogo de advertencia');
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
      for (const btn of buttons) {
        const texto = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').trim().toLowerCase();
        if (texto === 'sí' || texto === 'si') {
          (btn as HTMLElement).click();
          return;
        }
      }
    });
    console.log('   ✅ Click en "Sí"\n');
    await page.waitForTimeout(3000);
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 4: Formulario PSE SOI → JURIDICA + BANCOLOMBIA
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 4: Formulario PSE → JURIDICA + BANCOLOMBIA');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.waitForTimeout(2000);

  // Seleccionar Tipo de Aportante = JURIDICA
  await page.evaluate(() => {
    const select = document.querySelector('select[name="codTipoEntidad"]') as HTMLSelectElement;
    if (select) {
      const option = Array.from(select.options).find(o => o.value === 'JURIDICA' || o.text.toUpperCase() === 'JURIDICA');
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  console.log('   ✅ Tipo Aportante: JURIDICA');
  await page.waitForTimeout(500);

  // Seleccionar Entidad Financiera = BANCOLOMBIA
  await page.evaluate(() => {
    const select = document.querySelector('select[name="codEntidadFinanciera"]') as HTMLSelectElement;
    if (select) {
      const option = Array.from(select.options).find(o => o.text.toUpperCase().includes('BANCOLOMBIA'));
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  console.log('   ✅ Entidad Financiera: BANCOLOMBIA');
  await page.waitForTimeout(500);

  await ss(page, 'banco-04-formulario-soi');

  // ═══════════════════════════════════════════════════════════════
  // PASO 5: Click "Pagar" → Redirige a PSE (ACH)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 5: Click "Pagar" → Redirige a PSE');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="submit"], input[type="button"], button');
    for (const inp of inputs) {
      const value = (inp as HTMLInputElement).value || (inp as HTMLElement).innerText || '';
      if (value.toLowerCase().includes('pagar')) {
        (inp as HTMLElement).click();
        return;
      }
    }
  });

  console.log('   ✅ Click en Pagar');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const urlPSE = page.url();
  console.log(`   URL PSE: ${urlPSE}`);

  if (urlPSE.includes('pse.com.co')) {
    console.log('   🏦 ¡Llegamos a la página de PSE!\n');
  }

  await ss(page, 'banco-05-pagina-pse');

  // ═══════════════════════════════════════════════════════════════
  // PASO 6: Página PSE → Ingresar NIT y Email de ULE
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 6: Página PSE → Ingresar datos ULE');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.waitForTimeout(2000);

  // Verificar que estamos en la página de PSE y que está en Jurídica
  const estadoPSE = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      esJuridica: body.includes('Jurídica') || document.querySelector('[class*="juridica"]') !== null,
      tieneNIT: body.includes('NIT'),
      tieneEmail: body.includes('Correo') || body.includes('E-mail'),
    };
  });

  console.log('   Estado página PSE:', JSON.stringify(estadoPSE));

  // Hacer click en tab "Jurídica" si no está seleccionado
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('[role="tab"], button, a');
    for (const tab of tabs) {
      const text = (tab as HTMLElement).innerText || '';
      if (text.toLowerCase().includes('jurídica') || text.toLowerCase().includes('juridica')) {
        (tab as HTMLElement).click();
        return;
      }
    }
  });
  await page.waitForTimeout(1000);

  // Ingresar NIT
  console.log(`   Ingresando NIT: ${ULE_PSE_DATA.nit}`);
  const nitInput = await page.$('input[placeholder*="NIT"], input[name*="nit"], input[id*="nit"]');
  if (nitInput) {
    await nitInput.click({ clickCount: 3 });
    await nitInput.type(ULE_PSE_DATA.nit, { delay: 50 });
    console.log('   ✅ NIT ingresado');
  } else {
    // Fallback: buscar por label o placeholder
    await page.evaluate((nit) => {
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
      for (const inp of inputs) {
        const placeholder = (inp as HTMLInputElement).placeholder?.toLowerCase() || '';
        const label = inp.closest('div, label')?.textContent?.toLowerCase() || '';
        if (placeholder.includes('nit') || label.includes('nit')) {
          (inp as HTMLInputElement).value = nit;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    }, ULE_PSE_DATA.nit);
    console.log('   ✅ NIT ingresado (fallback)');
  }

  await page.waitForTimeout(500);

  // Ingresar Email
  console.log(`   Ingresando Email: ${ULE_PSE_DATA.email}`);
  const emailInput = await page.$('input[placeholder*="mail"], input[type="email"], input[name*="email"], input[name*="correo"]');
  if (emailInput) {
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(ULE_PSE_DATA.email, { delay: 50 });
    console.log('   ✅ Email ingresado');
  } else {
    // Fallback
    await page.evaluate((email) => {
      const inputs = document.querySelectorAll('input[type="text"], input[type="email"]');
      for (const inp of inputs) {
        const placeholder = (inp as HTMLInputElement).placeholder?.toLowerCase() || '';
        const label = inp.closest('div, label')?.textContent?.toLowerCase() || '';
        if (placeholder.includes('mail') || placeholder.includes('correo') || label.includes('correo')) {
          (inp as HTMLInputElement).value = email;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    }, ULE_PSE_DATA.email);
    console.log('   ✅ Email ingresado (fallback)');
  }

  await page.waitForTimeout(1000);
  await ss(page, 'banco-06-pse-datos-llenos');

  // ═══════════════════════════════════════════════════════════════
  // PASO 7: Click "Ir al Banco" → Redirige a Bancolombia
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 7: Click "Ir al Banco" → Redirige a Bancolombia');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Verificar que estamos en la página PSE
  const currentUrl = page.url();
  console.log(`   URL actual: ${currentUrl}`);

  if (!currentUrl.includes('pse.com.co')) {
    console.log('   ⚠️ No estamos en la página PSE, esperando...');
    await page.waitForTimeout(5000);
  }

  // Listar todos los botones disponibles para debug
  const botones = await page.evaluate(() => {
    const result: string[] = [];
    document.querySelectorAll('button, input[type="submit"], a').forEach((el) => {
      const text = ((el as HTMLElement).innerText || (el as HTMLInputElement).value || '').trim();
      if (text) result.push(`<${el.tagName}> "${text.substring(0, 30)}"`);
    });
    return result;
  });
  console.log('   Botones encontrados:', botones.slice(0, 10).join(', '));

  // Método 1: Buscar botón por XPath y usar page.click
  console.log('\n   🔍 Buscando botón "Ir al Banco"...');

  // Usar XPath para encontrar el botón
  const [irAlBancoBtn] = await page.$x("//button[contains(., 'Ir al Banco')] | //a[contains(., 'Ir al Banco')]");

  if (irAlBancoBtn) {
    console.log('   ✅ Botón encontrado via XPath');

    // Scroll into view
    await page.evaluate((el: Element) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), irAlBancoBtn);
    await page.waitForTimeout(500);

    // Click con navegación en paralelo
    console.log('   🖱️ Clickeando...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch((e: Error) => {
        console.log(`   ⚠️ Navigation timeout: ${e.message}`);
      }),
      irAlBancoBtn.click(),
    ]);
  } else {
    // Método alternativo: buscar por texto y usar click nativo
    console.log('   ⚠️ XPath no encontró el botón, usando método alternativo...');

    // Obtener el handle del botón
    const btnHandle = await page.evaluateHandle(() => {
      const buttons = document.querySelectorAll('button, a, input[type="submit"]');
      for (const btn of buttons) {
        const text = ((btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '').toLowerCase();
        if (text.includes('ir al banco')) {
          return btn;
        }
      }
      return null;
    });

    if (btnHandle && btnHandle.asElement()) {
      console.log('   ✅ Botón encontrado via evaluateHandle');
      const element = btnHandle.asElement();

      // Scroll y click
      await page.evaluate((el: Element) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), element);
      await page.waitForTimeout(500);

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {}),
        element!.click(),
      ]);
    } else {
      console.log('   ❌ No se encontró el botón "Ir al Banco"');

      // Último intento: click por coordenadas del screenshot
      // El botón está aproximadamente en el centro-derecha del formulario
      console.log('   🎯 Intentando click por coordenadas...');
      await page.mouse.click(900, 530); // Coordenadas aproximadas del botón naranja
      await page.waitForTimeout(5000);
    }
  }

  console.log('   ✅ Click en "Ir al Banco" ejecutado');
  await page.waitForTimeout(5000);

  const urlBanco = page.url();
  console.log(`\n   URL Bancolombia: ${urlBanco}`);

  await ss(page, 'banco-07-pagina-bancolombia');

  // ═══════════════════════════════════════════════════════════════
  // PASO 8: Bancolombia → Click en "Bancolombia Negocios"
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 8: Bancolombia → Click en "Bancolombia Negocios"');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Verificar que estamos en la página de selección de Bancolombia
  if (urlBanco.includes('bancolombia')) {
    console.log('   ✅ Estamos en Bancolombia');

    // Esperar a que cargue la página
    await page.waitForTimeout(2000);

    // Buscar y clickear "Bancolombia Negocios"
    const [negociosBtn] = await page.$x("//div[contains(., 'Bancolombia Negocios')]//ancestor::button | //button[contains(., 'Bancolombia Negocios')] | //*[contains(text(), 'Bancolombia Negocios')]/ancestor::*[self::button or self::a or self::div[@role='button']]");

    if (negociosBtn) {
      console.log('   ✅ Botón "Bancolombia Negocios" encontrado via XPath');

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {}),
        negociosBtn.click(),
      ]);
    } else {
      // Fallback: buscar por texto
      console.log('   🔄 Buscando botón por texto...');

      await page.evaluate(() => {
        const elements = document.querySelectorAll('div, button, a');
        for (const el of elements) {
          const text = (el as HTMLElement).innerText || '';
          if (text.includes('Bancolombia Negocios')) {
            // Click en el elemento clickeable más cercano
            const clickable = el.closest('button') || el.closest('a') || el.closest('[role="button"]') || el;
            (clickable as HTMLElement).click();
            return;
          }
        }
      });

      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    }

    await page.waitForTimeout(3000);
    await ss(page, 'banco-08-despues-negocios');

    console.log(`   URL después de Negocios: ${page.url()}`);

    // ═══════════════════════════════════════════════════════════════
    // PASO 9: Bancolombia → Ingresar Usuario
    // ═══════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 PASO 9: Bancolombia → Ingresar Usuario');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Datos de Bancolombia ULE
    const BANCOLOMBIA_USER = 'Lbrochet01';

    // Esperar a que cargue la página de login
    await page.waitForTimeout(2000);

    // Buscar el campo de usuario
    const userInput = await page.$('input[type="text"], input[placeholder*="Usuario"], input[name*="user"], input[id*="user"]');

    if (userInput) {
      console.log('   ✅ Campo de usuario encontrado');
      await userInput.click({ clickCount: 3 });
      await userInput.type(BANCOLOMBIA_USER, { delay: 50 });
      console.log(`   ✅ Usuario ingresado: ${BANCOLOMBIA_USER}`);
    } else {
      // Fallback: buscar por XPath o evaluate
      console.log('   🔄 Buscando campo de usuario por texto...');
      await page.evaluate((user: string) => {
        const inputs = document.querySelectorAll('input');
        for (const input of inputs) {
          const placeholder = input.placeholder?.toLowerCase() || '';
          const name = input.name?.toLowerCase() || '';
          const id = input.id?.toLowerCase() || '';
          if (placeholder.includes('usuario') || name.includes('user') || id.includes('user') || input.type === 'text') {
            input.value = user;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          }
        }
      }, BANCOLOMBIA_USER);
      console.log(`   ✅ Usuario ingresado via evaluate: ${BANCOLOMBIA_USER}`);
    }

    await page.waitForTimeout(500);
    await ss(page, 'banco-09-usuario-ingresado');

    // Click en "Continuar"
    console.log('   🔍 Buscando botón "Continuar"...');

    const [continuarBtn] = await page.$x("//button[contains(., 'Continuar')] | //input[@value='Continuar']");

    if (continuarBtn) {
      console.log('   ✅ Botón "Continuar" encontrado');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {}),
        continuarBtn.click(),
      ]);
    } else {
      // Fallback
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.innerText.toLowerCase().includes('continuar')) {
            btn.click();
            return;
          }
        }
      });
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    }

    await page.waitForTimeout(3000);
    await ss(page, 'banco-10-despues-continuar');
    console.log(`   URL después de Continuar: ${page.url()}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // RESUMEN
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 RESUMEN                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (urlBanco.includes('bancolombia')) {
    console.log('   🏦 ¡Llegamos a BANCOLOMBIA!');
    console.log('   Ahora se necesita ingresar las credenciales de banca empresarial.');
  } else {
    console.log('   📋 URL final:', urlBanco);
  }

  console.log('\n   📸 Screenshots en ./screenshots/banco-*.png');
  console.log('\n   ⏳ Esperando 180 segundos para completar pago manualmente...\n');

  await page.waitForTimeout(180000);
  console.log('✅ Finalizado');
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

flujoHastaBancolombia().catch(console.error);
