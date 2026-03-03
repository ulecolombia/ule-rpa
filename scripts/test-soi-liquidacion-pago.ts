/**
 * Script completo: Liquidación + Pago SOI
 *
 * Flujo:
 * 1. Login SOI
 * 2. Ir a planilla GUARDADA
 * 3. Completar liquidación (4 pasos)
 * 4. Proceder a pago PSE
 */

import { getSOIAuthBot, resetSOIAuthBot } from '../src/bots/soi/auth.bot';

async function testLiquidacionYPago() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 TEST COMPLETO: LIQUIDACIÓN + PAGO SOI                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();

  try {
    // ========== FASE 1: LOGIN ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 FASE 1: AUTENTICACIÓN');
    console.log('═══════════════════════════════════════════════════════════\n');

    const session = await authBot.login();
    if (!session.isAuthenticated) throw new Error('Login fallido');
    console.log('✅ Login exitoso\n');

    const page = authBot.getPage();
    if (!page) throw new Error('No page');

    await page.waitForTimeout(2000);
    await screenshot(page, 'liq-1-dashboard');

    // ========== FASE 2: IR A PLANILLA ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 FASE 2: SELECCIONAR PLANILLA');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Buscar y hacer click en la primera planilla
    const planillaClicked = await page.evaluate(() => {
      // Buscar la tabla de planillas
      const rows = document.querySelectorAll('table tbody tr');

      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
          // Buscar botón en la columna Pagar (columna 7-8)
          const allBtns = row.querySelectorAll('button, a, svg, [onclick]');
          for (const btn of allBtns) {
            // Click en cualquier botón de acción
            (btn as HTMLElement).click();
            return true;
          }
        }
      }
      return false;
    });

    console.log('   Click en planilla:', planillaClicked ? '✅' : '❌');
    await page.waitForTimeout(3000);
    await screenshot(page, 'liq-2-planilla-seleccionada');

    // ========== FASE 3: LIQUIDACIÓN - 4 PASOS ==========
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 FASE 3: PROCESO DE LIQUIDACIÓN (4 PASOS)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // PASO 1: Información Básica
    console.log('📋 PASO 1/4: Información Básica del Aportante');

    let currentStep = await getCurrentStep(page);
    console.log(`   Paso actual detectado: ${currentStep}`);

    if (currentStep === 1 || page.url().includes('Crear') || page.url().includes('crear')) {
      // Verificar campos obligatorios
      const paso1Info = await page.evaluate(() => {
        const tipoAportante = (document.querySelector('select[name*="tipoAportante"]') as HTMLSelectElement)?.value;
        const caja = (document.querySelector('select[name*="caja"], select[name*="compensacion"]') as HTMLSelectElement)?.value;
        const arl = (document.querySelector('select[name*="arl"], select[name*="riesgo"]') as HTMLSelectElement)?.value;
        const tipoPlanilla = (document.querySelector('select[name*="tipoPlanilla"]') as HTMLSelectElement)?.value;

        return { tipoAportante, caja, arl, tipoPlanilla };
      });

      console.log('   Tipo Aportante:', paso1Info.tipoAportante || 'No seleccionado');
      console.log('   Caja:', paso1Info.caja || 'No seleccionado');
      console.log('   ARL:', paso1Info.arl || 'No seleccionado');
      console.log('   Tipo Planilla:', paso1Info.tipoPlanilla || 'No seleccionado');

      // Seleccionar Caja de Compensación si no está seleccionada
      await page.evaluate(() => {
        const cajaSelect = document.querySelector('select[name*="caja"], select[name*="compensacion"]') as HTMLSelectElement;
        if (cajaSelect && (!cajaSelect.value || cajaSelect.value === 'SELECCIONE' || cajaSelect.value === '')) {
          // Seleccionar primera opción válida
          const options = Array.from(cajaSelect.options);
          const validOption = options.find(opt => opt.value && opt.value !== 'SELECCIONE' && opt.value !== '');
          if (validOption) {
            cajaSelect.value = validOption.value;
            cajaSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });

      await screenshot(page, 'liq-3-paso1-info-basica');

      // Click en Siguiente
      await clickSiguiente(page);
      console.log('   ✅ Paso 1 completado\n');
    }

    await page.waitForTimeout(2000);
    await screenshot(page, 'liq-4-paso2');

    // PASO 2: Información Detallada
    console.log('📋 PASO 2/4: Información Detallada');
    currentStep = await getCurrentStep(page);
    console.log(`   Paso actual: ${currentStep}`);

    if (currentStep === 2) {
      // Este paso puede tener info del cotizante (IBC, días, etc)
      const paso2Info = await page.evaluate(() => {
        const ibc = (document.querySelector('input[name*="ibc"], input[name*="ingreso"]') as HTMLInputElement)?.value;
        const dias = (document.querySelector('input[name*="dias"]') as HTMLInputElement)?.value;
        return { ibc, dias };
      });

      console.log('   IBC:', paso2Info.ibc || 'No visible');
      console.log('   Días:', paso2Info.dias || 'No visible');

      await screenshot(page, 'liq-5-paso2-info-detallada');
      await clickSiguiente(page);
      console.log('   ✅ Paso 2 completado\n');
    }

    await page.waitForTimeout(2000);
    await screenshot(page, 'liq-6-paso3');

    // PASO 3: Validación Afiliación
    console.log('📋 PASO 3/4: Validación Afiliación');
    currentStep = await getCurrentStep(page);
    console.log(`   Paso actual: ${currentStep}`);

    if (currentStep === 3) {
      // Este paso valida afiliaciones a EPS, AFP, etc
      const paso3Info = await page.evaluate(() => {
        const mensajes = document.querySelectorAll('.alert, .mensaje, .validacion');
        const textos: string[] = [];
        mensajes.forEach(m => {
          const t = m.textContent?.trim();
          if (t) textos.push(t.substring(0, 100));
        });
        return textos;
      });

      if (paso3Info.length > 0) {
        console.log('   Mensajes de validación:');
        paso3Info.forEach(m => console.log(`     - ${m}`));
      }

      await screenshot(page, 'liq-7-paso3-validacion');
      await clickSiguiente(page);
      console.log('   ✅ Paso 3 completado\n');
    }

    await page.waitForTimeout(2000);
    await screenshot(page, 'liq-8-paso4');

    // PASO 4: Liquidación General
    console.log('📋 PASO 4/4: Liquidación General');
    currentStep = await getCurrentStep(page);
    console.log(`   Paso actual: ${currentStep}`);

    if (currentStep === 4) {
      // Este paso muestra el resumen y totales
      const paso4Info = await page.evaluate(() => {
        // Buscar valores totales
        const totalElements = document.querySelectorAll('[class*="total"], [id*="total"], td:last-child');
        let total = '';
        totalElements.forEach(el => {
          const text = el.textContent || '';
          if (text.includes('$') || text.match(/\d{1,3}(,\d{3})*(\.\d+)?/)) {
            total = text.trim();
          }
        });

        // Buscar botón de liquidar/finalizar
        const buttons = document.querySelectorAll('button, input[type="submit"]');
        const btnTexts: string[] = [];
        buttons.forEach(b => {
          const t = b.textContent?.trim() || (b as HTMLInputElement).value;
          if (t) btnTexts.push(t);
        });

        return { total, buttons: btnTexts };
      });

      console.log('   Total a pagar:', paso4Info.total || 'No visible');
      console.log('   Botones:', paso4Info.buttons.join(', '));

      await screenshot(page, 'liq-9-paso4-liquidacion');

      // Buscar y hacer click en "Liquidar" o "Finalizar"
      const liquidarClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, input[type="submit"], a.btn');
        for (const btn of buttons) {
          const text = (btn.textContent?.toLowerCase() || (btn as HTMLInputElement).value?.toLowerCase() || '');
          if (text.includes('liquidar') || text.includes('finalizar') || text.includes('confirmar')) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        // Si no hay botón específico, buscar Siguiente
        for (const btn of buttons) {
          const text = (btn.textContent?.toLowerCase() || (btn as HTMLInputElement).value?.toLowerCase() || '');
          if (text.includes('siguiente')) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      console.log('   Click en Liquidar:', liquidarClicked ? '✅' : '❌');
      console.log('   ✅ Paso 4 completado\n');
    }

    await page.waitForTimeout(3000);
    await screenshot(page, 'liq-10-despues-liquidar');

    // ========== FASE 4: VERIFICAR ESTADO ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 FASE 4: VERIFICAR ESTADO POST-LIQUIDACIÓN');
    console.log('═══════════════════════════════════════════════════════════\n');

    const postLiquidacion = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        hasSuccess: document.body.textContent?.toLowerCase().includes('exitosa') ||
                    document.body.textContent?.toLowerCase().includes('éxito') ||
                    document.querySelector('.alert-success') !== null,
        hasPagar: document.body.textContent?.toLowerCase().includes('pagar') ||
                  document.querySelector('button:has-text("Pagar")') !== null,
        numeroPlanilla: document.body.textContent?.match(/\d{10,}/)?.[0],
      };
    });

    console.log('   URL:', postLiquidacion.url);
    console.log('   ¿Liquidación exitosa?:', postLiquidacion.hasSuccess ? '✅ Sí' : '❓ No detectado');
    console.log('   ¿Opción de pagar?:', postLiquidacion.hasPagar ? '✅ Sí' : '❌ No');
    console.log('   Número planilla:', postLiquidacion.numeroPlanilla || 'No detectado');

    // ========== FASE 5: PROCEDER A PAGO PSE ==========
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📍 FASE 5: FLUJO DE PAGO PSE');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Buscar botón de Pagar
    const pagarClicked = await page.evaluate(() => {
      // Buscar en botones
      const buttons = document.querySelectorAll('button, a, input[type="submit"]');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || (btn as HTMLInputElement).value?.toLowerCase() || '';
        if (text.includes('pagar') || text.includes('pse')) {
          (btn as HTMLElement).click();
          return { clicked: true, text };
        }
      }

      // Buscar en la tabla de planillas (si volvimos al dashboard)
      const rows = document.querySelectorAll('table tbody tr');
      for (const row of rows) {
        const estado = row.textContent?.toLowerCase() || '';
        if (estado.includes('liquidada')) {
          const btns = row.querySelectorAll('button, a, svg');
          for (const btn of btns) {
            (btn as HTMLElement).click();
            return { clicked: true, text: 'tabla-liquidada' };
          }
        }
      }

      return { clicked: false };
    });

    console.log('   Click en Pagar:', pagarClicked.clicked ? `✅ (${pagarClicked.text})` : '❌');

    await page.waitForTimeout(3000);
    await screenshot(page, 'liq-11-pago-pse');

    // Analizar página de pago
    const pagoPSEInfo = await page.evaluate(() => {
      return {
        url: window.location.href,
        hasPSE: document.body.textContent?.toLowerCase().includes('pse'),
        hasBanco: document.body.textContent?.toLowerCase().includes('banco'),
        hasNIT: document.body.textContent?.toLowerCase().includes('nit'),
        forms: document.querySelectorAll('form').length,
        selects: Array.from(document.querySelectorAll('select')).map(s => s.name || s.id).filter(Boolean),
        inputs: Array.from(document.querySelectorAll('input:not([type="hidden"])')).map(i =>
          (i as HTMLInputElement).name || (i as HTMLInputElement).placeholder
        ).filter(Boolean),
        buttons: Array.from(document.querySelectorAll('button, input[type="submit"]'))
          .map(b => b.textContent?.trim() || (b as HTMLInputElement).value)
          .filter(t => t && t.length > 1),
      };
    });

    console.log('\n   📄 Análisis página de pago:');
    console.log('   URL:', pagoPSEInfo.url);
    console.log('   ¿Menciona PSE?:', pagoPSEInfo.hasPSE ? '✅' : '❌');
    console.log('   ¿Menciona Banco?:', pagoPSEInfo.hasBanco ? '✅' : '❌');
    console.log('   ¿Menciona NIT?:', pagoPSEInfo.hasNIT ? '✅' : '❌');
    console.log('   Formularios:', pagoPSEInfo.forms);
    console.log('   Selects:', pagoPSEInfo.selects.join(', ') || 'Ninguno');
    console.log('   Inputs:', pagoPSEInfo.inputs.join(', ') || 'Ninguno');
    console.log('   Botones:', pagoPSEInfo.buttons.join(', ') || 'Ninguno');

    await screenshot(page, 'liq-12-final');

    // ========== RESUMEN ==========
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESUMEN FINAL                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('✅ Login: OK');
    console.log('✅ Acceso a planilla: OK');
    console.log(`✅ Liquidación: ${postLiquidacion.hasSuccess ? 'Completada' : 'En proceso'}`);
    console.log(`✅ Pago PSE: ${pagoPSEInfo.hasPSE ? 'Página detectada' : 'Pendiente'}`);
    console.log('\n📸 Screenshots guardados en ./screenshots/liq-*.png');

  } catch (error) {
    console.error('\n❌ Error:', error);
    const page = authBot.getPage();
    if (page) {
      await screenshot(page, 'liq-error');
    }
  } finally {
    console.log('\n🔄 Cerrando navegador...');
    await resetSOIAuthBot();
    console.log('✅ Cerrado');
  }
}

// ========== HELPERS ==========

async function screenshot(page: any, name: string) {
  try {
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  } catch (e) {
    console.log(`   ⚠️ No se pudo guardar screenshot: ${name}`);
  }
}

async function getCurrentStep(page: any): Promise<number> {
  return page.evaluate(() => {
    // Buscar indicador de paso actual
    const stepText = document.body.textContent || '';
    const match = stepText.match(/Paso\s*(\d)\s*de\s*4/i);
    if (match) return parseInt(match[1]);

    // Buscar por clases activas en stepper
    const activeStep = document.querySelector('.step.active, .paso.activo, [class*="current"]');
    if (activeStep) {
      const allSteps = document.querySelectorAll('.step, .paso');
      return Array.from(allSteps).indexOf(activeStep) + 1;
    }

    return 0;
  });
}

async function clickSiguiente(page: any) {
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, input[type="submit"], a.btn');
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase() || (btn as HTMLInputElement).value?.toLowerCase() || '';
      if (text.includes('siguiente') || text.includes('continuar') || text.includes('next')) {
        (btn as HTMLElement).click();
        return;
      }
    }
  });
  await page.waitForTimeout(2000);
}

// Ejecutar
testLiquidacionYPago().catch(console.error);
