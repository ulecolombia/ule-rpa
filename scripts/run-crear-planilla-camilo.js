/**
 * Test: Crear Planilla SOI para Camilo Maturana
 *
 * - CC: 1047478670
 * - Password: Ulecolombia123*
 * - IBC: 3,000,000
 * - Periodo: MARZO 2026
 * - headless: false
 */

require('dotenv').config();

// Force headless false
process.env.PUPPETEER_HEADLESS = 'false';

const { SOIAuthBot } = require('../dist/bots/soi/auth.bot');

const CREDENTIALS = {
  tipoDocumento: 'CC',
  documento: '1047478670',
  password: 'Ulecolombia123*',
};

const LIQUIDACION_DATA = {
  periodoMes: 3, // MARZO
  periodoAno: 2026,
  ibc: 3000000,
};

const ULE_PSE_DATA = {
  nit: '9020190314',
  email: 'pagos.ule@gmail.com',
};

const BANCOLOMBIA_USER = 'Lbrochet01';

async function ss(page, name) {
  const dir = require('path').join(process.cwd(), 'screenshots');
  require('fs').mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {});
  console.log(`   📸 Screenshot: ${name}.png`);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   FLUJO COMPLETO: Crear Planilla SOI - Camilo Maturana   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`   CC: ${CREDENTIALS.documento}`);
  console.log(`   IBC: $${LIQUIDACION_DATA.ibc.toLocaleString()}`);
  console.log(`   Periodo: ${LIQUIDACION_DATA.periodoMes}/${LIQUIDACION_DATA.periodoAno}\n`);

  const authBot = new SOIAuthBot();

  // ═══════════════════════════════════════════════════════════════
  // PASO 1: Login como Camilo Maturana
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PASO 1: Login SOI (Camilo Maturana - CC 1047478670)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const session = await authBot.loginAsUser(CREDENTIALS);
  console.log(`   Login OK: ${session.userName}\n`);

  const page = authBot.getPage();
  if (!page) throw new Error('No page after login');

  await page.waitForTimeout(2000);
  await ss(page, 'camilo-01-login');

  // ═══════════════════════════════════════════════════════════════
  // PASO 2: Ir a "Deseo liquidar una planilla"
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PASO 2: Navegar a "Deseo liquidar una planilla"');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.goto('https://servicio.nuevosoi.com.co/soi/inicio.do', { waitUntil: 'networkidle0' });
  await page.waitForTimeout(2000);

  const clickedLiquidar = await page.evaluate(() => {
    const links = document.querySelectorAll('a');
    for (const link of links) {
      if (link.textContent && link.textContent.includes('Deseo liquidar una planilla')) {
        link.click();
        return true;
      }
    }
    return false;
  });

  if (clickedLiquidar) {
    console.log('   Click en "Deseo liquidar una planilla"');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
  } else {
    console.log('   Link no encontrado, navegando directo...');
    await page.goto('https://servicio.nuevosoi.com.co/soi/gestionPlanillas.do', { waitUntil: 'networkidle0' });
  }

  await page.waitForTimeout(2000);
  await ss(page, 'camilo-02-gestionar-planillas');
  console.log(`   URL: ${page.url()}\n`);

  // ═══════════════════════════════════════════════════════════════
  // PASO 3: Seleccionar TIPO PLANILLA y PERIODO
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PASO 3: Configurar planilla (Tipo I + Periodo MARZO 2026)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Analizar elementos
  const pageElements = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    return {
      selects: Array.from(selects).map(s => ({
        name: s.name,
        id: s.id,
        options: Array.from(s.options).slice(0, 8).map(o => `${o.value}:${o.text}`),
      })),
    };
  });
  console.log('   Selects encontrados:');
  pageElements.selects.forEach(s => {
    console.log(`     ${s.name || s.id}: [${s.options.slice(0, 5).join(', ')}]`);
  });

  // 3.1: Tipo planilla = I
  console.log('\n   Seleccionando tipo planilla: I-INDEPENDIENTES...');
  const tipoSelected = await page.evaluate(() => {
    const select = document.querySelector('select[name="tipoPlanilla"]');
    if (select) {
      const options = Array.from(select.options);
      const option = options.find(o => o.value === 'I' || o.text.startsWith('I-'));
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return `${option.value}: ${option.text}`;
      }
    }
    return null;
  });
  console.log(`   Tipo planilla: ${tipoSelected || 'NO ENCONTRADO'}`);
  await page.waitForTimeout(1000);

  // 3.2: Mes = MARZO
  const meses = ['', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const mesNombre = meses[LIQUIDACION_DATA.periodoMes];
  console.log(`   Seleccionando mes: ${mesNombre}...`);
  const mesSelected = await page.evaluate((mes) => {
    const select = document.querySelector('select[name="periodoLiquidacionMes"]');
    if (select) {
      const options = Array.from(select.options);
      const option = options.find(o => o.text.toUpperCase().includes(mes) || o.value === mes);
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return option.text;
      }
    }
    return null;
  }, mesNombre);
  console.log(`   Mes: ${mesSelected || 'NO ENCONTRADO'}`);
  await page.waitForTimeout(500);

  // 3.3: Ano = 2026
  console.log(`   Seleccionando ano: ${LIQUIDACION_DATA.periodoAno}...`);
  const anoSelected = await page.evaluate((ano) => {
    const select = document.querySelector('select[name="periodoLiquidacionAnnio"]');
    if (select) {
      const options = Array.from(select.options);
      const option = options.find(o => o.text.includes(ano.toString()) || o.value === ano.toString());
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return option.text;
      }
    }
    return null;
  }, LIQUIDACION_DATA.periodoAno);
  console.log(`   Ano: ${anoSelected || 'NO ENCONTRADO'}`);
  await page.waitForTimeout(500);

  // 3.4: Limpiar CCF
  console.log('   Limpiando CCF...');
  await page.evaluate(() => {
    const select = document.querySelector('select[name="adminCCF"]');
    if (select && select.options.length > 0) {
      const emptyOption = Array.from(select.options).find(o => o.value === '' || o.text.includes('SELECCIONE'));
      if (emptyOption) {
        select.value = emptyOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });

  await page.waitForTimeout(1000);
  await ss(page, 'camilo-03-tipo-periodo');

  // 3.5: Click Siguiente
  console.log('   Click en Siguiente...');
  const clickedSiguiente = await page.evaluate(() => {
    const inputBtn = document.querySelector('input[type="button"][value="Siguiente"], input[type="submit"][value="Siguiente"]');
    if (inputBtn) { inputBtn.click(); return 'input: Siguiente'; }
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.innerText.trim().toLowerCase() === 'siguiente') { btn.click(); return 'button: Siguiente'; }
    }
    return null;
  });
  console.log(`   ${clickedSiguiente || 'Boton no encontrado'}`);
  await page.waitForTimeout(3000);
  await ss(page, 'camilo-03b-despues-siguiente');
  console.log(`   URL: ${page.url()}\n`);

  // ═══════════════════════════════════════════════════════════════
  // PASO 4: Agregar cotizante (Camilo mismo)
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PASO 4: Agregar cotizante (CC 1047478670)');
  console.log('═══════════════════════════════════════════════════════════\n');

  await ss(page, 'camilo-04-paso2-wizard');

  // Intentar llamar funcion JS agregarCotizante directamente
  console.log('   Llamando agregarCotizante()...');
  const agregar = await page.evaluate(() => {
    if (typeof window.agregarCotizante === 'function') {
      window.agregarCotizante();
      return 'JS function called';
    }
    // Fallback: buscar link
    const elements = document.querySelectorAll('a, span, td, div, input');
    for (const el of elements) {
      const text = (el.innerText || '').trim().toLowerCase();
      const onclick = el.getAttribute('onclick') || '';
      if (text.includes('agregar cotizante') || onclick.includes('agregarCotizante')) {
        el.click();
        return `Clicked: ${el.tagName} (${text || onclick})`;
      }
    }
    return null;
  });
  console.log(`   ${agregar || 'No se pudo agregar cotizante'}`);
  await page.waitForTimeout(3000);

  // Buscar popup de cotizante
  console.log('   Buscando popup de cotizante...');
  const browser = authBot.getBrowser();
  let popup = null;

  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const pages = await browser.pages();
    for (const p of pages) {
      const url = p.url();
      if (url.includes('ingresarCotizante') || url.includes('informacionBasica') || url.includes('cotizante')) {
        if (url !== page.url()) {
          popup = p;
          break;
        }
      }
    }
    if (popup) break;
    console.log(`   Intento ${i + 1}/15...`);
  }

  if (popup) {
    console.log(`   Popup encontrado: ${popup.url()}`);
    await ss(popup, 'camilo-04b-popup-cotizante');

    // Llenar tipo documento
    console.log('   Llenando tipo documento: CC');
    await popup.evaluate(() => {
      const select = document.querySelector('select[name="tipoIdentificacionCotizante"]');
      if (select) {
        const options = Array.from(select.options);
        const option = options.find(o => o.value === 'CC' || o.text.includes('CEDULA') || o.text.includes('C.C'));
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    await popup.waitForTimeout(500);

    // Llenar numero documento
    console.log('   Llenando documento: 1047478670');
    const docInput = await popup.$('input[name="numeroIdentificacionCotizante"]');
    if (docInput) {
      await docInput.click({ clickCount: 3 });
      await docInput.type('1047478670', { delay: 50 });
      // Trigger blur para BDUA autocomplete
      await popup.evaluate(() => {
        const input = document.querySelector('input[name="numeroIdentificacionCotizante"]');
        if (input) {
          input.blur();
          input.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      });
      console.log('   Esperando BDUA autocomplete...');
      await popup.waitForTimeout(5000);
    }

    await ss(popup, 'camilo-04c-datos-cotizante');

    // Verificar que BDUA lleno los nombres
    const nombres = await popup.evaluate(() => {
      const primerNombre = document.querySelector('input[name="primerNombreCotizante"]');
      const primerApellido = document.querySelector('input[name="primerApellidoCotizante"]');
      return {
        nombre: primerNombre ? primerNombre.value : 'N/A',
        apellido: primerApellido ? primerApellido.value : 'N/A',
      };
    });
    console.log(`   BDUA: ${nombres.nombre} ${nombres.apellido}`);

    // Seleccionar tipo cotizante: 3 (Independiente)
    console.log('   Seleccionando tipo cotizante: 3-INDEPENDIENTE');
    await popup.evaluate(() => {
      const select = document.querySelector('select[name="tipoCotizante"]');
      if (select) {
        const options = Array.from(select.options);
        const option = options.find(o => o.value.startsWith('3,') || o.text.includes('INDEPENDIENTE'));
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    await popup.waitForTimeout(2000);

    // Seleccionar departamento: BOLIVAR
    console.log('   Seleccionando departamento: BOLIVAR');
    await popup.evaluate(() => {
      const select = document.querySelector('select[name="departamento"]');
      if (select) {
        const options = Array.from(select.options);
        const option = options.find(o => o.text.toUpperCase().includes('BOLIVAR') || o.text.toUpperCase().includes('BOLÍVAR'));
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    await popup.waitForTimeout(2000);

    // Seleccionar municipio: CARTAGENA
    console.log('   Seleccionando municipio: CARTAGENA');
    await popup.evaluate(() => {
      const select = document.querySelector('select[name="municipio"]');
      if (select) {
        const options = Array.from(select.options);
        const option = options.find(o => o.text.toUpperCase().includes('CARTAGENA'));
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    await popup.waitForTimeout(1000);

    await ss(popup, 'camilo-04d-cotizante-llenado');

    // Click Siguiente en popup (paso 1 -> paso 2)
    console.log('   Click Siguiente en popup...');
    await popup.evaluate(() => {
      const btn = document.querySelector('input#siguiente2, input[value="Siguiente"]');
      if (btn) btn.click();
    });
    await popup.waitForTimeout(3000);
    await ss(popup, 'camilo-04e-paso2-popup');
    console.log(`   Popup URL: ${popup.url()}`);

    // Navegar por sub-pasos del popup hasta seguridad social (paso 3)
    // El popup tiene: informacionBasica -> novedades -> seguridadSocial -> parafiscales -> resumen

    // Si estamos en novedades, avanzar
    if (popup.url().includes('novedades') || popup.url().includes('informacionBasica')) {
      console.log('   Avanzando por sub-pasos...');
      const seguirAvanzando = async () => {
        for (let step = 0; step < 5; step++) {
          const currentUrl = popup.url();
          console.log(`   Sub-paso: ${currentUrl.split('/').pop()}`);
          await ss(popup, `camilo-04f-subpaso-${step}`);

          if (currentUrl.includes('seguridadSocial')) {
            console.log('   Llegamos a Seguridad Social!');
            break;
          }

          // Click siguiente
          await popup.evaluate(() => {
            const btns = document.querySelectorAll('input[value="Siguiente"], input[type="button"]');
            for (const btn of btns) {
              if (btn.value && btn.value.toLowerCase().includes('siguiente')) {
                btn.click();
                return;
              }
            }
          });
          await popup.waitForTimeout(3000);
        }
      };
      await seguirAvanzando();
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 5: Ingresar IBC en Seguridad Social
    // ═══════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`PASO 5: Ingresar IBC = $${LIQUIDACION_DATA.ibc.toLocaleString()}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // El campo de salario basico tiene un TYPO en SOI: "sarioBasico" no "salarioBasico"
    const ibcFilled = await popup.evaluate((ibc) => {
      // Intentar con el typo de SOI primero
      const selectors = [
        'input[name="sarioBasico"]',     // TYPO intencional de SOI
        'input[name="salarioBasico"]',
        'input[name*="ibc"]',
        'input[name*="salario"]',
        'input[name*="ingreso"]',
      ];

      for (const sel of selectors) {
        const input = document.querySelector(sel);
        if (input && input.type !== 'hidden') {
          input.value = '';
          input.focus();
          input.value = ibc.toString();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
          return { filled: true, field: input.name, selector: sel };
        }
      }
      return { filled: false };
    }, LIQUIDACION_DATA.ibc);

    if (ibcFilled.filled) {
      console.log(`   IBC ingresado: $${LIQUIDACION_DATA.ibc.toLocaleString()} (campo: ${ibcFilled.field})`);
    } else {
      console.log('   ADVERTENCIA: Campo IBC no encontrado');
      // Listar todos los inputs para debug
      const inputs = await popup.evaluate(() => {
        return Array.from(document.querySelectorAll('input'))
          .filter(i => i.type !== 'hidden')
          .map(i => ({ name: i.name, id: i.id, type: i.type, value: i.value, readOnly: i.readOnly }));
      });
      console.log('   Inputs disponibles:', JSON.stringify(inputs, null, 2));
    }

    await popup.waitForTimeout(1000);
    await ss(popup, 'camilo-05-ibc-ingresado');

    // Mostrar estado de campos de seguridad social
    const ssFields = await popup.evaluate(() => {
      return {
        sarioBasico: document.querySelector('input[name="sarioBasico"]')?.value || 'N/A',
        ibcPension: document.querySelector('input[name="ibcPension"]')?.value || 'N/A',
        ibcSalud: document.querySelector('input[name="ibcSalud"]')?.value || 'N/A',
        diasPension: document.querySelector('input[name="numeroDiasCotizadosPension"]')?.value || 'N/A',
        diasSalud: document.querySelector('input[name="numeroDiasCotizadosSalud"]')?.value || 'N/A',
        tarifaPension: document.querySelector('select[name="tarifaPension"]')?.value || 'N/A',
        tarifaSalud: document.querySelector('select[name="tarifaSalud"]')?.value || 'N/A',
        afp: document.querySelector('select[name="administradoraPension"]')?.value || 'N/A',
        eps: document.querySelector('select[name="administradoraSalud"]')?.value || 'N/A',
      };
    });
    console.log('\n   Campos Seguridad Social:');
    Object.entries(ssFields).forEach(([k, v]) => console.log(`     ${k}: ${v}`));

    // Click Siguiente para avanzar
    console.log('\n   Click Siguiente (seguridad social -> parafiscales/resumen)...');
    await popup.evaluate(() => {
      const btns = document.querySelectorAll('input[value="Siguiente"], input[value="Guardar"]');
      for (const btn of btns) {
        if (!btn.disabled) { btn.click(); return; }
      }
    });
    await popup.waitForTimeout(3000);
    await ss(popup, 'camilo-06-despues-ss');
    console.log(`   Popup URL: ${popup.url()}`);

    // Continuar hasta resumen/guardar
    for (let step = 0; step < 3; step++) {
      const url = popup.url();
      console.log(`   Sub-paso actual: ${url.split('/').pop()}`);

      if (url.includes('resumen')) {
        console.log('   Llegamos al RESUMEN del cotizante');
        await ss(popup, 'camilo-07-resumen-cotizante');

        // Click Guardar
        console.log('   Click Guardar cotizante...');
        await popup.evaluate(() => {
          const btns = document.querySelectorAll('input[value="Guardar"], button');
          for (const btn of btns) {
            const val = btn.value || btn.innerText || '';
            if (val.toLowerCase().includes('guardar')) {
              btn.click();
              return;
            }
          }
        });
        await popup.waitForTimeout(3000);
        break;
      }

      // Click siguiente
      await popup.evaluate(() => {
        const btn = document.querySelector('input[value="Siguiente"]');
        if (btn) btn.click();
      });
      await popup.waitForTimeout(3000);
    }

    await ss(popup, 'camilo-08-cotizante-guardado');
  } else {
    console.log('   ADVERTENCIA: No se encontro popup de cotizante');
    // Puede que ya haya cotizante agregado, continuar
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 6: Volver a la pagina principal y verificar estado
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('PASO 6: Verificar estado en pagina principal');
  console.log('═══════════════════════════════════════════════════════════\n');

  await page.waitForTimeout(2000);
  await ss(page, 'camilo-09-pagina-principal');

  const estado = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      url: window.location.href,
      tieneError: body.toLowerCase().includes('error'),
      tieneExito: body.toLowerCase().includes('exitosamente') || body.toLowerCase().includes('guardada'),
      numeroPlanilla: body.match(/planilla[:\s]*(\d{10,})/i)?.[1] || null,
      tienePagar: body.toLowerCase().includes('pagar'),
      textoPreview: body.substring(0, 800),
    };
  });

  console.log(`   URL: ${estado.url}`);
  console.log(`   Error: ${estado.tieneError}`);
  console.log(`   Exito: ${estado.tieneExito}`);
  console.log(`   Planilla: ${estado.numeroPlanilla || 'no detectado'}`);
  console.log(`   Pagar: ${estado.tienePagar}`);

  // ═══════════════════════════════════════════════════════════════
  // RESUMEN
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      RESUMEN                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`   Usuario: Camilo Andres Maturana Mejia (CC 1047478670)`);
  console.log(`   Tipo planilla: I-INDEPENDIENTES`);
  console.log(`   Periodo: MARZO/2026`);
  console.log(`   IBC: $${LIQUIDACION_DATA.ibc.toLocaleString()}`);
  console.log(`   Screenshots en ./screenshots/camilo-*.png`);
  console.log(`   URL final: ${page.url()}\n`);

  if (estado.numeroPlanilla) {
    console.log(`   PLANILLA CREADA: ${estado.numeroPlanilla}\n`);
  }

  console.log('   Esperando 120 segundos para revision manual...\n');
  await page.waitForTimeout(120000);

  console.log('Finalizado');
  await authBot.close();
}

main().catch(err => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
