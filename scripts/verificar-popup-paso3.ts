/**
 * Script para verificar selectores del popup de cotizante - Paso 3 (Seguridad Social)
 *
 * 1. Login
 * 2. Navegar a crear planilla Paso 2
 * 3. Abrir popup "Agregar cotizante"
 * 4. Sub-paso 1: llenar cédula, esperar autocomplete, tipoCotizante, depto, municipio
 * 5. Sub-paso 2: click Siguiente (novedades)
 * 6. Sub-paso 3: imprimir HTML del formulario de Seguridad Social
 *
 * USO: npx tsx scripts/verificar-popup-paso3.ts
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
  console.log('VERIFICAR SELECTORES POPUP COTIZANTE - PASO 3 (Seguridad Social)');
  console.log('='.repeat(70));

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

    // Seleccionar tipo documento
    await page.select('select', '1'); // Cédula de ciudadanía
    await page.waitForTimeout(300);

    // Número documento
    const docInput = await page.$('input[type="text"]');
    if (docInput) {
      await docInput.click({ clickCount: 3 });
      await docInput.type(CEDULA, { delay: 30 });
    }
    await page.waitForTimeout(300);

    // Password
    const pwdInput = await page.$('input[type="password"]');
    if (pwdInput) {
      await pwdInput.click();
      await pwdInput.type(password, { delay: 30 });
    }
    await page.waitForTimeout(300);

    // Click Ingresar
    const btnIngresar = await page.$('button');
    if (btnIngresar) await btnIngresar.click();

    await page.waitForTimeout(3000);
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    console.log(`    Login completado. URL: ${page.url()}`);

    // 4. Navegar a crear planilla
    console.log('\n[4] Navegando a inicioPlanillaEnLinea.do...');
    const sessionMatch = page.url().match(/nuevoSoiAchColombiaSessionID=([^&]+)/);
    if (sessionMatch) {
      const targetUrl = `https://servicio.nuevosoi.com.co/soi/inicioPlanillaEnLinea.do;nuevoSoiAchColombiaSessionID=${sessionMatch[1]}`;
      await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    console.log(`    URL: ${page.url()}`);

    // 5. Click Siguiente para ir al Paso 2
    console.log('\n[5] Paso 1 -> Paso 2...');
    const btnSiguiente = await page.$('#siguiente2');
    if (!btnSiguiente) throw new Error('No se encontró botón Siguiente en Paso 1');

    await btnSiguiente.click();
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    console.log(`    URL: ${page.url()}`);
    await page.screenshot({ path: './logs/screenshots/p3_01_paso2.png', fullPage: true });

    // 6. Abrir popup "Agregar cotizante"
    console.log('\n[6] Abriendo popup "Agregar cotizante"...');

    // Configurar listener para nueva ventana
    const popupPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 15000);
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

    // Ejecutar agregarCotizante()
    await page.evaluate(() => {
      const btn = document.querySelector('[onclick*="agregarCotizante"]');
      if (btn) (btn as HTMLElement).click();
    });

    await page.waitForTimeout(3000);

    // Obtener popup
    let popup = await popupPromise;
    if (!popup) {
      const pages = await browser.pages();
      if (pages.length > 1) popup = pages[pages.length - 1];
    }

    if (!popup) throw new Error('No se pudo abrir el popup de cotizante');

    await popup.waitForTimeout(2000);
    console.log(`    Popup abierto: ${popup.url()}`);
    await popup.screenshot({ path: './logs/screenshots/p3_02_popup_paso1.png', fullPage: true });

    // ========================================
    // SUB-PASO 1/5: Información Básica
    // ========================================
    console.log('\n[7] SUB-PASO 1/5: Llenando información básica...');

    // Tipo identificación ya viene en CC por defecto
    // Llenar cédula y esperar autocomplete BDUA
    const inputCedula = await popup.$('input[name="numeroIdentificacionCotizante"]');
    if (inputCedula) {
      await inputCedula.click({ clickCount: 3 });
      await inputCedula.type(CEDULA, { delay: 50 });
      console.log(`    Cédula ingresada: ${CEDULA}`);

      // Trigger blur para activar BDUA
      await popup.evaluate(() => {
        const input = document.querySelector('input[name="numeroIdentificacionCotizante"]') as HTMLInputElement;
        if (input) {
          input.blur();
          // Llamar cargarBDUA si existe
          if (typeof (window as any).cargarBDUA === 'function') {
            (window as any).cargarBDUA(input.form);
          }
        }
      });

      console.log('    Esperando autocomplete BDUA (5 segundos)...');
      await popup.waitForTimeout(5000);
    }

    await popup.screenshot({ path: './logs/screenshots/p3_03_post_cedula.png', fullPage: true });

    // Verificar si se llenaron los nombres automáticamente
    const nombresLlenados = await popup.evaluate(() => {
      const primerNombre = document.querySelector('input[name="primerNombreCotizante"]') as HTMLInputElement;
      const primerApellido = document.querySelector('input[name="primerApellidoCotizante"]') as HTMLInputElement;
      return {
        primerNombre: primerNombre?.value || '',
        primerApellido: primerApellido?.value || '',
      };
    });
    console.log(`    Nombres autocompletados: ${nombresLlenados.primerNombre} ${nombresLlenados.primerApellido}`);

    // Seleccionar tipo cotizante: "3,3" (INDEPENDIENTE)
    console.log('    Seleccionando tipo cotizante "3,3" (INDEPENDIENTE)...');
    await popup.select('select[name="tipoCotizante"]', '3,3');
    await popup.waitForTimeout(1000);

    // Seleccionar departamento: BOLIVAR
    console.log('    Seleccionando departamento BOLIVAR...');
    // Buscar el value correcto para BOLIVAR
    const deptoOptions = await popup.$$eval('select[name="departamento"] option', opts =>
      opts.map(o => ({ value: o.value, text: o.text }))
    );
    console.log('    Opciones de departamento:', deptoOptions.slice(0, 10));

    const bolivarOption = deptoOptions.find(o => o.text.toUpperCase().includes('BOLIVAR'));
    if (bolivarOption) {
      await popup.select('select[name="departamento"]', bolivarOption.value);
      console.log(`    Departamento seleccionado: ${bolivarOption.text} (${bolivarOption.value})`);
      await popup.waitForTimeout(2000); // Esperar que cargue municipios
    }

    // Seleccionar municipio: CARTAGENA
    console.log('    Seleccionando municipio CARTAGENA...');
    const munOptions = await popup.$$eval('select[name="municipio"] option', opts =>
      opts.map(o => ({ value: o.value, text: o.text }))
    );
    console.log('    Opciones de municipio:', munOptions.slice(0, 10));

    const cartagenaOption = munOptions.find(o => o.text.toUpperCase().includes('CARTAGENA'));
    if (cartagenaOption) {
      await popup.select('select[name="municipio"]', cartagenaOption.value);
      console.log(`    Municipio seleccionado: ${cartagenaOption.text} (${cartagenaOption.value})`);
      await popup.waitForTimeout(500);
    }

    await popup.screenshot({ path: './logs/screenshots/p3_04_paso1_lleno.png', fullPage: true });

    // Click Siguiente (paso 1 -> paso 2)
    console.log('    Click Siguiente (paso 1 -> paso 2)...');
    const btnSig1 = await popup.$('input#siguiente1');
    if (btnSig1) {
      await btnSig1.click();
    } else {
      // Fallback: ejecutar via JavaScript
      await popup.evaluate(() => {
        const btn = document.querySelector('input#siguiente1') as HTMLInputElement;
        if (btn) btn.click();
      });
    }

    await popup.waitForTimeout(3000);
    await popup.screenshot({ path: './logs/screenshots/p3_05_paso2_novedades.png', fullPage: true });

    // ========================================
    // SUB-PASO 2/5: Novedades
    // ========================================
    console.log('\n[8] SUB-PASO 2/5: Novedades - Click Siguiente directo...');

    // Verificar en qué paso estamos
    const paso2Text = await popup.evaluate(() => document.body.innerText);
    if (paso2Text.includes('Paso 2 de 5') || paso2Text.includes('Novedades')) {
      console.log('    Estamos en Paso 2 (Novedades)');
    }

    // Click Siguiente (paso 2 -> paso 3)
    const btnSig2 = await popup.$('input#siguiente2');
    if (btnSig2) {
      await btnSig2.click();
    } else {
      await popup.evaluate(() => {
        const btn = document.querySelector('input#siguiente2, input[value="Siguiente"]') as HTMLInputElement;
        if (btn) btn.click();
      });
    }

    await popup.waitForTimeout(3000);
    await popup.screenshot({ path: './logs/screenshots/p3_06_paso3_seguridad_social.png', fullPage: true });

    // ========================================
    // SUB-PASO 3/5: Seguridad Social
    // ========================================
    console.log('\n[9] SUB-PASO 3/5: Seguridad Social - Extrayendo HTML...');

    // Verificar en qué paso estamos
    const paso3Text = await popup.evaluate(() => document.body.innerText);
    if (paso3Text.includes('Paso 3 de 5') || paso3Text.includes('Seguridad Social')) {
      console.log('    ✅ Estamos en Paso 3 (Seguridad Social)');
    } else {
      console.log('    ⚠️ Texto de la página:', paso3Text.substring(0, 500));
    }

    // Imprimir HTML del formulario
    console.log('\n' + '='.repeat(70));
    console.log('HTML DEL FORMULARIO - PASO 3 (SEGURIDAD SOCIAL)');
    console.log('='.repeat(70));

    const formHtml = await popup.$eval('form', el => el.outerHTML).catch(() => null);
    if (formHtml) {
      console.log('\n--- FORM HTML (primeros 15000 chars) ---');
      console.log(formHtml.substring(0, 15000));
    } else {
      console.log('\n--- No se encontró form, mostrando body ---');
      const bodyHtml = await popup.$eval('body', el => el.innerHTML);
      console.log(bodyHtml.substring(0, 10000));
    }

    // Listar todos los SELECT
    console.log('\n' + '='.repeat(70));
    console.log('TODOS LOS SELECT DEL PASO 3');
    console.log('='.repeat(70));

    const allSelects = await popup.$$eval('select', els =>
      els.map(el => ({
        name: el.name,
        id: el.id,
        optionsCount: el.options.length,
        firstOptions: Array.from(el.options).slice(0, 8).map(o => ({ value: o.value, text: o.text })),
      }))
    );

    for (const sel of allSelects) {
      console.log(`\nSELECT name="${sel.name}" id="${sel.id}" (${sel.optionsCount} opciones):`);
      console.log(`  Opciones: ${JSON.stringify(sel.firstOptions)}`);
    }

    // Listar todos los INPUT
    console.log('\n' + '='.repeat(70));
    console.log('TODOS LOS INPUT DEL PASO 3');
    console.log('='.repeat(70));

    const allInputs = await popup.$$eval('input', els =>
      els.map(el => ({
        type: el.type,
        name: el.name,
        id: el.id,
        value: el.value,
        placeholder: el.placeholder,
      })).filter(i => i.type !== 'hidden')
    );

    for (const inp of allInputs) {
      console.log(`INPUT type="${inp.type}" name="${inp.name}" id="${inp.id}" value="${inp.value}"`);
    }

    // Verificar selectores específicos esperados
    console.log('\n' + '='.repeat(70));
    console.log('VERIFICANDO SELECTORES ESPECÍFICOS DE SEGURIDAD SOCIAL');
    console.log('='.repeat(70));

    const selectoresAVerificar = [
      { nombre: 'Admin Pensión (AFP)', selector: 'select[name*="pension"], select[name*="Pension"], select#administradoraPension' },
      { nombre: 'Admin Salud (EPS)', selector: 'select[name*="salud"], select[name*="Salud"], select#administradoraSalud' },
      { nombre: 'Admin Riesgos (ARL)', selector: 'select[name*="riesgo"], select[name*="Riesgo"], select#administradoraRiesgos' },
      { nombre: 'Caja Compensación', selector: 'select[name*="caja"], select[name*="Caja"], select#cajaCompensacion' },
      { nombre: 'IBC / Salario', selector: 'input[name*="ibc"], input[name*="salario"], input[name*="IBC"], input#sarioBasico, input#salarioBasico' },
      { nombre: 'Días Cotizados', selector: 'input[name*="dias"], input[name*="Dias"], input#numeroDiasCotizados' },
    ];

    for (const { nombre, selector } of selectoresAVerificar) {
      const selectors = selector.split(', ');
      let found = false;
      for (const sel of selectors) {
        const elemento = await popup.$(sel.trim());
        if (elemento) {
          const html = await popup.$eval(sel.trim(), el => el.outerHTML.substring(0, 300)).catch(() => 'error');
          console.log(`\n✅ ${nombre} [${sel.trim()}]:`);
          console.log(`   HTML: ${html}`);
          found = true;
          break;
        }
      }
      if (!found) {
        console.log(`\n❌ ${nombre} - No encontrado con selectores: ${selector}`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('VERIFICACIÓN COMPLETADA');
    console.log('='.repeat(70));

    // Cerrar popup
    console.log('\n[10] Cerrando popup...');
    await popup.close();

    console.log('\nScreenshots guardados en: ./logs/screenshots/p3_*.png');

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    await page.screenshot({ path: './logs/screenshots/p3_error.png', fullPage: true }).catch(() => {});
  } finally {
    await browserManager.close();
    await prisma.$disconnect();
    console.log('\nFinalizado.');
  }
}

main().catch(console.error);
