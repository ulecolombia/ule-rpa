/**
 * Script para explorar la página de Generar Planilla en Mi Planilla
 *
 * Objetivo: Entender cómo agregar cotizantes a la planilla
 */

import { PrismaClient } from '@prisma/client';
import { browserManager } from '../src/bots/utils/browser';
import { decryptPassword } from '../src/utils/crypto';
import { MIPLANILLA_URLS } from '../src/types/miplanilla.types';

const prisma = new PrismaClient();

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Explorando página Generar Planilla ===\n');

  // Obtener usuario de prueba
  const user = await prisma.enlaceUser.findFirst({
    where: {
      miplanillaPassword: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!user || !user.miplanillaPassword || !user.miplanillaPasswordIV) {
    console.error('No se encontró usuario con credenciales Mi Planilla');
    return;
  }

  console.log(`Usuario: ${user.numeroDocumento} - ${user.nombre}`);

  const password = await decryptPassword(user.miplanillaPassword, user.miplanillaPasswordIV);
  const browser = await browserManager.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    // === LOGIN ===
    console.log('\n[1] Haciendo login...');
    await page.goto(MIPLANILLA_URLS.portalIndependientes, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await sleep(2000);

    // Llenar credenciales
    const usuario = `CC${user.numeroDocumento}`;
    await page.evaluate((usr, pwd) => {
      const userInput = document.querySelector('#usuario') as HTMLInputElement;
      const passInput = document.querySelector('#clave') as HTMLInputElement;
      if (userInput) {
        userInput.value = usr;
        userInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (passInput) {
        passInput.value = pwd;
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, usuario, password);
    await sleep(500);

    // Click login
    await page.evaluate(() => {
      const btn = document.querySelector('button.btn-primary, button.button-cta');
      if (btn) (btn as HTMLElement).click();
    });
    await sleep(4000);

    console.log('Login completado, URL:', page.url());
    await browserManager.takeScreenshot(page, 'explore-01-login-success');

    // === NAVEGAR A GENERAR PLANILLA ===
    console.log('\n[2] Navegando a Generar Planilla...');
    await page.goto(MIPLANILLA_URLS.generarPlanilla, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await sleep(3000);

    await browserManager.takeScreenshot(page, 'explore-02-generar-planilla-inicial');

    // Cerrar modal ARL si existe
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a');
      for (const btn of Array.from(buttons)) {
        const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('no, continuar') || text.includes('continuar sin actualizar')) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    await sleep(2000);

    // === ANALIZAR ESTRUCTURA DE LA PÁGINA ===
    console.log('\n[3] Analizando estructura de la página...\n');

    const pageAnalysis = await page.evaluate(() => {
      const analysis: any = {
        url: window.location.href,
        tiposPlanilla: [],
        botones: [],
        formularios: [],
        cardsClickeables: [],
        mensajes: [],
      };

      // Buscar tipos de planilla (cards/opciones)
      const allElements = document.querySelectorAll('*');
      const seenTexts = new Set<string>();

      for (const el of Array.from(allElements)) {
        const text = (el as HTMLElement).innerText?.trim() || '';
        const tagName = el.tagName.toLowerCase();
        const classes = (el as HTMLElement).className || '';

        // Tipos de planilla
        if (text.length > 0 && text.length < 100) {
          if (text.toLowerCase().includes('propios aportes') ||
              text.toLowerCase().includes('empleado de') ||
              text.toLowerCase().includes('empleados dependientes') ||
              text.toLowerCase().includes('independientes contratistas')) {
            if (!seenTexts.has(text)) {
              seenTexts.add(text);
              analysis.tiposPlanilla.push({
                text: text.substring(0, 80),
                tag: tagName,
                classes: classes.substring(0, 50),
                clickable: el.onclick !== null || tagName === 'a' || tagName === 'button' ||
                          classes.includes('btn') || classes.includes('card') || classes.includes('click'),
              });
            }
          }
        }

        // Botones
        if (tagName === 'button' || (tagName === 'a' && classes.includes('btn'))) {
          const btnText = (el as HTMLElement).innerText?.trim();
          if (btnText && btnText.length < 50 && !seenTexts.has('btn:' + btnText)) {
            seenTexts.add('btn:' + btnText);
            analysis.botones.push({
              text: btnText,
              classes: classes.substring(0, 50),
              disabled: (el as HTMLButtonElement).disabled,
            });
          }
        }
      }

      // Buscar sección de personas
      const personasSection = document.body.innerText.match(/Personas incluidas[^(]*\((\d+)\)/i);
      if (personasSection) {
        analysis.personasIncluidas = parseInt(personasSection[1], 10);
      }

      // Buscar mensajes informativos
      const infoMessages = document.querySelectorAll('.alert, .info, [class*="message"], [class*="aviso"]');
      for (const msg of Array.from(infoMessages)) {
        const text = (msg as HTMLElement).innerText?.trim();
        if (text && text.length < 200) {
          analysis.mensajes.push(text.substring(0, 150));
        }
      }

      // Buscar inputs/formularios
      const inputs = document.querySelectorAll('input, select');
      for (const input of Array.from(inputs)) {
        const el = input as HTMLInputElement;
        if (el.type !== 'hidden') {
          analysis.formularios.push({
            tag: el.tagName.toLowerCase(),
            type: el.type,
            id: el.id,
            name: el.name,
            placeholder: el.placeholder,
          });
        }
      }

      return analysis;
    });

    console.log('URL actual:', pageAnalysis.url);
    console.log('\nTipos de planilla encontrados:');
    pageAnalysis.tiposPlanilla.forEach((tipo: any, i: number) => {
      console.log(`  ${i + 1}. [${tipo.tag}] "${tipo.text}" - clickable: ${tipo.clickable}`);
    });

    console.log('\nBotones encontrados:');
    pageAnalysis.botones.forEach((btn: any, i: number) => {
      console.log(`  ${i + 1}. "${btn.text}" - disabled: ${btn.disabled}`);
    });

    console.log('\nPersonas incluidas:', pageAnalysis.personasIncluidas ?? 'No encontrado');

    console.log('\nFormularios/Inputs:');
    pageAnalysis.formularios.forEach((f: any, i: number) => {
      console.log(`  ${i + 1}. <${f.tag}> id="${f.id}" name="${f.name}" type="${f.type}"`);
    });

    // === SELECCIONAR TIPO DE PLANILLA ===
    console.log('\n[4] Seleccionando tipo "Pagos de mis propios aportes"...');

    const clickResult = await page.evaluate(() => {
      // Buscar y hacer click en el card de "propios aportes"
      const allElements = document.querySelectorAll('div, span, label, a, button');

      for (const el of Array.from(allElements)) {
        const text = (el as HTMLElement).innerText?.toLowerCase() || '';
        // Buscar específicamente el primer tipo de planilla
        if (text.includes('propios aportes') && text.includes('beneficiarios') && text.length < 100) {
          // Hacer click en el elemento
          (el as HTMLElement).click();
          return { clicked: true, text: text.substring(0, 50), tag: el.tagName };
        }
      }

      // Intento alternativo: buscar por estructura
      const cards = document.querySelectorAll('[class*="card"], [class*="option"], [class*="tipo"]');
      for (const card of Array.from(cards)) {
        const text = (card as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('propios aportes')) {
          (card as HTMLElement).click();
          return { clicked: true, text: 'via card class', tag: card.tagName };
        }
      }

      return { clicked: false };
    });

    console.log('Resultado click:', clickResult);
    await sleep(3000);

    await browserManager.takeScreenshot(page, 'explore-03-tipo-seleccionado');

    // === ANALIZAR CAMBIOS DESPUÉS DE SELECCIONAR TIPO ===
    console.log('\n[5] Analizando página después de seleccionar tipo...');

    const afterClick = await page.evaluate(() => {
      const result: any = {
        personasIncluidas: 0,
        hayBotonAgregar: false,
        hayListaCotizantes: false,
        elementosNuevos: [],
      };

      // Verificar personas incluidas
      const personasMatch = document.body.innerText.match(/Personas incluidas[^(]*\((\d+)\)/i);
      if (personasMatch) {
        result.personasIncluidas = parseInt(personasMatch[1], 10);
      }

      // Buscar botón "Agregar" o similar
      const buttons = document.querySelectorAll('button, a');
      for (const btn of Array.from(buttons)) {
        const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('agregar') || text.includes('añadir') || text.includes('incluir')) {
          result.hayBotonAgregar = true;
          result.botonAgregarText = (btn as HTMLElement).innerText?.trim();
        }
      }

      // Buscar lista de cotizantes o checkbox
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      if (checkboxes.length > 0) {
        result.hayCheckboxes = true;
        result.numCheckboxes = checkboxes.length;
      }

      // Buscar tabla o lista de personas
      const tables = document.querySelectorAll('table');
      const lists = document.querySelectorAll('ul, ol, [class*="list"]');
      result.hayTabla = tables.length > 0;
      result.hayLista = lists.length > 0;

      // Ver si hay algún mensaje de "selecciona personas" o similar
      const bodyText = document.body.innerText.toLowerCase();
      if (bodyText.includes('selecciona') && bodyText.includes('persona')) {
        result.mensajeSeleccionaPersona = true;
      }

      // Buscar sección que apareció después del click
      const sections = document.querySelectorAll('section, div[class*="section"], div[class*="contenedor"]');
      for (const sec of Array.from(sections)) {
        const text = (sec as HTMLElement).innerText?.substring(0, 100);
        if (text && (text.includes('cotizante') || text.includes('persona') || text.includes('incluir'))) {
          result.elementosNuevos.push(text);
        }
      }

      return result;
    });

    console.log('\nPersonas incluidas después del click:', afterClick.personasIncluidas);
    console.log('¿Hay botón agregar?:', afterClick.hayBotonAgregar, afterClick.botonAgregarText || '');
    console.log('¿Hay checkboxes?:', afterClick.hayCheckboxes, 'Cantidad:', afterClick.numCheckboxes || 0);
    console.log('¿Hay tabla?:', afterClick.hayTabla);
    console.log('¿Hay lista?:', afterClick.hayLista);
    console.log('¿Mensaje selecciona persona?:', afterClick.mensajeSeleccionaPersona);

    // === EXPLORAR SECCIÓN "EMPLEADOS Y BENEFICIARIOS" DEL MENÚ ===
    console.log('\n[6] Explorando menú lateral...');

    const menuItems = await page.evaluate(() => {
      const items: string[] = [];
      const links = document.querySelectorAll('nav a, aside a, .menu a, .sidebar a, [class*="menu"] a');
      for (const link of Array.from(links)) {
        const text = (link as HTMLElement).innerText?.trim();
        if (text && text.length < 50) {
          items.push(text);
        }
      }
      return items;
    });

    console.log('Items del menú:', menuItems);

    // === SCROLL Y CAPTURA COMPLETA ===
    console.log('\n[7] Haciendo scroll para ver toda la página...');

    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(500);
    await browserManager.takeScreenshot(page, 'explore-04-scroll-medio');

    await page.evaluate(() => window.scrollTo(0, 1000));
    await sleep(500);
    await browserManager.takeScreenshot(page, 'explore-05-scroll-abajo');

    // === BUSCAR EN TODO EL HTML ===
    console.log('\n[8] Buscando patrones en el HTML...');

    const htmlPatterns = await page.evaluate(() => {
      const html = document.documentElement.outerHTML.toLowerCase();
      const patterns: any = {
        tieneInputCotizante: html.includes('cotizante'),
        tieneInputPersona: html.includes('persona'),
        tieneAgregarBtn: html.includes('agregar'),
        tieneNgClick: html.includes('ng-click'),
        tieneOnclick: html.includes('onclick'),
        tieneDataBind: html.includes('data-bind'),
        tieneVModel: html.includes('v-model'),
      };

      // Buscar funciones JavaScript relacionadas
      const scripts = document.querySelectorAll('script');
      let jsContent = '';
      for (const script of Array.from(scripts)) {
        jsContent += script.textContent || '';
      }

      patterns.tieneFnAgregar = jsContent.toLowerCase().includes('agregar');
      patterns.tieneFnIncluir = jsContent.toLowerCase().includes('incluir');
      patterns.tieneFnSeleccionar = jsContent.toLowerCase().includes('seleccionar');

      return patterns;
    });

    console.log('Patrones HTML encontrados:', htmlPatterns);

    console.log('\n=== Exploración completada ===');
    console.log('Revisa las capturas en /screenshots/explore-*.png');

    // Mantener browser abierto para inspección manual
    console.log('\n[!] Browser permanece abierto 60s para inspección manual...');
    await sleep(60000);

  } catch (error) {
    console.error('Error:', error);
    await browserManager.takeScreenshot(page, 'explore-error');
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(console.error);
