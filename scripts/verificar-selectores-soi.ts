/**
 * Script para verificar selectores del formulario SOI Paso 1 de 4
 *
 * Hace login y navega a inicioPlanillaEnLinea.do para ver el HTML real
 *
 * USO: npx tsx scripts/verificar-selectores-soi.ts
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
  console.log('VERIFICAR SELECTORES SOI - Paso 1 de 4');
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
  console.log(`    Usuario encontrado: ${user.nombre}`);
  console.log(`    Password length: ${password.length}`);

  // 2. Lanzar browser (headless: false para ver)
  console.log('\n[2] Lanzando browser...');
  const browserManager = new BrowserManager({ headless: false });
  await browserManager.launch();
  const page = await browserManager.newPage();

  try {
    // 3. Ir a login de independientes
    console.log('\n[3] Navegando a login SOI Independientes...');
    await page.goto(SOI_SELECTORS.URLS.LOGIN_INDEPENDIENTES, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

    // Screenshot inicial para ver el formulario
    await page.screenshot({ path: './logs/screenshots/soi_login_inicial.png', fullPage: true });
    console.log('    Screenshot inicial guardado');

    // 4. Primero analizar el HTML del formulario de login
    console.log('\n[4] Analizando HTML del formulario de login...');

    // Ver todos los inputs
    const inputs = await page.$$eval('input', els =>
      els.map(el => ({
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        className: el.className.substring(0, 50),
      }))
    );
    console.log('\n    Inputs encontrados:');
    for (const inp of inputs) {
      console.log(`    - type="${inp.type}" name="${inp.name}" id="${inp.id}" placeholder="${inp.placeholder}"`);
    }

    // Ver todos los selects y divs que parecen dropdowns
    const selects = await page.$$eval('select', els =>
      els.map(el => ({
        name: el.name,
        id: el.id,
        className: el.className.substring(0, 50),
      }))
    );
    console.log('\n    Selects encontrados:');
    for (const sel of selects) {
      console.log(`    - name="${sel.name}" id="${sel.id}" class="${sel.className}"`);
    }

    // Ver botones
    const buttons = await page.$$eval('button', els =>
      els.map(el => ({
        type: el.type,
        id: el.id,
        text: el.innerText?.substring(0, 30),
        className: el.className.substring(0, 50),
      }))
    );
    console.log('\n    Buttons encontrados:');
    for (const btn of buttons) {
      console.log(`    - type="${btn.type}" id="${btn.id}" text="${btn.text}" class="${btn.className}"`);
    }

    // 5. Intentar llenar el formulario con la nueva UI
    console.log('\n[5] Llenando credenciales (UI moderna)...');

    // El tipo de documento parece ser un componente de Material UI
    // Buscar el dropdown de tipo de documento y hacer click
    const tipoDocDropdown = await page.$('[class*="select"], [class*="dropdown"], [role="button"], [class*="MuiSelect"]');
    if (tipoDocDropdown) {
      console.log('    Encontrado dropdown de tipo documento');
      await tipoDocDropdown.click();
      await page.waitForTimeout(1000);

      // Buscar opción de Cédula de ciudadanía
      const cedulaOption = await page.evaluate(() => {
        const options = document.querySelectorAll('[role="option"], li, [class*="option"]');
        for (const opt of options) {
          const text = (opt as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('cédula') || text.includes('cedula') || text.includes('ciudadanía')) {
            (opt as HTMLElement).click();
            return (opt as HTMLElement).innerText;
          }
        }
        return null;
      });
      console.log(`    Seleccionado: ${cedulaOption}`);
      await page.waitForTimeout(500);
    }

    // Número de documento - buscar el input correcto
    const docInputNew = await page.$('input[type="text"], input[type="number"], input[placeholder*="documento"], input[placeholder*="número"]');
    if (docInputNew) {
      await docInputNew.click({ clickCount: 3 });
      await docInputNew.type(CEDULA, { delay: 50 });
      console.log('    Número de documento ingresado');
    }
    await page.waitForTimeout(500);

    // Password - buscar input de tipo password
    const pwdInputNew = await page.$('input[type="password"]');
    if (pwdInputNew) {
      await pwdInputNew.click();
      await pwdInputNew.type(password, { delay: 50 });
      console.log('    Clave ingresada');
    }
    await page.waitForTimeout(500);

    await page.screenshot({ path: './logs/screenshots/soi_login_filled.png', fullPage: true });
    console.log('    Screenshot con datos llenados');

    // Click en botón Ingresar
    console.log('\n[6] Haciendo click en Ingresar...');
    const loginBtn = await page.$('button[type="submit"], button:not([type]), button');
    if (loginBtn) {
      const btnText = await page.evaluate(el => el.innerText, loginBtn);
      console.log(`    Botón encontrado: "${btnText}"`);
      await loginBtn.click();
    }

    // Esperar navegación o cambio
    await page.waitForTimeout(5000);
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});

    const urlPostLogin = page.url();
    console.log(`    URL actual: ${urlPostLogin}`);

    await page.screenshot({ path: './logs/screenshots/soi_post_login.png', fullPage: true });

    // Verificar si hay error visible
    const errorVisible = await page.evaluate(() => {
      const errorEl = document.querySelector('[class*="error"], [class*="alert"], [class*="Error"]');
      return errorEl ? (errorEl as HTMLElement).innerText : null;
    });

    if (errorVisible) {
      console.log(`    ERROR VISIBLE: ${errorVisible}`);
    }

    // Verificar si estamos logueados
    const pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes('Bienvenido') || pageText.includes('Gestionar') || pageText.includes('Planilla')) {
      console.log('    ¡LOGIN EXITOSO!');
    } else {
      console.log('    Login posiblemente falló. Contenido:');
      console.log(pageText.substring(0, 800));
    }

    // 7. Probar usando el select que está en la página
    console.log('\n[7] Buscando select de tipo de planilla en la página...');

    // Hay un select con id="select_id" y opciones "SELECCIONE" y "EN LINEA"
    const selectExists = await page.$('#select_id');
    if (selectExists) {
      console.log('    Encontrado select#select_id, seleccionando "EN LINEA"...');
      await page.select('#select_id', 'linea');
      await page.waitForTimeout(3000);
      await page.screenshot({ path: './logs/screenshots/soi_select_en_linea.png', fullPage: true });
      console.log(`    URL actual: ${page.url()}`);
    }

    // 8. Si no funcionó, intentar navegar directamente a la URL
    if (!page.url().includes('inicioPlanillaEnLinea')) {
      console.log('\n[8] Intentando navegar directamente a inicioPlanillaEnLinea.do...');
      await page.goto('https://servicio.nuevosoi.com.co/soi/inicioPlanillaEnLinea.do', {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
      console.log(`    URL actual: ${page.url()}`);
      await page.screenshot({ path: './logs/screenshots/soi_directo_en_linea.png', fullPage: true });
    }

    // 9. Si aún no estamos ahí, intentar con el botón "+ planillas para pago"
    if (!page.url().includes('inicioPlanillaEnLinea') && !page.url().includes('planillaEnLinea')) {
      console.log('\n[9] Buscando botón "+ planillas para pago"...');
      const plusBtn = await page.$('#\\+PlanillasPagadas, button:contains("planillas para pago")');
      if (plusBtn) {
        await plusBtn.click();
        await page.waitForTimeout(3000);
        console.log(`    URL actual: ${page.url()}`);
      }
    }

    await page.screenshot({ path: './logs/screenshots/soi_navegacion_final.png', fullPage: true });

    // 10. Ahora estamos en el formulario - extraer HTML
    console.log('\n[10] Extrayendo HTML del formulario Paso 1 de 4...');
    console.log('\n' + '='.repeat(70));
    console.log('HTML DEL FORMULARIO');
    console.log('='.repeat(70));

    // Ver todos los selects
    const allSelects = await page.$$eval('select', els =>
      els.map(el => ({
        name: el.name,
        id: el.id,
        options: Array.from(el.options).map(o => ({ value: o.value, text: o.text })).slice(0, 10),
        outerHTML: el.outerHTML.substring(0, 300),
      }))
    );

    console.log('\n--- TODOS LOS SELECT ---');
    for (const sel of allSelects) {
      console.log(`\nSELECT name="${sel.name}" id="${sel.id}":`);
      console.log(`  Options: ${JSON.stringify(sel.options)}`);
    }

    // Ver todos los inputs
    const allInputs = await page.$$eval('input', els =>
      els.map(el => ({
        type: el.type,
        name: el.name,
        id: el.id,
        value: el.value,
      })).filter(i => i.type !== 'hidden')
    );

    console.log('\n--- TODOS LOS INPUT (no hidden) ---');
    for (const inp of allInputs) {
      console.log(`INPUT type="${inp.type}" name="${inp.name}" id="${inp.id}" value="${inp.value}"`);
    }

    // Ver todos los botones
    const allButtons = await page.$$eval('button, input[type="submit"], input[type="button"]', els =>
      els.map(el => ({
        tag: el.tagName,
        type: (el as HTMLInputElement).type,
        id: el.id,
        value: (el as HTMLInputElement).value,
        text: el.innerText?.substring(0, 30),
      }))
    );

    console.log('\n--- TODOS LOS BOTONES ---');
    for (const btn of allButtons) {
      console.log(`${btn.tag} type="${btn.type}" id="${btn.id}" value="${btn.value}" text="${btn.text}"`);
    }

    // Verificar selectores específicos que usamos en planilla.bot.ts
    console.log('\n' + '='.repeat(70));
    console.log('VERIFICANDO SELECTORES DE planilla.bot.ts');
    console.log('='.repeat(70));

    const selectoresAVerificar = [
      { nombre: 'Tipo Planilla', selector: 'select[name="tipoPlanilla"]' },
      { nombre: 'Periodo Mes', selector: '#periodoLiquidacionMes' },
      { nombre: 'Periodo Año', selector: '#periodoLiquidacionAnnio' },
      { nombre: 'Tipo Aportante', selector: 'select[name="tipoAportante"]' },
      { nombre: 'Btn Siguiente', selector: '#siguiente2' },
      { nombre: 'Btn Agregar Cotizante', selector: 'a[onclick*="agregarCotizante"]' },
    ];

    for (const { nombre, selector } of selectoresAVerificar) {
      const existe = await page.$(selector);
      console.log(`\n${nombre} [${selector}]: ${existe ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
      if (existe) {
        const html = await page.$eval(selector, el => el.outerHTML.substring(0, 200)).catch(() => 'error');
        console.log(`  HTML: ${html}`);
      }
    }

    // Esperar para inspección manual
    console.log('\n\nEsperando 30 segundos para inspección manual...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\nERROR:', error);
    await page.screenshot({ path: './logs/screenshots/verificar_error.png', fullPage: true });
  } finally {
    await browserManager.close();
    await prisma.$disconnect();
    console.log('\nFinalizado.');
  }
}

main().catch(console.error);
