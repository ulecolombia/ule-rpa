/**
 * FLUJO COMPLETO: Crear Planilla desde 0 → Liquidar → Pagar hasta PASO 9
 *
 * 1. Login SOI
 * 2. Ir a "Deseo liquidar una planilla"
 * 3. Seleccionar periodo (Abril 2026)
 * 4. Crear nueva planilla con IBC = 2,500,000
 * 5. Liquidar
 * 6. Pagar (SOI → PSE → Bancolombia)
 * 7. Bancolombia Negocios
 * 8. Ingresar usuario
 */

import { getSOIAuthBot } from '../src/bots/soi/auth.bot';

// Datos de liquidación
const LIQUIDACION_DATA = {
  periodoMes: 4, // Abril 2026 (usar mes que no tenga planilla)
  periodoAno: 2026,
  ibc: 2500000, // $2,500,000
};

// Datos PSE
const ULE_PSE_DATA = {
  nit: '9020190314',
  email: 'pagos.ule@gmail.com',
};

// Datos Bancolombia
const BANCOLOMBIA_USER = 'Lbrochet01';

async function flujoCrearPlanillaCompleto() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   📋 FLUJO COMPLETO: Crear Planilla → Liquidar → Pagar    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`   IBC: $${LIQUIDACION_DATA.ibc.toLocaleString()}`);
  console.log(`   Periodo: ${LIQUIDACION_DATA.periodoMes}/${LIQUIDACION_DATA.periodoAno}\n`);

  const authBot = getSOIAuthBot();

  // ═══════════════════════════════════════════════════════════════
  // PASO 1: Login
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 1: Login SOI');
  console.log('═══════════════════════════════════════════════════════════\n');

  let page = authBot.getPage();
  if (!page) {
    console.log('   Iniciando login...');
    await authBot.login();
    page = authBot.getPage();
    if (!page) throw new Error('No page');
    console.log('   ✅ Login OK\n');
    await page.waitForTimeout(2000);
  }

  await ss(page, 'crear-01-login');

  // ═══════════════════════════════════════════════════════════════
  // PASO 2: Ir a "Deseo liquidar una planilla"
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 2: Navegar a "Deseo liquidar una planilla"');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Ir al dashboard
  await page.goto('https://servicio.nuevosoi.com.co/soi/inicio.do', { waitUntil: 'networkidle0' });
  await page.waitForTimeout(2000);

  // Buscar y clickear "Deseo liquidar una planilla"
  const clickedLiquidar = await page.evaluate(() => {
    const links = document.querySelectorAll('a');
    for (const link of links) {
      if (link.textContent?.includes('Deseo liquidar una planilla')) {
        link.click();
        return true;
      }
    }
    return false;
  });

  if (clickedLiquidar) {
    console.log('   ✅ Click en "Deseo liquidar una planilla"');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    console.log('   ✅ Navegación completada\n');
  } else {
    console.log('   ⚠️ Link no encontrado, navegando directamente...');
    await page.goto('https://servicio.nuevosoi.com.co/soi/gestionPlanillas.do', { waitUntil: 'networkidle0' });
  }

  await page.waitForTimeout(2000);
  await ss(page, 'crear-02-gestionar-planillas');
  console.log(`   URL: ${page.url()}\n`);

  // ═══════════════════════════════════════════════════════════════
  // PASO 3: Seleccionar TIPO PLANILLA y PERIODO
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 3: Configurar planilla (Tipo I + Periodo)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Analizar qué elementos tiene la página
  const pageElements = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    const inputs = document.querySelectorAll('input');
    const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');

    return {
      selects: Array.from(selects).map((s) => ({
        name: s.name,
        id: s.id,
        optionsCount: s.options.length,
        firstOptions: Array.from(s.options).slice(0, 8).map((o) => `${o.value}:${o.text}`),
      })),
      inputs: Array.from(inputs)
        .filter((i) => i.type !== 'hidden')
        .map((i) => ({ name: i.name, id: i.id, type: i.type })),
      buttons: Array.from(buttons).map((b) => ((b as HTMLElement).innerText || (b as HTMLInputElement).value || '').trim()),
    };
  });

  console.log('   📊 Elementos encontrados:');
  console.log(`   - Selects: ${pageElements.selects.length}`);
  pageElements.selects.forEach((s) => {
    console.log(`     • ${s.name || s.id}: [${s.firstOptions.slice(0, 5).join(', ')}${s.optionsCount > 5 ? '...' : ''}]`);
  });
  console.log(`   - Botones: ${pageElements.buttons.filter((b) => b).slice(0, 8).join(', ')}\n`);

  // ═══ 3.1: Seleccionar TIPO PLANILLA = "I" (INDEPENDIENTES) ═══
  console.log('   🔹 Seleccionando tipo planilla: I-INDEPENDIENTES...');
  const tipoSelected = await page.evaluate(() => {
    // Buscar el select de tipo planilla por nombre exacto
    const select = document.querySelector('select[name="tipoPlanilla"]') as HTMLSelectElement;
    if (select) {
      const options = Array.from(select.options);
      // Buscar opción que empiece con "I" (I-INDEPENDIENTES)
      const option = options.find((o) => o.value === 'I' || o.text.startsWith('I-'));
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return `${option.value}: ${option.text}`;
      }
    }
    return null;
  });
  console.log(`   ✅ Tipo planilla: ${tipoSelected || 'NO ENCONTRADO'}`);
  await page.waitForTimeout(1000);

  // ═══ 3.2: Seleccionar MES ═══
  const meses = ['', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const mesNombre = meses[LIQUIDACION_DATA.periodoMes];

  console.log(`   🔹 Seleccionando mes: ${mesNombre}...`);
  const mesSelected = await page.evaluate((mes) => {
    const select = document.querySelector('select[name="periodoLiquidacionMes"]') as HTMLSelectElement;
    if (select) {
      const options = Array.from(select.options);
      const option = options.find((o) => o.text.toUpperCase().includes(mes) || o.value === mes);
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return option.text;
      }
    }
    return null;
  }, mesNombre);
  console.log(`   ✅ Mes: ${mesSelected || 'NO ENCONTRADO'}`);
  await page.waitForTimeout(500);

  // ═══ 3.3: Seleccionar AÑO (campo: periodoLiquidacionAnnio) ═══
  console.log(`   🔹 Seleccionando año: ${LIQUIDACION_DATA.periodoAno}...`);
  const anoSelected = await page.evaluate((ano) => {
    // Campo correcto es "periodoLiquidacionAnnio" (doble n)
    const select = document.querySelector('select[name="periodoLiquidacionAnnio"]') as HTMLSelectElement;
    if (select) {
      const options = Array.from(select.options);
      const option = options.find((o) => o.text.includes(ano.toString()) || o.value === ano.toString());
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return option.text;
      }
    }
    return null;
  }, LIQUIDACION_DATA.periodoAno);
  console.log(`   ✅ Año: ${anoSelected || 'NO ENCONTRADO'}`);
  await page.waitForTimeout(500);

  // ═══ 3.4: LIMPIAR CCF (Usuario NO tiene Caja de Compensación) ═══
  console.log('   🔹 Limpiando CCF (usuario sin caja de compensación)...');
  const ccfCleared = await page.evaluate(() => {
    const select = document.querySelector('select[name="adminCCF"]') as HTMLSelectElement;
    if (select && select.options.length > 0) {
      // Buscar opción "SELECCIONE" o primera opción vacía
      const emptyOption = Array.from(select.options).find(
        (o) => o.value === '' || o.text.includes('SELECCIONE')
      );
      if (emptyOption) {
        select.value = emptyOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return 'SELECCIONE (limpiado)';
      }
    }
    return null;
  });
  console.log(`   ✅ CCF: ${ccfCleared || 'no se pudo limpiar'}\n`);

  await page.waitForTimeout(1000);
  await ss(page, 'crear-03-tipo-periodo-seleccionado');

  // ═══ 3.5: Click en botón SIGUIENTE del wizard ═══
  console.log('   🔹 Buscando botón "Siguiente" del wizard...');

  // El botón "Siguiente" puede ser un input type="button" con value="Siguiente"
  const clickedSiguiente = await page.evaluate(() => {
    // Primero buscar input con value="Siguiente"
    const inputBtn = document.querySelector('input[type="button"][value="Siguiente"], input[type="submit"][value="Siguiente"]') as HTMLInputElement;
    if (inputBtn) {
      inputBtn.click();
      return 'input button: Siguiente';
    }

    // Buscar botón con texto "Siguiente"
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.innerText.trim().toLowerCase() === 'siguiente') {
        btn.click();
        return 'button: Siguiente';
      }
    }

    // Buscar link con texto "Siguiente"
    const links = document.querySelectorAll('a');
    for (const link of links) {
      if (link.innerText.trim().toLowerCase() === 'siguiente') {
        link.click();
        return 'link: Siguiente';
      }
    }

    // Buscar cualquier elemento clickeable con "Siguiente"
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const text = (el as HTMLElement).innerText?.trim().toLowerCase();
      const value = (el as HTMLInputElement).value?.toLowerCase();
      if ((text === 'siguiente' || value === 'siguiente') &&
          (el.tagName === 'INPUT' || el.tagName === 'BUTTON' || el.tagName === 'A')) {
        (el as HTMLElement).click();
        return `${el.tagName}: Siguiente`;
      }
    }

    return null;
  });

  if (clickedSiguiente) {
    console.log(`   ✅ Click en "${clickedSiguiente}"`);
    await page.waitForTimeout(3000);
  } else {
    console.log('   ⚠️ Botón "Siguiente" no encontrado');
  }

  await ss(page, 'crear-03b-despues-siguiente');
  console.log(`   URL actual: ${page.url()}\n`);

  // ═══════════════════════════════════════════════════════════════
  // PASO 4: Agregar cotizante (paso 2 del wizard)
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 4: Agregar cotizante (click directo)');
  console.log('═══════════════════════════════════════════════════════════\n');

  await ss(page, 'crear-04-paso2-wizard');

  // El cotizante es el mismo usuario (independiente)
  const COTIZANTE_DOC = '1018482146';
  const TIPO_DOC = 'CC'; // Cédula de Ciudadanía

  // Click directo en "Agregar cotizante" (sin buscar primero)
  console.log('   🔹 Buscando link "Agregar cotizante"...');
  const clickedAgregar = await page.evaluate(() => {
    // Buscar el texto "Agregar cotizante" en cualquier elemento clickeable
    const elements = document.querySelectorAll('a, span, td, div');
    for (const el of elements) {
      const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';
      if (text === 'agregar cotizante' || text.includes('agregar cotizante')) {
        (el as HTMLElement).click();
        return 'link: agregar cotizante';
      }
    }
    // También buscar por imagen
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      const src = img.src?.toLowerCase() || '';
      const alt = img.alt?.toLowerCase() || '';
      const parent = img.parentElement;
      const parentText = parent?.innerText?.toLowerCase() || '';
      if (src.includes('agregar') || alt.includes('agregar') || parentText.includes('agregar cotizante')) {
        (parent || img).click();
        return 'img/parent: agregar';
      }
    }
    return null;
  });

  if (clickedAgregar) {
    console.log(`   ✅ Click en: ${clickedAgregar}`);
    await page.waitForTimeout(3000);
  } else {
    console.log('   ⚠️ Link "Agregar cotizante" no encontrado');
  }

  await ss(page, 'crear-04b-despues-agregar');

  // Analizar qué formulario/modal apareció
  const formElements = await page.evaluate(() => {
    return {
      inputs: Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'))
        .filter((i) => (i as HTMLInputElement).type !== 'hidden')
        .map((i) => ({ name: (i as HTMLInputElement).name, id: i.id, value: (i as HTMLInputElement).value, placeholder: (i as HTMLInputElement).placeholder })),
      selects: Array.from(document.querySelectorAll('select')).map((s) => ({
        name: s.name,
        id: s.id,
        options: Array.from(s.options).slice(0, 5).map((o) => `${o.value}:${o.text}`),
      })),
      textContent: document.body.innerText.substring(0, 1000),
    };
  });

  console.log('\n   📊 Elementos del formulario cotizante:');
  console.log(`   Inputs (${formElements.inputs.length}):`);
  formElements.inputs.slice(0, 15).forEach((i) => {
    console.log(`     • ${i.name || i.id}: "${i.value || ''}" (placeholder: ${i.placeholder || 'N/A'})`);
  });
  console.log(`\n   Selects (${formElements.selects.length}):`);
  formElements.selects.slice(0, 10).forEach((s) => {
    console.log(`     • ${s.name || s.id}: [${s.options.join(', ')}]`);
  });

  await ss(page, 'crear-04c-formulario-cotizante');

  // Buscar y llenar campos del cotizante
  console.log('\n   🔹 Llenando datos del cotizante...');

  // 1. Tipo de documento
  const tipoDocFilled = await page.evaluate((tipoDoc) => {
    const selectors = ['select[name*="tipoDoc"]', 'select[name*="tpId"]', 'select[id*="tipoDoc"]', 'select[id*="tpId"]'];
    for (const sel of selectors) {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (select) {
        const options = Array.from(select.options);
        const option = options.find((o) => o.value === tipoDoc || o.text.includes(tipoDoc) || o.text.includes('CEDULA') || o.text.includes('CÉDULA'));
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return `${sel}: ${option.text}`;
        }
      }
    }
    return null;
  }, TIPO_DOC);
  console.log(`   Tipo documento: ${tipoDocFilled || 'no encontrado'}`);

  // 2. Número de documento
  const numDocFilled = await page.evaluate((numDoc) => {
    const selectors = ['input[name*="numIden"]', 'input[name*="numDoc"]', 'input[name*="documento"]', 'input[id*="numIden"]', 'input[id*="documento"]'];
    for (const sel of selectors) {
      const input = document.querySelector(sel) as HTMLInputElement;
      if (input && input.type !== 'hidden') {
        input.value = numDoc;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return `${sel}: ${numDoc}`;
      }
    }
    return null;
  }, COTIZANTE_DOC);
  console.log(`   Número documento: ${numDocFilled || 'no encontrado'}`);

  await page.waitForTimeout(1000);
  await ss(page, 'crear-04d-datos-cotizante');

  // ═══════════════════════════════════════════════════════════════
  // PASO 5: Ingresar IBC (Ingreso Base de Cotización)
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📍 PASO 5: Ingresar IBC = $${LIQUIDACION_DATA.ibc.toLocaleString()}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Mostrar todos los inputs disponibles para debug
  const allInputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input'))
      .filter((i) => i.type !== 'hidden')
      .map((i) => ({
        name: i.name,
        id: i.id,
        type: i.type,
        value: i.value,
        className: i.className,
      }));
  });
  console.log('   📊 Inputs disponibles:');
  allInputs.slice(0, 20).forEach((i) => {
    console.log(`     • ${i.name || i.id || 'sin-nombre'} (${i.type}): "${i.value}" [class: ${i.className}]`);
  });

  // Buscar e ingresar el IBC en el campo correcto
  const ibcFilled = await page.evaluate((ibc) => {
    // Buscar campo de IBC/Salario/Ingreso por nombre o id
    const possibleSelectors = [
      'input[name*="ibc" i]',
      'input[name*="salario" i]',
      'input[name*="ingreso" i]',
      'input[name*="smlv" i]',
      'input[id*="ibc" i]',
      'input[id*="salario" i]',
      'input[id*="ingreso" i]',
    ];

    for (const selector of possibleSelectors) {
      const input = document.querySelector(selector) as HTMLInputElement;
      if (input && input.type !== 'hidden') {
        input.value = '';
        input.focus();
        input.value = ibc.toString();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        return { filled: true, field: input.name || input.id, selector };
      }
    }

    // Si no encontró por selector, buscar por etiquetas cercanas
    const tds = document.querySelectorAll('td, label, span');
    for (const td of tds) {
      const text = td.textContent?.toLowerCase() || '';
      if (text.includes('ibc') || text.includes('ingreso base') || text.includes('salario')) {
        // Buscar input en la misma fila o elemento siguiente
        const row = td.closest('tr');
        if (row) {
          const input = row.querySelector('input[type="text"], input[type="number"]') as HTMLInputElement;
          if (input && input.type !== 'hidden') {
            input.value = '';
            input.focus();
            input.value = ibc.toString();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            return { filled: true, field: input.name || input.id, selector: 'by label' };
          }
        }
      }
    }

    return { filled: false, field: null, selector: null };
  }, LIQUIDACION_DATA.ibc);

  if (ibcFilled.filled) {
    console.log(`\n   ✅ IBC ingresado: $${LIQUIDACION_DATA.ibc.toLocaleString()} (campo: ${ibcFilled.field}, selector: ${ibcFilled.selector})`);
  } else {
    console.log('\n   ⚠️ Campo IBC no encontrado automáticamente');
  }

  await page.waitForTimeout(500);
  await ss(page, 'crear-05-ibc-ingresado');

  // ═══════════════════════════════════════════════════════════════
  // PASO 6: NO llenar CCF (usuario independiente sin caja compensación)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 6: Verificar campos opcionales (CCF no se llena)');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('   ℹ️  CCF (Caja de Compensación): NO APLICA - usuario sin CCF');
  console.log('   ℹ️  Solo se llenarán campos obligatorios\n');

  // Verificar si hay más campos obligatorios que llenar
  const camposRequeridos = await page.evaluate(() => {
    const required: string[] = [];
    const inputs = document.querySelectorAll('input[required], select[required], input.required, select.required');
    inputs.forEach((el) => {
      const name = (el as HTMLInputElement).name || el.id;
      const value = (el as HTMLInputElement).value;
      if (!value || value === '' || value === 'SELECCIONE') {
        required.push(name);
      }
    });
    return required;
  });

  if (camposRequeridos.length > 0) {
    console.log('   ⚠️ Campos requeridos sin valor:');
    camposRequeridos.forEach((c) => console.log(`     - ${c}`));
  } else {
    console.log('   ✅ Todos los campos obligatorios tienen valor');
  }

  await page.waitForTimeout(500);
  await ss(page, 'crear-06-campos-verificados');

  // ═══════════════════════════════════════════════════════════════
  // PASO 7: Avanzar en wizard - Click en botón Siguiente
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 7: Avanzar en wizard (botón Siguiente)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Buscar SOLO botones del wizard (no links de menú)
  const clickedWizardBtn = await page.evaluate(() => {
    // Buscar input type=button con value="Siguiente" o "Guardar"
    const wizardBtns = document.querySelectorAll('input[type="button"], input[type="submit"]');
    for (const btn of wizardBtns) {
      const value = (btn as HTMLInputElement).value?.toLowerCase() || '';
      if (value === 'siguiente' || value === 'guardar' || value === 'continuar') {
        (btn as HTMLElement).click();
        return `input: ${value}`;
      }
    }

    // Buscar button con texto Siguiente/Guardar
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.innerText?.trim().toLowerCase() || '';
      if (text === 'siguiente' || text === 'guardar' || text === 'continuar') {
        btn.click();
        return `button: ${text}`;
      }
    }

    return null;
  });

  if (clickedWizardBtn) {
    console.log(`   ✅ Click en ${clickedWizardBtn}`);
    await page.waitForTimeout(3000);
  } else {
    console.log('   ⚠️ Botón del wizard no encontrado');
  }

  await ss(page, 'crear-07-wizard-avanzado');
  console.log(`   URL: ${page.url()}\n`);

  // ═══════════════════════════════════════════════════════════════
  // PASO 8: Verificar estado y continuar si hay más pasos
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 PASO 8: Verificar estado actual');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Analizar página actual
  const estadoActual = await page.evaluate(() => {
    const body = document.body.innerText;
    const bodyLower = body.toLowerCase();

    return {
      url: window.location.href,
      tieneError: bodyLower.includes('error') || bodyLower.includes('falló'),
      tieneExito: bodyLower.includes('exitosamente') || bodyLower.includes('liquidada') || bodyLower.includes('guardada'),
      tienePlanilla: /planilla[:\s]*(\d{10,})/i.test(body),
      numeroPlanilla: body.match(/planilla[:\s]*(\d{10,})/i)?.[1] || null,
      tienePagar: bodyLower.includes('pagar') || bodyLower.includes('pago'),
      textoResumen: body.substring(0, 500),
    };
  });

  console.log(`   URL: ${estadoActual.url}`);
  console.log(`   Error: ${estadoActual.tieneError}`);
  console.log(`   Éxito: ${estadoActual.tieneExito}`);
  console.log(`   Número planilla: ${estadoActual.numeroPlanilla || 'no detectado'}`);
  console.log(`   Opción pagar: ${estadoActual.tienePagar}\n`);

  await ss(page, 'crear-08-estado-final');

  // ═══════════════════════════════════════════════════════════════
  // RESUMEN FINAL
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 RESUMEN                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`   📋 Tipo planilla: I-INDEPENDIENTES`);
  console.log(`   📅 Periodo: ${LIQUIDACION_DATA.periodoMes}/${LIQUIDACION_DATA.periodoAno}`);
  console.log(`   💰 IBC: $${LIQUIDACION_DATA.ibc.toLocaleString()}`);
  console.log(`   📸 Screenshots en ./screenshots/crear-*.png`);
  console.log(`   🌐 URL final: ${page.url()}\n`);

  if (estadoActual.numeroPlanilla) {
    console.log(`   ✅ PLANILLA CREADA: ${estadoActual.numeroPlanilla}\n`);
  }

  console.log('   ⏳ Esperando 120 segundos para revisión manual...\n');
  await page.waitForTimeout(120000);

  console.log('✅ Finalizado');
}

async function ss(page: any, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
}

flujoCrearPlanillaCompleto().catch(console.error);
