/**
 * Script para verificar selectores del popup de Agregar Cotizante en SOI
 *
 * 1. Hace login
 * 2. Navega al Paso 2 de crear planilla
 * 3. Abre el popup de "Agregar cotizante"
 * 4. Imprime el HTML del formulario del popup
 * 5. NO llena nada, solo extrae información de selectores
 *
 * USO: npx tsx scripts/verificar-popup-cotizante.ts
 */

import { PrismaClient } from '@prisma/client';
import { decryptPassword } from '../src/utils/crypto';
import { BrowserManager } from '../src/bots/utils/browser';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import fs from 'fs/promises';

const prisma = new PrismaClient();

const CEDULA = '1047478670';

async function main() {
  console.log('='.repeat(70));
  console.log('VERIFICAR SELECTORES POPUP COTIZANTE SOI');
  console.log('='.repeat(70));

  // Crear directorio de screenshots
  await fs.mkdir('./logs/screenshots', { recursive: true });

  // 1. Obtener credenciales
  console.log('\n[1] Obteniendo credenciales...');
  const user = await prisma.enlaceUser.findFirst({
    where: { numeroDocumento: CEDULA },
  });

  if (!user || !user.soiPassword || !user.soiPasswordIV) {
    throw new Error(`Usuario ${CEDULA} no tiene credenciales SOI`);
  }

  const password = decryptPassword(user.soiPassword, user.soiPasswordIV);
  console.log(`    Usuario: ${user.nombre}`);

  // 2. Lanzar browser
  console.log('\n[2] Lanzando browser...');
  const browserManager = new BrowserManager({ headless: false });
  const browser = await browserManager.launch();
  const page = await browserManager.newPage();

  try {
    // 3. Login
    console.log('\n[3] Haciendo login en SOI...');
    await page.goto(SOI_SELECTORS.URLS.LOGIN_INDEPENDIENTES, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: './logs/screenshots/popup_00_login_page.png', fullPage: true });

    // Analizar la estructura del formulario
    console.log('    Analizando estructura del formulario...');
    const formInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      const selects = document.querySelectorAll('select');
      const divDropdowns = document.querySelectorAll('[class*="select"], [class*="dropdown"], [role="combobox"], [role="listbox"]');
      return {
        inputs: Array.from(inputs).map(i => ({ type: i.type, name: i.name, id: i.id, placeholder: i.placeholder })),
        selects: Array.from(selects).map(s => ({ name: s.name, id: s.id })),
        divDropdowns: Array.from(divDropdowns).map(d => ({ className: (d as HTMLElement).className?.substring(0, 50), role: d.getAttribute('role') })),
      };
    });
    console.log('    Inputs:', JSON.stringify(formInfo.inputs));
    console.log('    Selects:', JSON.stringify(formInfo.selects));
    console.log('    Div dropdowns:', JSON.stringify(formInfo.divDropdowns));

    // La UI usa un select nativo pero con estilos modernos
    // Buscar el select de tipo de documento
    const tipoDocSelect = await page.$('select');
    if (tipoDocSelect) {
      console.log('    Encontrado select nativo para tipo documento');
      // Obtener las opciones disponibles
      const opciones = await page.$$eval('select option', opts =>
        opts.map(o => ({ value: o.value, text: o.text }))
      );
      console.log('    Opciones:', JSON.stringify(opciones));

      // Seleccionar "Cédula de ciudadanía" - buscar el value correcto
      const ccOption = opciones.find(o =>
        o.text.toLowerCase().includes('cédula de ciudadanía') ||
        o.text.toLowerCase().includes('cedula de ciudadania') ||
        o.value === 'CC' || o.value === 'C.C.'
      );

      if (ccOption) {
        console.log(`    Seleccionando: ${ccOption.text} (value: ${ccOption.value})`);
        await page.select('select', ccOption.value);
        await page.waitForTimeout(500);
      }
    } else {
      // Si no hay select nativo, buscar dropdown de Material UI o similar
      console.log('    No hay select nativo, buscando dropdown...');
      const dropdown = await page.$('[class*="MuiSelect"], [role="button"], [class*="dropdown"]');
      if (dropdown) {
        await dropdown.click();
        await page.waitForTimeout(500);
        // Click en opción Cédula
        await page.evaluate(() => {
          const options = document.querySelectorAll('[role="option"], li, [class*="option"]');
          for (const opt of options) {
            if ((opt as HTMLElement).innerText?.toLowerCase().includes('cédula')) {
              (opt as HTMLElement).click();
              return;
            }
          }
        });
        await page.waitForTimeout(500);
      }
    }

    // Número documento - buscar input de texto
    const docInputs = await page.$$('input[type="text"], input:not([type])');
    let docInput = null;
    for (const inp of docInputs) {
      const placeholder = await page.evaluate(el => el.placeholder?.toLowerCase() || '', inp);
      const name = await page.evaluate(el => el.name?.toLowerCase() || '', inp);
      if (placeholder.includes('documento') || placeholder.includes('número') || name.includes('documento') || name.includes('numero')) {
        docInput = inp;
        break;
      }
    }

    if (!docInput && docInputs.length > 0) {
      // Usar el primer input de texto que no sea password
      docInput = docInputs[0];
    }

    if (docInput) {
      await docInput.click({ clickCount: 3 }); // Seleccionar todo
      await docInput.type(CEDULA, { delay: 30 });
      console.log('    Número de documento ingresado');
    }
    await page.waitForTimeout(300);

    // Password
    const pwdInput = await page.$('input[type="password"]');
    if (pwdInput) {
      await pwdInput.click();
      await pwdInput.type(password, { delay: 30 });
      console.log('    Clave ingresada');
    }
    await page.waitForTimeout(300);

    await page.screenshot({ path: './logs/screenshots/popup_01_before_login.png', fullPage: true });

    // Click en botón Ingresar
    const btnIngresar = await page.$('button');
    if (btnIngresar) {
      const btnText = await page.evaluate(el => el.innerText, btnIngresar);
      console.log(`    Haciendo click en: "${btnText}"`);
      await btnIngresar.click();
    }

    await page.waitForTimeout(3000);
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    console.log(`    Login completado. URL: ${page.url()}`);
    await page.screenshot({ path: './logs/screenshots/popup_01_post_login.png', fullPage: true });

    // 4. Verificar login exitoso y navegar usando select "EN LINEA"
    console.log('\n[4] Verificando login exitoso...');

    // Verificar si estamos logueados viendo si hay el select#select_id
    const selectExists = await page.$('#select_id');
    if (!selectExists) {
      // Puede que el login no funcionó, verificar
      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.includes('PRE-') || pageText.includes('Error') || pageText.includes('Inicia sesión')) {
        console.log('    ❌ Login falló. Texto de la página:');
        console.log(pageText.substring(0, 500));
        throw new Error('Login falló');
      }
    }

    console.log('    ✅ Login exitoso, select#select_id encontrado');

    // Seleccionar "EN LINEA" en el select
    console.log('\n[5] Seleccionando "EN LINEA" en el select...');
    await page.select('#select_id', 'linea');
    await page.waitForTimeout(3000);

    // Esperar navegación o que aparezca el formulario
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    console.log(`    URL después de seleccionar: ${page.url()}`);

    // Verificar si estamos en el formulario
    if (!page.url().includes('inicioPlanillaEnLinea') && !page.url().includes('planillaEnLinea')) {
      // Buscar iframe que pueda contener el formulario
      const iframes = await page.$$('iframe');
      console.log(`    Iframes encontrados: ${iframes.length}`);

      // Verificar si el formulario está en la página actual
      const formVisible = await page.$('select[name="tipoPlanilla"]');
      if (formVisible) {
        console.log('    ✅ Formulario encontrado en página actual');
      } else {
        console.log('    Formulario no visible, buscando menú...');

        // Expandir menú "Gestionar Planillas" si existe
        const menuGestionar = await page.evaluate(() => {
          const links = document.querySelectorAll('a, div, span');
          for (const el of links) {
            const text = (el as HTMLElement).innerText?.toLowerCase() || '';
            if (text.includes('gestionar planilla') || text.includes('activos')) {
              (el as HTMLElement).click();
              return text;
            }
          }
          return null;
        });

        if (menuGestionar) {
          console.log(`    Click en menú: ${menuGestionar}`);
          await page.waitForTimeout(2000);
        }

        // Buscar submenu "En línea"
        const subMenuEnLinea = await page.evaluate(() => {
          const links = document.querySelectorAll('a');
          for (const link of links) {
            const text = link.innerText?.toLowerCase() || '';
            if (text.includes('en línea') || text.includes('en linea')) {
              link.click();
              return link.innerText;
            }
          }
          return null;
        });

        if (subMenuEnLinea) {
          console.log(`    Click en submenú: ${subMenuEnLinea}`);
          await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(2000);
        }
      }
    }

    console.log(`    URL final: ${page.url()}`);
    await page.screenshot({ path: './logs/screenshots/popup_02_dashboard.png', fullPage: true });

    // Ir al formulario de crear planilla navegando directamente a la URL
    console.log('\n[6] Navegando directamente a inicioPlanillaEnLinea.do...');

    // Obtener el sessionID de la URL actual
    const currentUrl = page.url();
    const sessionMatch = currentUrl.match(/nuevoSoiAchColombiaSessionID=([^&]+)/);

    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      const targetUrl = `https://servicio.nuevosoi.com.co/soi/inicioPlanillaEnLinea.do;nuevoSoiAchColombiaSessionID=${sessionId}`;
      console.log(`    Navegando a: ${targetUrl}`);

      await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForTimeout(3000);
    } else {
      // Fallback: buscar link en el menú
      console.log('    No se encontró sessionID, buscando link en la página...');

      const linkEnLinea = await page.evaluate(() => {
        const links = document.querySelectorAll('a');
        for (const link of links) {
          if (link.href?.includes('inicioPlanillaEnLinea')) {
            return link.href;
          }
        }
        return null;
      });

      if (linkEnLinea) {
        console.log(`    Encontrado link: ${linkEnLinea}`);
        await page.goto(linkEnLinea, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForTimeout(3000);
      }
    }

    console.log(`    URL después de navegación: ${page.url()}`);
    await page.screenshot({ path: './logs/screenshots/popup_03_crear_planilla.png', fullPage: true });

    // Verificar que estamos en el formulario de crear planilla
    const tipoPlanillaSelect = await page.$('select[name="tipoPlanilla"]');
    if (tipoPlanillaSelect) {
      console.log('    ✅ Formulario Paso 1 encontrado (select tipoPlanilla)');
    } else {
      console.log('    ⚠️ select[name="tipoPlanilla"] no encontrado');

      // Ver el texto de la página
      const pageText = await page.evaluate(() => document.body.innerText);
      console.log('    Texto de la página:', pageText.substring(0, 800));
    }

    // 5. Click en Siguiente para ir al Paso 2
    console.log('\n[5] Haciendo click en Siguiente (Paso 1 -> Paso 2)...');
    const btnSiguiente = await page.$('#siguiente2');
    if (!btnSiguiente) {
      throw new Error('No se encontró el botón Siguiente en Paso 1');
    }

    await btnSiguiente.click();
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    console.log(`    URL: ${page.url()}`);
    await page.screenshot({ path: './logs/screenshots/popup_03_paso2.png', fullPage: true });

    // 6. Buscar y hacer click en "Agregar cotizante"
    console.log('\n[6] Buscando botón "Agregar cotizante"...');

    // Primero listar todos los elementos clickeables
    const clickables = await page.$$eval('a, button, input[type="button"]', els =>
      els.map(el => ({
        tag: el.tagName,
        text: el.innerText?.trim().substring(0, 50) || '',
        href: (el as HTMLAnchorElement).href || '',
        onclick: el.getAttribute('onclick')?.substring(0, 100) || '',
        id: el.id,
      })).filter(e => e.text || e.onclick || e.href)
    );

    console.log('\n    Elementos clickeables encontrados:');
    for (const el of clickables) {
      console.log(`    - ${el.tag} id="${el.id}" text="${el.text}" onclick="${el.onclick}"`);
    }

    // Buscar el botón de agregar cotizante - es un INPUT con onclick="agregarCotizante()"
    console.log('\n    Buscando INPUT con onclick="agregarCotizante()"...');

    const btnAgregar = await page.$('input[onclick*="agregarCotizante"]');

    if (!btnAgregar) {
      // Fallback: buscar cualquier elemento con onclick que contenga agregarCotizante
      const btnByEval = await page.evaluateHandle(() => {
        const elements = document.querySelectorAll('[onclick]');
        for (const el of elements) {
          if (el.getAttribute('onclick')?.includes('agregarCotizante')) {
            return el;
          }
        }
        return null;
      });

      if (!btnByEval || !(await btnByEval.asElement())) {
        console.log('\n    ⚠️ No se encontró botón de agregar cotizante');
        const bodyHtml = await page.$eval('body', el => el.innerHTML);
        console.log('\n    HTML parcial del body:');
        console.log(bodyHtml.substring(0, 3000));
        throw new Error('No se encontró el botón de agregar cotizante');
      }

      console.log('    ✅ Encontrado elemento con onclick="agregarCotizante()"');
    } else {
      console.log('    ✅ Encontrado INPUT[onclick*="agregarCotizante"]');
    }

    // Screenshot del Paso 2
    await page.screenshot({ path: './logs/screenshots/popup_04_paso2_antes_click.png', fullPage: true });

    console.log('\n[7] Haciendo click en "Agregar cotizante"...');

    // Configurar listener para nueva ventana ANTES de hacer click
    let popupPage: any = null;

    const popupPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null); // No popup found
      }, 10000);

      browser.once('targetcreated', async (target) => {
        clearTimeout(timeout);
        try {
          const newPage = await target.page();
          resolve(newPage);
        } catch {
          resolve(null);
        }
      });
    });

    // Ejecutar agregarCotizante() directamente via JavaScript
    // ya que el botón puede no ser clickeable directamente
    console.log('    Ejecutando agregarCotizante() via JavaScript...');
    await page.evaluate(() => {
      // Intentar llamar la función global
      if (typeof (window as any).agregarCotizante === 'function') {
        (window as any).agregarCotizante();
        return 'function called';
      }
      // Fallback: click en el elemento
      const btn = document.querySelector('[onclick*="agregarCotizante"]');
      if (btn) {
        (btn as HTMLElement).click();
        return 'element clicked';
      }
      return 'nothing found';
    });

    // Esperar un momento para que se abra el popup
    await page.waitForTimeout(3000);
    await page.screenshot({ path: './logs/screenshots/popup_05_despues_click.png', fullPage: true });

    // Verificar si se abrió una nueva ventana
    console.log('    Esperando popup o modal...');
    popupPage = await popupPromise;

    // Si no hay popup, verificar si es un modal en la misma página
    if (!popupPage) {
      console.log('    No se detectó popup de nueva ventana');
      console.log('    Verificando si hay modal en la página actual...');

      // Buscar elementos de modal (jQuery UI dialog, div modal, etc.)
      const modalInfo = await page.evaluate(() => {
        // Buscar jQuery UI dialog
        const jqueryDialog = document.querySelector('.ui-dialog, .ui-dialog-content, [role="dialog"]');
        // Buscar cualquier div con display visible que parezca modal
        const anyModal = document.querySelector('.modal, .popup, [class*="modal"], [class*="popup"], [class*="dialog"]');
        // Buscar iframes que puedan contener el formulario
        const iframes = document.querySelectorAll('iframe');

        return {
          hasJqueryDialog: !!jqueryDialog,
          jqueryDialogHtml: jqueryDialog?.outerHTML?.substring(0, 500) || null,
          hasAnyModal: !!anyModal,
          anyModalHtml: anyModal?.outerHTML?.substring(0, 500) || null,
          iframeCount: iframes.length,
          iframeSrcs: Array.from(iframes).map(i => i.src),
        };
      });

      console.log('    Modal info:', JSON.stringify(modalInfo, null, 2));

      // Verificar si hay nuevas páginas/targets
      const pages = await browser.pages();
      console.log(`    Páginas abiertas: ${pages.length}`);

      if (pages.length > 1) {
        // Hay más de una página, usar la última
        popupPage = pages[pages.length - 1];
        console.log('    ✅ Encontrada página adicional');
      }
    }

    // Si aún no hay popup, buscar en los targets del browser
    if (!popupPage) {
      const targets = browser.targets();
      console.log(`    Targets del browser: ${targets.length}`);
      for (const target of targets) {
        console.log(`    - Type: ${target.type()}, URL: ${target.url()?.substring(0, 80)}`);
      }
    }

    if (!popupPage) {
      console.log('\n    ⚠️ No se encontró popup/modal');
      console.log('    Continuando para analizar la página actual...');

      // Listar todos los forms de la página por si el modal está inline
      const forms = await page.$$eval('form', els =>
        els.map(f => ({
          id: f.id,
          name: f.name,
          action: f.action?.substring(0, 50) || '',
          inputCount: f.querySelectorAll('input').length,
          selectCount: f.querySelectorAll('select').length,
        }))
      );
      console.log('    Forms en la página:', JSON.stringify(forms, null, 2));

      // Screenshot final
      await page.screenshot({ path: './logs/screenshots/popup_06_sin_popup.png', fullPage: true });

      // Buscar si hay un iframe con el formulario de cotizante
      const iframeHandle = await page.$('iframe');
      if (iframeHandle) {
        const frame = await iframeHandle.contentFrame();
        if (frame) {
          console.log('    Encontrado iframe, analizando contenido...');
          const iframeSelects = await frame.$$eval('select', els =>
            els.map(s => ({ name: s.name, id: s.id }))
          );
          console.log('    Selects en iframe:', iframeSelects);
        }
      }

      console.log('\n    Script terminado - no se pudo abrir el popup de cotizante');
      console.log('    Es posible que SOI no permita agregar cotizantes en este momento');
      console.log('    o que la función requiera condiciones específicas');

      await browserManager.close();
      await prisma.$disconnect();
      return;
    }

    // Esperar que cargue
    await popupPage.waitForTimeout(3000);

    console.log(`\n[8] Popup abierto. URL: ${popupPage.url()}`);
    await popupPage.screenshot({ path: './logs/screenshots/popup_04_cotizante_form.png', fullPage: true });

    // 9. Extraer HTML del formulario
    console.log('\n[9] Extrayendo HTML del formulario del popup...');
    console.log('\n' + '='.repeat(70));
    console.log('HTML DEL FORMULARIO DEL POPUP (AGREGAR COTIZANTE)');
    console.log('='.repeat(70));

    const formHtml = await popupPage.$eval('form', el => el.outerHTML).catch(() => null);

    if (formHtml) {
      console.log('\n--- FORM HTML ---');
      console.log(formHtml.substring(0, 10000));
    } else {
      console.log('\n    Form no encontrado, mostrando body...');
      const bodyHtml = await popupPage.$eval('body', el => el.innerHTML);
      console.log(bodyHtml.substring(0, 10000));
    }

    // 10. Listar todos los SELECT del popup
    console.log('\n' + '='.repeat(70));
    console.log('TODOS LOS SELECT DEL POPUP');
    console.log('='.repeat(70));

    const allSelects = await popupPage.$$eval('select', els =>
      els.map(el => ({
        name: el.name,
        id: el.id,
        optionsCount: el.options.length,
        firstOptions: Array.from(el.options).slice(0, 5).map(o => ({ value: o.value, text: o.text })),
      }))
    );

    for (const sel of allSelects) {
      console.log(`\nSELECT name="${sel.name}" id="${sel.id}" (${sel.optionsCount} opciones):`);
      console.log(`  Primeras opciones: ${JSON.stringify(sel.firstOptions)}`);
    }

    // 11. Listar todos los INPUT del popup
    console.log('\n' + '='.repeat(70));
    console.log('TODOS LOS INPUT DEL POPUP');
    console.log('='.repeat(70));

    const allInputs = await popupPage.$$eval('input', els =>
      els.map(el => ({
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
      })).filter(i => i.type !== 'hidden')
    );

    for (const inp of allInputs) {
      console.log(`INPUT type="${inp.type}" name="${inp.name}" id="${inp.id}" placeholder="${inp.placeholder}"`);
    }

    // 12. Verificar selectores específicos que necesitamos
    console.log('\n' + '='.repeat(70));
    console.log('VERIFICANDO SELECTORES ESPECÍFICOS');
    console.log('='.repeat(70));

    const selectoresAVerificar = [
      { nombre: 'Número Identificación (cédula)', selector: 'input[name="numeroIdentificacionCotizante"]' },
      { nombre: 'Tipo Cotizante', selector: 'select[name="tipoCotizante"]' },
      { nombre: 'SubTipo Cotizante', selector: 'select[name="subTipoCotizante"]' },
      { nombre: 'Departamento', selector: 'select[name="departamento"]' },
      { nombre: 'Municipio', selector: 'select[name="municipio"]' },
      { nombre: 'Salario Básico (IBC)', selector: 'input#sarioBasico' },
      { nombre: 'Admin Pensión (AFP)', selector: 'select#administradoraPension' },
      { nombre: 'Admin Salud (EPS)', selector: 'select#administradoraSalud' },
      { nombre: 'Días Cotizados Pensión', selector: 'input#numeroDiasCotizadosPension' },
      { nombre: 'Días Cotizados Salud', selector: 'input#numeroDiasCotizadosSalud' },
      { nombre: 'Btn Siguiente', selector: 'input#siguiente2' },
    ];

    for (const { nombre, selector } of selectoresAVerificar) {
      const existe = await popupPage.$(selector);
      console.log(`\n${nombre} [${selector}]: ${existe ? '✅ ENCONTRADO' : '❌ NO ENCONTRADO'}`);

      if (existe) {
        const info = await popupPage.$eval(selector, el => ({
          tag: el.tagName,
          value: (el as HTMLInputElement).value || '',
          outerHTML: el.outerHTML.substring(0, 200),
        })).catch(() => ({ tag: 'error', value: '', outerHTML: '' }));

        console.log(`  HTML: ${info.outerHTML}`);
      }
    }

    // 13. Cerrar popup sin hacer nada
    console.log('\n\n[10] Cerrando popup sin modificar nada...');
    await popupPage.close();

    console.log('\n' + '='.repeat(70));
    console.log('VERIFICACIÓN COMPLETADA');
    console.log('='.repeat(70));
    console.log('\nScreenshots guardados en: ./logs/screenshots/popup_*.png');

    // Esperar para inspección
    console.log('\nEsperando 10 segundos para inspección...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    await page.screenshot({ path: './logs/screenshots/popup_error.png', fullPage: true }).catch(() => {});
  } finally {
    await browserManager.close();
    await prisma.$disconnect();
    console.log('\nFinalizado.');
  }
}

main().catch(console.error);
