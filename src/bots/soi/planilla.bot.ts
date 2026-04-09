/**
 * SOI Planilla Bot - Crear Planilla En Línea
 *
 * Flujo completo para crear una planilla PILA en SOI para independientes.
 * Requiere una sesión autenticada (page ya logueada).
 *
 * FLUJO:
 * 1. Navegar a "En línea" desde menú lateral
 * 2. Configurar información básica (Paso 1 de 4)
 * 3. Agregar cotizante via popup (5 sub-pasos)
 * 4. Confirmar planilla y obtener número
 *
 * @author ULE Colombia
 * @version 1.0.0
 */

import { Page, Browser } from 'puppeteer';
import { logger } from '../../utils/logger';
import { SOI_SELECTORS } from './selectors';
import { navegarBancolombiaNegocios } from '../utils/bancolombia-negocios.bot';
import path from 'path';
import fs from 'fs/promises';
import { analyzeScreenshot } from '../../services/gemini-vision.service';

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export interface PlanillaInput {
  cedula: string;
  departamento: string;        // value exacto del select SOI, ej: "BOLIVAR"
  municipio: string;           // value exacto del select SOI, ej: "CARTAGENA"
  ibc: number;                 // Salario básico / IBC, ej: 2000000
  mesPago: string;             // ej: "FEBRERO"
  anioPago: string;            // ej: "2026"
  // NOTA: AFP y EPS NO se pasan porque vienen prellenados del RUAF (disabled)
  // NOTA: Caja compensación no aplica para independientes tipo 3
}

export interface PlanillaResult {
  success: boolean;
  numeroPlanilla?: string;
  totalPagar?: number;
  error?: string;
  screenshotPath?: string;
  yaExistia?: boolean;
}

export interface PlanillaExistenteResult {
  existe: boolean;
  numeroPlanilla?: string;
  totalPagar?: number;
  periodo?: string;
  btnPagarSelector?: string;
}

export interface PagoInput {
  numeroPlanilla: string;
  // PSE requiere estos datos adicionales
  tipoAportante?: 'PERSONA_NATURAL' | 'PERSONA_JURIDICA';
  banco?: string;  // Código del banco, ej: "1007" = BANCOLOMBIA
}

export interface PagoResult {
  success: boolean;
  estado?: 'FORMULARIO_PSE' | 'EN_BANCO' | 'PAGADO' | 'ERROR';
  urlActual?: string;
  formHtml?: string;
  selectoresEncontrados?: {
    tipoAportante?: string;
    entidadFinanciera?: string;
    btnPagar?: string;
  };
  error?: string;
  screenshotPath?: string;
}

// ============================================================================
// TIPOS PARA FASE 3: ESPERAR PAGO Y DESCARGAR COMPROBANTE
// ============================================================================

export interface EsperarPagoInput {
  cedula: string;
  mesPago: string;     // ej: "FEBRERO"
  anioPago: string;    // ej: "2026"
  uleUserId?: string;  // ID del usuario en ULE (para organizar archivos)
}

export interface EsperarPagoResult {
  success: boolean;
  estado: 'PAGADO' | 'TIMEOUT' | 'ERROR';
  numeroPlanilla?: string;
  comprobantePath?: string;
  error?: string;
  screenshotPath?: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const TIMEOUTS = {
  ELEMENT: 15000,
  NAVIGATION: 30000,
  POPUP: 20000,
  AUTOCOMPLETE: 8000,
};

const SCREENSHOTS_DIR = './logs/screenshots';

// Mapeo de nombres de meses a números
const MES_A_NUMERO: Record<string, string> = {
  'ENERO': '01',
  'FEBRERO': '02',
  'MARZO': '03',
  'ABRIL': '04',
  'MAYO': '05',
  'JUNIO': '06',
  'JULIO': '07',
  'AGOSTO': '08',
  'SEPTIEMBRE': '09',
  'OCTUBRE': '10',
  'NOVIEMBRE': '11',
  'DICIEMBRE': '12',
};

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Convierte mes en texto a formato YYYY-MM
 * Ej: ("FEBRERO", "2026") -> "2026-02"
 */
function formatPeriodo(mesPago: string, anioPago: string): string {
  const mesNum = MES_A_NUMERO[mesPago.toUpperCase()] || '01';
  return `${anioPago}-${mesNum}`;
}

async function ensureScreenshotsDir(): Promise<void> {
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
}

async function takeScreenshot(page: Page, stepName: string): Promise<string> {
  await ensureScreenshotsDir();
  const timestamp = Date.now();
  const filename = `planilla_${stepName}_${timestamp}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  try {
    await page.screenshot({ path: filepath, fullPage: true });
    logger.debug(`Screenshot saved: ${filepath}`);
    return filepath;
  } catch (error) {
    logger.warn(`Failed to take screenshot: ${stepName}`, { error });
    return '';
  }
}

async function checkForErrors(page: Page): Promise<string | null> {
  const errorSelectors = [
    '.alert-danger',
    '.alert.alert-danger',
    '.error',
    '.mensaje-error',
    '.invalid-feedback:not(:empty)',
  ];

  for (const selector of errorSelectors) {
    try {
      const errorEl = await page.$(selector);
      if (errorEl) {
        const errorText = await page.evaluate(el => el?.textContent?.trim() || '', errorEl);
        if (errorText && errorText.length > 0) {
          return errorText;
        }
      }
    } catch {
      // Continuar con el siguiente selector
    }
  }

  return null;
}

// ============================================================================
// CHECK PLANILLA EXISTENTE
// ============================================================================

/**
 * Verifica si ya existe una planilla GUARDADA para el periodo especificado.
 * Busca en el dashboard principal de SOI después del login.
 *
 * @param page - Página autenticada en SOI (dashboard principal)
 * @param input - Datos de la planilla a verificar
 * @returns Información de la planilla existente o { existe: false }
 */
export async function checkPlanillaExistente(
  page: Page,
  input: PlanillaInput
): Promise<PlanillaExistenteResult> {
  logger.info('[CHECK] Verificando si existe planilla GUARDADA para el periodo...');

  const periodoEsperado = formatPeriodo(input.mesPago, input.anioPago);
  logger.info(`[CHECK] Buscando periodo: ${periodoEsperado}`);

  try {
    // Verificar que estamos en el dashboard (debe tener tabla de planillas)
    const currentUrl = page.url();
    logger.debug(`[CHECK] URL actual: ${currentUrl}`);

    // Si no estamos en el dashboard, navegar a él
    if (!currentUrl.includes('loginIndependientes') && !currentUrl.includes('inicio')) {
      logger.info('[CHECK] Navegando al dashboard...');
      await page.goto('https://servicio.nuevosoi.com.co/soi/loginIndependientes.do', {
        waitUntil: 'networkidle0',
        timeout: TIMEOUTS.NAVIGATION,
      });
      await page.waitForTimeout(2000);
    }

    await takeScreenshot(page, 'check_dashboard');

    // Buscar la tabla de planillas disponibles
    // La tabla tiene columnas: checkbox, No. Planilla, Tipo planilla, Estado, Fecha estado actual, Valor, Periodo liquidación, Pagar, Abrir y...
    const planillaEncontrada = await page.evaluate((periodoEsp) => {
      // Buscar todas las filas de la tabla de planillas
      const rows = document.querySelectorAll('table tr, .tabla-planillas tr');

      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 7) continue; // Necesitamos al menos 7 columnas

        // Extraer datos de las celdas
        // Orden típico: [checkbox], No.Planilla, Tipo, Estado, FechaEstado, Valor, Periodo, [Pagar], [Abrir]
        const numeroPlanilla = cells[1]?.textContent?.trim() || '';
        const tipoPlanilla = cells[2]?.textContent?.trim() || '';
        const estado = cells[3]?.textContent?.trim() || '';
        const valor = cells[5]?.textContent?.trim() || '';
        const periodo = cells[6]?.textContent?.trim() || '';

        // Verificar si es la planilla que buscamos
        // Tipo "I" = Independiente, Estado "GUARDADA", Periodo coincide
        if (
          tipoPlanilla === 'I' &&
          estado === 'GUARDADA' &&
          periodo === periodoEsp
        ) {
          // Buscar el botón de pagar en esta fila
          const btnPagar = row.querySelector('a[href*="pagar"], button[onclick*="pagar"], img[src*="pagar"], a img');
          const btnPagarInfo = btnPagar
            ? {
                tag: btnPagar.tagName,
                href: (btnPagar as HTMLAnchorElement).href || '',
                onclick: btnPagar.getAttribute('onclick') || '',
              }
            : null;

          // Limpiar el valor (quitar $ y puntos)
          const valorLimpio = valor.replace(/[$.\s]/g, '').replace(',', '');
          const totalPagar = parseInt(valorLimpio, 10) || 0;

          return {
            existe: true,
            numeroPlanilla,
            totalPagar,
            periodo,
            btnPagarInfo,
            rowIndex: Array.from(rows).indexOf(row),
          };
        }
      }

      return { existe: false };
    }, periodoEsperado);

    if (planillaEncontrada.existe) {
      logger.info('[CHECK] Planilla existente encontrada:', {
        numeroPlanilla: planillaEncontrada.numeroPlanilla,
        totalPagar: planillaEncontrada.totalPagar,
        periodo: planillaEncontrada.periodo,
      });

      // Construir selector para el botón de pagar
      let btnPagarSelector = '';
      if (planillaEncontrada.rowIndex !== undefined) {
        // Selector basado en el índice de la fila
        btnPagarSelector = `table tr:nth-child(${planillaEncontrada.rowIndex + 1}) a[href*="pagar"], table tr:nth-child(${planillaEncontrada.rowIndex + 1}) img[src*="pagar"]`;
      }

      return {
        existe: true,
        numeroPlanilla: planillaEncontrada.numeroPlanilla,
        totalPagar: planillaEncontrada.totalPagar,
        periodo: planillaEncontrada.periodo,
        btnPagarSelector,
      };
    }

    logger.info('[CHECK] No se encontró planilla GUARDADA para el periodo');
    return { existe: false };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn('[CHECK] Error verificando planilla existente:', { error: errorMsg });
    return { existe: false };
  }
}

async function setSelectValue(page: Page, selector: string, value: string): Promise<boolean> {
  logger.info(`[setSelectValue] Buscando "${value}" en ${selector}`);

  // Primero obtener las opciones disponibles y buscar la que coincida
  const result = await page.evaluate((sel, val) => {
    const el = document.querySelector(sel) as HTMLSelectElement;
    if (!el) return { success: false, error: 'Element not found', options: [], allOptions: [] };

    const options = Array.from(el.options).map(opt => ({ value: opt.value, text: opt.text }));

    // ESTRATEGIA DE BÚSQUEDA EN ORDEN DE PRIORIDAD:
    // 1. Match EXACTO por value (case-insensitive)
    // 2. Match EXACTO por texto completo (case-insensitive)
    // 3. Match si el value EMPIEZA con el valor buscado
    // 4. Match si el texto EMPIEZA con el valor buscado
    // 5. (NO usar .includes() para evitar falsos positivos)

    // Validación inline para cada opción
    const validOptions = options.filter(opt => {
      if (!opt.value || opt.value.trim() === '' || opt.value === ' ') return false;
      if (opt.text.toUpperCase().includes('SELECCIONE')) return false;
      return true;
    });

    let matchingOption = null;

    // 1. Match exacto por value
    matchingOption = validOptions.find(opt => opt.value.toUpperCase() === val.toUpperCase());

    // 2. Match exacto por texto
    if (!matchingOption) {
      matchingOption = validOptions.find(opt => opt.text.toUpperCase() === val.toUpperCase());
    }

    // 3. Match si el value empieza con el valor buscado
    if (!matchingOption) {
      matchingOption = validOptions.find(opt => opt.value.toUpperCase().startsWith(val.toUpperCase()));
    }

    // 4. Match si el texto empieza con el valor buscado (ej: "I-INDEPENDIENTES" empieza con "I")
    if (!matchingOption) {
      matchingOption = validOptions.find(opt => opt.text.toUpperCase().startsWith(val.toUpperCase()));
    }

    // 5. Último recurso: match parcial en texto (solo si el valor buscado es largo)
    if (!matchingOption && val.length >= 4) {
      matchingOption = validOptions.find(opt => opt.text.toUpperCase().includes(val.toUpperCase()));
    }

    if (matchingOption) {
      el.value = matchingOption.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));

      // Verificar que realmente se seleccionó
      const actualValue = el.value;
      const actualText = el.options[el.selectedIndex]?.text || '';

      return {
        success: actualValue === matchingOption.value,
        selectedValue: actualValue,
        selectedText: actualText,
        requestedValue: matchingOption.value,
        options: options.slice(0, 10), // Mostrar más opciones en log
        allOptions: options,
      };
    }

    return {
      success: false,
      error: `No matching option for "${val}"`,
      options: options.slice(0, 10),
      allOptions: options,
    };
  }, selector, value);

  // Log todas las opciones disponibles para debugging
  if (result.allOptions && result.allOptions.length > 0) {
    logger.debug(`[setSelectValue] Todas las opciones (${result.allOptions.length}): ${JSON.stringify(result.allOptions)}`);
  }
  logger.info(`[setSelectValue] Opciones disponibles: ${JSON.stringify(result.options)}`);

  if (result.success) {
    logger.info(`[setSelectValue] ✅ Seleccionado: "${result.selectedText}" (value="${result.selectedValue}")`);
    return true;
  } else {
    logger.warn(`[setSelectValue] ❌ Falló: ${result.error}`);
    return false;
  }
}

async function clearAndType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector, { clickCount: 3 }); // Triple click para seleccionar todo
  await page.keyboard.press('Backspace');
  await page.type(selector, text, { delay: 50 });
}

async function waitForSelectOptions(page: Page, selector: string, timeout = 5000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (sel) => {
        const select = document.querySelector(sel) as HTMLSelectElement;
        return select && select.options.length > 1;
      },
      { timeout },
      selector
    );
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// PASO 1: NAVEGAR A "EN LÍNEA"
// ============================================================================
// NOTA: En lugar de hacer click en el menú (que usa selectores de Playwright),
// navegamos directamente a la URL de inicioPlanillaEnLinea.do con el sessionID actual.

async function navegarAEnLinea(page: Page): Promise<void> {
  logger.info('[PASO 1] Navegando a "En línea" directamente via URL');

  // Obtener el sessionID de la URL actual
  const currentUrl = page.url();
  const sessionMatch = currentUrl.match(/nuevoSoiAchColombiaSessionID=([^&]+)/);

  if (!sessionMatch) {
    throw new Error('No se encontró el sessionID en la URL actual');
  }

  const sessionId = sessionMatch[1];
  const targetUrl = `https://servicio.nuevosoi.com.co/soi/inicioPlanillaEnLinea.do;nuevoSoiAchColombiaSessionID=${sessionId}`;

  logger.info(`[PASO 1] Navegando a: ${targetUrl}`);

  await page.goto(targetUrl, {
    waitUntil: 'networkidle0',
    timeout: TIMEOUTS.NAVIGATION,
  });

  await page.waitForTimeout(2000);

  // Verificar que llegamos al formulario correcto
  const tipoPlanillaSelect = await page.$('select[name="tipoPlanilla"]');
  if (!tipoPlanillaSelect) {
    // Puede que estemos en otra página, verificar URL
    const finalUrl = page.url();
    logger.warn(`[PASO 1] URL final: ${finalUrl}`);

    if (!finalUrl.includes('inicioPlanillaEnLinea') && !finalUrl.includes('planillaEnLinea')) {
      throw new Error('No se pudo navegar al formulario de crear planilla');
    }
  }

  await takeScreenshot(page, 'paso1_en_linea');
  logger.info('[PASO 1] Navegación a "En línea" completada');
}

// ============================================================================
// PASO 2: INFORMACIÓN BÁSICA (Paso 1 de 4)
// ============================================================================

async function configurarInformacionBasica(page: Page, input: PlanillaInput): Promise<void> {
  logger.info('[PASO 2] Configurando información básica (Paso 1 de 4)');

  // Esperar que cargue el formulario
  await page.waitForSelector('form, #planillaEnLineaPaso1Form', { timeout: TIMEOUTS.ELEMENT });
  await page.waitForTimeout(2000); // Dar más tiempo para carga inicial

  await takeScreenshot(page, 'paso2_formulario_inicial');

  // Verificar campos que ya vienen correctos (NO modificar)
  // - Tipo Aportante: 02-INDEPENDIENTE
  // - Clase Aportante: I-INDEPENDIENTE
  // - Naturaleza Jurídica: PRIVADA
  // - Forma de Presentación: ÚNICO
  // - Aportante Exonerado: NO

  // ========================================================================
  // SELECCIONAR TIPO DE PLANILLA: "I" (I-INDEPENDIENTES)
  // IMPORTANTE: Las opciones se cargan DINÁMICAMENTE basadas en tipoAportante.
  // Debemos esperar a que la opción "I" esté disponible.
  // ========================================================================
  const tipoPlanillaSelector = SOI_SELECTORS.CREAR_PLANILLA.PASO1.TIPO_PLANILLA;

  // Primero esperar a que el select tenga opciones cargadas (más de solo "SELECCIONE")
  logger.info('[PASO 2] Esperando que las opciones de tipoPlanilla se carguen...');

  try {
    await page.waitForFunction(
      (selector) => {
        const select = document.querySelector(selector) as HTMLSelectElement;
        if (!select) return false;
        // Buscar si existe la opción "I" o "I-INDEPENDIENTES"
        const options = Array.from(select.options);
        return options.some(opt =>
          opt.value === 'I' ||
          opt.text.toUpperCase().includes('INDEPENDIENTE')
        );
      },
      { timeout: 10000 },
      tipoPlanillaSelector
    );
    logger.info('[PASO 2] ✅ Opciones de tipoPlanilla cargadas');
  } catch {
    // Si no se carga, tomar screenshot e intentar de todos modos
    logger.warn('[PASO 2] Timeout esperando opciones de tipoPlanilla, intentando seleccionar de todos modos...');
    await takeScreenshot(page, 'paso2_tipoPlanilla_timeout');
  }

  // Ahora seleccionar el tipo de planilla
  const tipoPlanillaSet = await setSelectValue(page, tipoPlanillaSelector, 'I');
  if (!tipoPlanillaSet) {
    // Verificar si ya está seleccionado
    const currentValue = await page.evaluate((sel) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (!select) return { value: '', text: '' };
      const selectedOption = select.options[select.selectedIndex];
      return {
        value: select.value,
        text: selectedOption?.text || ''
      };
    }, tipoPlanillaSelector);

    logger.info(`[PASO 2] Valor actual de tipoPlanilla: "${currentValue.value}" - "${currentValue.text}"`);

    if (currentValue.value !== 'I' && !currentValue.text.toUpperCase().includes('INDEPENDIENTE')) {
      throw new Error(`No se pudo seleccionar tipo planilla "I". Valor actual: ${currentValue.text}`);
    }

    logger.info('[PASO 2] ✅ tipoPlanilla ya estaba seleccionado correctamente');
  }

  await page.waitForTimeout(500);

  // Seleccionar Periodo Mes
  const periodoMesSelector = SOI_SELECTORS.CREAR_PLANILLA.PASO1.PERIODO_MES;
  const mesSet = await setSelectValue(page, periodoMesSelector, input.mesPago);
  if (!mesSet) {
    throw new Error(`No se pudo seleccionar el mes: ${input.mesPago}`);
  }

  await page.waitForTimeout(500);

  // Seleccionar Periodo Año
  const periodoAnioSelector = SOI_SELECTORS.CREAR_PLANILLA.PASO1.PERIODO_ANIO;
  const anioSet = await setSelectValue(page, periodoAnioSelector, input.anioPago);
  if (!anioSet) {
    throw new Error(`No se pudo seleccionar el año: ${input.anioPago}`);
  }

  await page.waitForTimeout(500);

  // ========================================================================
  // VERIFICACIÓN FINAL: Asegurar que tipoPlanilla está correctamente seleccionado
  // ========================================================================
  const finalCheck = await page.evaluate((sel) => {
    const select = document.querySelector(sel) as HTMLSelectElement;
    if (!select) return { valid: false, value: '', text: '' };
    const selectedOption = select.options[select.selectedIndex];
    return {
      valid: select.value === 'I' || (selectedOption?.text || '').toUpperCase().includes('INDEPENDIENTE'),
      value: select.value,
      text: selectedOption?.text || ''
    };
  }, tipoPlanillaSelector);

  logger.info(`[PASO 2] Verificación final tipoPlanilla: ${finalCheck.value} - ${finalCheck.text}`);

  if (!finalCheck.valid) {
    await takeScreenshot(page, 'paso2_tipoPlanilla_error');
    throw new Error(`tipoPlanilla no está configurado correctamente. Valor: "${finalCheck.value}", Texto: "${finalCheck.text}"`);
  }

  await takeScreenshot(page, 'paso2_formulario_configurado');

  // Verificar si hay errores visibles en el formulario
  const error = await checkForErrors(page);
  if (error) {
    throw new Error(`Error en información básica: ${error}`);
  }

  // Click "Siguiente"
  const btnSiguiente = await page.waitForSelector(
    SOI_SELECTORS.CREAR_PLANILLA.PASO1.BTN_SIGUIENTE,
    { visible: true, timeout: TIMEOUTS.ELEMENT }
  );

  if (!btnSiguiente) {
    throw new Error('No se encontró el botón "Siguiente"');
  }

  await btnSiguiente.click();
  logger.info('[PASO 2] Click en "Siguiente" realizado, esperando navegación...');

  // Esperar navegación a paso 2
  // NOTA: SOI no siempre cambia la URL a "planillaEnLineaPaso2"
  // Verificamos que aparezca el botón "Agregar cotizante" que es exclusivo del paso 2
  try {
    await page.waitForFunction(
      () => {
        // Verificar si apareció el botón "Agregar cotizante" (paso 2)
        const btnAgregar = document.querySelector('a[onclick*="agregarCotizante"]');
        if (btnAgregar) return true;

        // O verificar si el indicador de paso muestra "Paso 2"
        const bodyText = document.body?.innerText || '';
        if (bodyText.includes('Paso 2 de 4') || bodyText.includes('Agregar cotizante')) {
          return true;
        }

        // O si apareció un error
        const errorDiv = document.querySelector('.alert-danger, .error, .mensaje-error');
        if (errorDiv && errorDiv.textContent && errorDiv.textContent.trim().length > 0) {
          return true; // Salir del wait para capturar el error
        }

        return false;
      },
      { timeout: TIMEOUTS.NAVIGATION }
    );
  } catch {
    // Timeout - tomar screenshot y verificar estado
    await takeScreenshot(page, 'paso2_navegacion_timeout');
    logger.warn('[PASO 2] Timeout esperando navegación a paso 2');
  }

  await page.waitForTimeout(1000);

  // Verificar si hubo error después del click
  const postClickError = await checkForErrors(page);
  if (postClickError) {
    await takeScreenshot(page, 'paso2_error_post_click');
    throw new Error(`Error después de click en Siguiente: ${postClickError}`);
  }

  // Verificar que estamos en paso 2 buscando el botón "Agregar cotizante"
  const btnAgregarCotizante = await page.$(SOI_SELECTORS.CREAR_PLANILLA.PASO2.BTN_AGREGAR_COTIZANTE);
  if (!btnAgregarCotizante) {
    // Última verificación: buscar "Paso 2 de 4" en el texto
    const pageText = await page.evaluate(() => document.body.innerText);
    if (!pageText.includes('Paso 2 de 4') && !pageText.includes('Agregar cotizante')) {
      await takeScreenshot(page, 'paso2_navegacion_fallida');
      throw new Error('No se navegó al paso 2. No se encontró "Agregar cotizante"');
    }
  }

  await takeScreenshot(page, 'paso2_completado');
  logger.info('[PASO 2] Información básica configurada, ahora en Paso 2 (Información Detallada)');
}

// ============================================================================
// PASO 3: AGREGAR COTIZANTE (Popup con 5 sub-pasos)
// ============================================================================

async function agregarCotizante(page: Page, browser: Browser, input: PlanillaInput): Promise<void> {
  logger.info('[PASO 3] Agregando cotizante via popup');

  await page.waitForTimeout(2000); // Dar tiempo a que cargue la página completamente

  // Buscar el botón "Agregar cotizante" con múltiples estrategias
  // SOI usa diferentes elementos según la versión:
  // - Un link <a> con imagen
  // - Un input type="button" (a veces oculto)
  // - O un elemento con onclick="agregarCotizante()"

  const selectoresAgregar = [
    'a[onclick*="agregarCotizante"]',
    'img[onclick*="agregarCotizante"]',
    'a[href="javascript:agregarCotizante()"]',
    'a[href*="agregarCotizante"]',
    // Link que contiene imagen de agregar (el elemento visual en el screenshot)
    'a img[src*="agregar"]',
    'a img[src*="add"]',
    'a img[src*="mas"]',
    'a img[src*="plus"]',
  ];

  let btnAgregar = null;

  // Intentar cada selector
  for (const selector of selectoresAgregar) {
    btnAgregar = await page.$(selector);
    if (btnAgregar) {
      logger.info(`[PASO 3] Botón encontrado con selector: ${selector}`);
      // Si encontramos una imagen, necesitamos el link padre
      if (selector.includes('a img')) {
        // Ya tenemos la imagen, el click en ella debería funcionar
        // pero también podemos obtener el padre <a>
      }
      break;
    }
  }

  // Si no encontramos con selectores CSS, buscar el link que visualmente dice "Agregar cotizante"
  if (!btnAgregar) {
    logger.info('[PASO 3] Buscando link visual de "Agregar cotizante"...');

    // El elemento visual parece ser un <a> con una imagen y texto
    // Buscar todos los <a> que contienen "Agregar" en su texto o en atributos
    const elementInfo = await page.evaluate(() => {
      // Buscar en todos los elementos clickeables
      const clickables = Array.from(document.querySelectorAll('a, img[onclick], input[onclick], button'));

      for (const el of clickables) {
        const text = el.textContent?.toLowerCase() || '';
        const onclick = el.getAttribute('onclick')?.toLowerCase() || '';
        const href = el.getAttribute('href')?.toLowerCase() || '';
        const value = el.getAttribute('value')?.toLowerCase() || '';

        if (text.includes('agregar cotizante') ||
            onclick.includes('agregarcotizante') ||
            href.includes('agregarcotizante') ||
            value.includes('agregar cotizante')) {

          // Verificar si está visible
          const style = window.getComputedStyle(el);
          const isVisible = style.display !== 'none' && style.visibility !== 'hidden';

          return {
            found: true,
            tagName: el.tagName,
            visible: isVisible,
            text: text.substring(0, 100),
            onclick: onclick.substring(0, 100),
            href: href.substring(0, 100),
            outerHTML: el.outerHTML.substring(0, 300),
          };
        }
      }

      // Si no encontramos, buscar cualquier elemento con onclick="agregarCotizante()"
      const withOnclick = document.querySelector('[onclick*="agregarCotizante"]');
      if (withOnclick) {
        return {
          found: true,
          tagName: withOnclick.tagName,
          onclick: withOnclick.getAttribute('onclick'),
          outerHTML: withOnclick.outerHTML.substring(0, 300),
        };
      }

      return { found: false };
    });

    logger.info(`[PASO 3] Análisis de elemento: ${JSON.stringify(elementInfo)}`);

    // Si hay un elemento con onclick que contiene "agregarCotizante" (case insensitive)
    if (elementInfo.found && elementInfo.onclick?.toLowerCase().includes('agregarcotizante')) {
      logger.info('[PASO 3] ✅ Encontrado elemento con onclick="agregarCotizante()", ejecutaremos la función directamente');
      // Marcar que usaremos ejecución directa
      btnAgregar = 'DIRECT_CALL' as any;
    }
  }

  if (!btnAgregar) {
    // Tomar screenshot para debug y mostrar HTML relevante
    await takeScreenshot(page, 'paso3_boton_no_encontrado');

    const htmlDebug = await page.evaluate(() => {
      const section = document.body.innerHTML;
      const match = section.match(/.{0,500}[Aa]gregar.{0,500}/);
      return match ? match[0] : 'No se encontró "Agregar" en el HTML';
    });
    logger.error(`[PASO 3] HTML cercano a "Agregar": ${htmlDebug}`);

    throw new Error('No se encontró el botón "Agregar cotizante"');
  }

  await takeScreenshot(page, 'paso3_antes_agregar');

  // Click en "Agregar cotizante" o ejecutar función directamente
  logger.info('[PASO 3] Ejecutando acción de "Agregar cotizante"...');

  if (btnAgregar === 'DIRECT_CALL') {
    // Ejecutar la función JavaScript directamente
    logger.info('[PASO 3] Ejecutando agregarCotizante() directamente...');
    await page.evaluate(() => {
      // Llamar a la función global si existe
      if (typeof (window as any).agregarCotizante === 'function') {
        (window as any).agregarCotizante();
      } else {
        // Si no existe como función global, buscar y clickear el input
        const input = document.querySelector('input[onclick*="agregarCotizante"]') as HTMLInputElement;
        if (input) {
          input.click();
        }
      }
    });
  } else {
    // Usar click en el elemento encontrado
    try {
      if (typeof (btnAgregar as any).click === 'function') {
        await (btnAgregar as any).click();
      } else {
        await page.evaluate((el: any) => el.click(), btnAgregar);
      }
    } catch (clickError) {
      logger.warn(`[PASO 3] Click directo falló: ${clickError}`);
      // Fallback: ejecutar función directamente
      await page.evaluate(() => {
        if (typeof (window as any).agregarCotizante === 'function') {
          (window as any).agregarCotizante();
        }
      });
    }
  }

  logger.info('[PASO 3] Acción ejecutada, esperando popup...');

  // Esperar a que el popup se abra (polling)
  let popupPage: Page | null = null;
  const maxAttempts = 15; // 15 intentos * 1 segundo = 15 segundos máximo

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await page.waitForTimeout(1000);

    const currentPages = await browser.pages();
    logger.info(`[PASO 3] Intento ${attempt + 1}/${maxAttempts}: ${currentPages.length} páginas`);

    // Buscar la página del popup (ingresarCotizante)
    for (const p of currentPages) {
      if (p.url().includes('ingresarCotizante')) {
        try {
          const hasForm = await p.$('form');
          if (hasForm) {
            logger.info('[PASO 3] ✅ Popup encontrado!');
            popupPage = p;
            break;
          }
        } catch {
          // La página puede estar cargando aún, continuar
        }
      }
    }

    if (popupPage) break;
  }

  if (!popupPage) {
    // Log de páginas actuales para debug
    const finalPages = await browser.pages();
    for (let i = 0; i < finalPages.length; i++) {
      logger.info(`[PASO 3]   Página ${i}: ${finalPages[i].url().substring(0, 80)}`);
    }
    throw new Error('No se pudo encontrar el popup de cotizante después de 15 segundos');
  }

  // Esperar que cargue el formulario del popup
  await popupPage.waitForSelector('form', { timeout: TIMEOUTS.ELEMENT });
  await popupPage.waitForTimeout(1000);

  logger.info('[PASO 3] Popup de cotizante listo');

  try {
    // ========== SUB-PASO 1/5: Información Básica ==========
    await subPaso1InformacionBasica(popupPage, input);

    // ========== SUB-PASO 2/5: Novedades ==========
    await subPaso2Novedades(popupPage);

    // ========== SUB-PASO 3/5: Seguridad Social ==========
    await subPaso3SeguridadSocial(popupPage, input);

    // ========== SUB-PASO 4/5: Parafiscales ==========
    await subPaso4Parafiscales(popupPage, input);

    // ========== SUB-PASO 5/5: Resumen y Finalizar ==========
    await subPaso5Resumen(popupPage, input);

  } catch (error) {
    await takeScreenshot(popupPage, 'popup_error');
    throw error;
  }

  // El popup se cierra automáticamente después de Finalizar
  // Esperar un momento y volver a la ventana principal
  await page.waitForTimeout(2000);
  await page.bringToFront();

  await takeScreenshot(page, 'paso3_cotizante_agregado');
  logger.info('[PASO 3] Cotizante agregado exitosamente');
}

// --------------------------------------------------------------------------
// SUB-PASO 1/5: Información Básica del Cotizante
// --------------------------------------------------------------------------

async function subPaso1InformacionBasica(popup: Page, input: PlanillaInput): Promise<void> {
  logger.info('[SUB-PASO 1/5] Información Básica del Cotizante');

  await takeScreenshot(popup, 'subpaso1_inicial');

  const selectors = SOI_SELECTORS.AGREGAR_COTIZANTE.PASO1;

  // Tipo identificación ya viene como CÉDULA DE CIUDADANÍA - NO cambiar

  // Ingresar cédula
  const inputCedula = await popup.waitForSelector(selectors.NUMERO_DOCUMENTO, {
    visible: true,
    timeout: TIMEOUTS.ELEMENT,
  });

  if (!inputCedula) {
    throw new Error('No se encontró el campo de número de documento');
  }

  await clearAndType(popup, selectors.NUMERO_DOCUMENTO, input.cedula);

  // Disparar evento blur para que SOI autocomplete
  await popup.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLInputElement;
    if (el) {
      el.blur();
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, selectors.NUMERO_DOCUMENTO);

  // Esperar autocomplete de nombres (máx 8 segundos)
  logger.info('[SUB-PASO 1/5] Esperando autocomplete de nombres desde BDUA...');

  try {
    await popup.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        return el && el.value && el.value.trim().length > 0;
      },
      { timeout: TIMEOUTS.AUTOCOMPLETE },
      selectors.PRIMER_NOMBRE
    );
    logger.info('[SUB-PASO 1/5] Nombres autocompletados desde BDUA');
  } catch {
    logger.warn('[SUB-PASO 1/5] Autocomplete de nombres no completó, verificar manualmente');
  }

  await popup.waitForTimeout(500);

  // Seleccionar Tipo Cotizante: "3,3" (3-INDEPENDIENTE)
  // El valor del select es "id,codigo" formato compuesto
  // IMPORTANTE: Esta selección dispara una validación AJAX en SOI
  logger.info('[SUB-PASO 1/5] Seleccionando tipo cotizante 3-INDEPENDIENTE...');

  // Verificar el onchange del select antes de seleccionar
  const onchangeHandler = await popup.evaluate(() => {
    const select = document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement;
    return select?.getAttribute('onchange') || '(none)';
  });
  logger.info(`[SUB-PASO 1/5] onchange handler: ${onchangeHandler}`);

  const tipoCotizanteSet = await setSelectValue(popup, selectors.TIPO_COTIZANTE, '3,3');
  if (!tipoCotizanteSet) {
    throw new Error('No se pudo seleccionar tipo cotizante "3-INDEPENDIENTE"');
  }

  // Tomar screenshot inmediatamente después de seleccionar
  await takeScreenshot(popup, 'subpaso1_post_tipo_cotizante');

  // Esperar más tiempo porque seleccionar tipoCotizante puede disparar validaciones AJAX
  logger.info('[SUB-PASO 1/5] Esperando respuesta de validación AJAX...');
  await popup.waitForTimeout(3000);

  // Verificar que el popup sigue abierto (no cerrado por error)
  // NOTA: Después de seleccionar tipoCotizante, el popup puede navegar a:
  // - informacionBasica.do (paso siguiente del wizard)
  // - ingresarCotizante.do (sigue en el mismo paso)
  // Ambas URLs son válidas para continuar
  try {
    const popupUrl = popup.url();
    logger.info(`[SUB-PASO 1/5] URL del popup: ${popupUrl}`);

    // URLs válidas para continuar en el wizard del cotizante
    const validUrls = ['ingresarCotizante', 'informacionBasica', 'cotizante'];
    const isValidUrl = validUrls.some(url => popupUrl.includes(url));

    if (!isValidUrl) {
      // El popup cambió a una URL no esperada - puede ser un error
      await takeScreenshot(popup, 'subpaso1_popup_redirigido');
      throw new Error(`El popup de cotizante navegó a una URL no esperada: ${popupUrl}`);
    }
    logger.info('[SUB-PASO 1/5] Popup sigue en wizard del cotizante');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[SUB-PASO 1/5] Error verificando popup: ${errorMsg}`);
    if (errorMsg.includes('context was destroyed') || errorMsg.includes('Target closed')) {
      throw new Error('El popup se cerró inesperadamente. Posible causa: el cotizante ya existe para este periodo.');
    }
    throw err;
  }

  // SubTipo Cotizante: dejar en SELECCIONE (no tocar)
  // Cotizante Exonerado: dejar en NO (no tocar)
  // Colombiano exterior: NO marcar (no tocar)

  // Seleccionar Departamento
  logger.info('[SUB-PASO 1/5] Seleccionando departamento...');
  const departamentoSet = await setSelectValue(popup, selectors.DEPARTAMENTO, input.departamento);
  if (!departamentoSet) {
    throw new Error(`No se pudo seleccionar departamento: ${input.departamento}`);
  }

  // Esperar que municipio cargue sus opciones
  await popup.waitForTimeout(1000);
  const municipioLoaded = await waitForSelectOptions(popup, selectors.MUNICIPIO);
  if (!municipioLoaded) {
    logger.warn('Opciones de municipio no cargaron completamente');
  }

  // Seleccionar Municipio
  const municipioSet = await setSelectValue(popup, selectors.MUNICIPIO, input.municipio);
  if (!municipioSet) {
    throw new Error(`No se pudo seleccionar municipio: ${input.municipio}`);
  }

  await takeScreenshot(popup, 'subpaso1_completado');

  // Verificar errores
  const error = await checkForErrors(popup);
  if (error) {
    throw new Error(`Error en información básica del cotizante: ${error}`);
  }

  // Click Siguiente
  const btnSiguiente = await popup.waitForSelector(selectors.BTN_SIGUIENTE, {
    visible: true,
    timeout: TIMEOUTS.ELEMENT,
  });

  if (!btnSiguiente) {
    throw new Error('No se encontró el botón "Siguiente" en sub-paso 1');
  }

  await btnSiguiente.click();
  await popup.waitForTimeout(1500);

  logger.info('[SUB-PASO 1/5] Completado');
}

// --------------------------------------------------------------------------
// SUB-PASO 2/5: Novedades
// --------------------------------------------------------------------------

async function subPaso2Novedades(popup: Page): Promise<void> {
  logger.info('[SUB-PASO 2/5] Novedades');

  await takeScreenshot(popup, 'subpaso2_inicial');

  // NO marcar ningún checkbox (ING, RET, VSP, VST, IGE, LMA, AVP)
  // Click Siguiente directo

  const selectors = SOI_SELECTORS.AGREGAR_COTIZANTE.PASO2;

  // Verificar errores antes de continuar
  const error = await checkForErrors(popup);
  if (error) {
    throw new Error(`Error en novedades: ${error}`);
  }

  // Buscar botón siguiente (input con value="Siguiente" o id=siguiente1/siguiente2)
  const btnSiguiente = await popup.$('input[value="Siguiente"]')
    || await popup.$('input#siguiente1')
    || await popup.$('input#siguiente2');

  if (!btnSiguiente) {
    throw new Error('No se encontró el botón "Siguiente" en sub-paso 2');
  }

  await btnSiguiente.click();
  await popup.waitForTimeout(1500);

  logger.info('[SUB-PASO 2/5] Completado (sin novedades)');
}

// --------------------------------------------------------------------------
// SUB-PASO 3/5: Seguridad Social
// --------------------------------------------------------------------------
// IMPORTANTE: AFP y EPS vienen prellenados del RUAF y están DISABLED.
// El bot NO debe intentar cambiarlos.
// Solo debe:
// 1. Ingresar el salario básico (sarioBasico - con typo en el nombre del campo)
// 2. Verificar/llenar días cotizados (30)
// 3. Las tarifas ya vienen correctas (16% pensión, 12.5% salud)
// 4. El IBC se calcula automáticamente (readonly)

async function subPaso3SeguridadSocial(popup: Page, input: PlanillaInput): Promise<void> {
  logger.info('[SUB-PASO 3/5] Seguridad Social');

  await takeScreenshot(popup, 'subpaso3_inicial');

  // NOTA: Los selectores reales verificados en SOI son:
  // - Salario: input[name="sarioBasico"] (con typo, no "salarioBasico")
  // - Días pensión: input[name="numeroDiasCotizadosPension"]
  // - Días salud: input[name="numeroDiasCotizadosSalud"]
  // - AFP: select[name="administradoraPension"] (DISABLED - no tocar)
  // - EPS: select[name="administradoraSalud"] (DISABLED - no tocar)
  // - IBC Pensión: input[name="ibcPension"] (READONLY - se calcula solo)
  // - IBC Salud: input[name="ibcSalud"] (READONLY - se calcula solo)

  // 1. Ingresar Salario Básico (campo con typo: sarioBasico)
  const salarioSelector = 'input[name="sarioBasico"]';
  const salarioInput = await popup.waitForSelector(salarioSelector, {
    visible: true,
    timeout: TIMEOUTS.ELEMENT,
  });

  if (!salarioInput) {
    throw new Error('No se encontró el campo de salario básico (sarioBasico)');
  }

  // Limpiar y escribir el IBC
  await clearAndType(popup, salarioSelector, input.ibc.toString());
  logger.info(`[SUB-PASO 3/5] Salario básico ingresado: ${input.ibc}`);

  // Trigger blur para que calcule los IBC automáticamente
  await popup.evaluate(() => {
    const input = document.querySelector('input[name="sarioBasico"]') as HTMLInputElement;
    if (input) {
      input.blur();
      // Llamar función de cálculo si existe
      if (typeof (window as any).calcularDiasSalario === 'function') {
        (window as any).calcularDiasSalario(input.form);
      }
    }
  });

  // Esperar que se calculen los IBC
  await popup.waitForTimeout(2000);

  // 2. Verificar/llenar días cotizados PENSIÓN (debe ser 30)
  const diasPensionSelector = 'input[name="numeroDiasCotizadosPension"]';
  const diasPensionInput = await popup.$(diasPensionSelector);
  if (diasPensionInput) {
    const diasPension = await popup.evaluate(
      () => (document.querySelector('input[name="numeroDiasCotizadosPension"]') as HTMLInputElement)?.value || ''
    );

    if (diasPension !== '30') {
      await clearAndType(popup, diasPensionSelector, '30');
      logger.info('[SUB-PASO 3/5] Días cotizados pensión: 30');
    } else {
      logger.info('[SUB-PASO 3/5] Días cotizados pensión ya es 30');
    }
  }

  await popup.waitForTimeout(500);

  // 3. Verificar/llenar días cotizados SALUD (debe ser 30)
  const diasSaludSelector = 'input[name="numeroDiasCotizadosSalud"]';
  const diasSaludInput = await popup.$(diasSaludSelector);
  if (diasSaludInput) {
    const diasSalud = await popup.evaluate(
      () => (document.querySelector('input[name="numeroDiasCotizadosSalud"]') as HTMLInputElement)?.value || ''
    );

    if (diasSalud !== '30') {
      await clearAndType(popup, diasSaludSelector, '30');
      logger.info('[SUB-PASO 3/5] Días cotizados salud: 30');
    } else {
      logger.info('[SUB-PASO 3/5] Días cotizados salud ya es 30');
    }
  }

  // 4. Verificar tarifas (solo log, no cambiar)
  const tarifaPension = await popup.evaluate(
    () => (document.querySelector('select[name="tarifaPension"]') as HTMLSelectElement)?.value || ''
  );
  const tarifaSalud = await popup.evaluate(
    () => (document.querySelector('select[name="tarifaSalud"]') as HTMLSelectElement)?.value || ''
  );
  logger.info(`[SUB-PASO 3/5] Tarifas - Pensión: ${tarifaPension}, Salud: ${tarifaSalud}`);

  // 5. Verificar que AFP y EPS estén prellenados (solo log informativo)
  const afpValue = await popup.evaluate(
    () => (document.querySelector('select[name="administradoraPension"]') as HTMLSelectElement)?.selectedOptions[0]?.text || ''
  );
  const epsValue = await popup.evaluate(
    () => (document.querySelector('select[name="administradoraSalud"]') as HTMLSelectElement)?.selectedOptions[0]?.text || ''
  );
  logger.info(`[SUB-PASO 3/5] AFP prellenada: ${afpValue}`);
  logger.info(`[SUB-PASO 3/5] EPS prellenada: ${epsValue}`);

  // Esperar que se calculen valores finales
  await popup.waitForTimeout(1500);

  await takeScreenshot(popup, 'subpaso3_completado');

  // Verificar errores
  const error = await checkForErrors(popup);
  if (error) {
    throw new Error(`Error en seguridad social: ${error}`);
  }

  // Click Siguiente (hay dos botones: #siguiente1 y #siguiente2, usar el primero visible)
  const btnSiguiente = await popup.$('input#siguiente1') || await popup.$('input#siguiente2');

  if (!btnSiguiente) {
    throw new Error('No se encontró el botón "Siguiente" en sub-paso 3');
  }

  await btnSiguiente.click();
  await popup.waitForTimeout(1500);

  logger.info('[SUB-PASO 3/5] Completado');
}

// --------------------------------------------------------------------------
// SUB-PASO 4/5: Parafiscales
// --------------------------------------------------------------------------
// NOTA: Para independientes tipo 3, los parafiscales (Caja, SENA, ICBF)
// generalmente NO aplican. Solo dar click en Siguiente.

async function subPaso4Parafiscales(popup: Page, _input: PlanillaInput): Promise<void> {
  logger.info('[SUB-PASO 4/5] Parafiscales');

  await takeScreenshot(popup, 'subpaso4_inicial');

  // Para independientes tipo 3, no hay que llenar nada en este paso
  // Solo verificar si hay algún campo y dejarlo como está
  logger.info('[SUB-PASO 4/5] Independiente tipo 3 - no requiere parafiscales');

  await popup.waitForTimeout(500);

  // Verificar errores
  const error = await checkForErrors(popup);
  if (error) {
    throw new Error(`Error en parafiscales: ${error}`);
  }

  // Click Siguiente
  const btnSiguiente = await popup.$('input[value="Siguiente"]')
    || await popup.$('input#siguiente1')
    || await popup.$('input#siguiente2');

  if (!btnSiguiente) {
    throw new Error('No se encontró el botón "Siguiente" en sub-paso 4');
  }

  await btnSiguiente.click();
  await popup.waitForTimeout(1500);

  logger.info('[SUB-PASO 4/5] Completado');
}

// --------------------------------------------------------------------------
// SUB-PASO 5/5: Resumen y Finalizar
// --------------------------------------------------------------------------

async function subPaso5Resumen(popup: Page, input: PlanillaInput): Promise<void> {
  logger.info('[SUB-PASO 5/5] Resumen');

  await takeScreenshot(popup, 'subpaso5_inicial');

  // Verificar que aparece la cédula en el resumen
  const pageContent = await popup.content();
  if (!pageContent.includes(input.cedula)) {
    logger.warn('La cédula no aparece en el resumen, verificar');
  }

  // Verificar errores
  const error = await checkForErrors(popup);
  if (error) {
    throw new Error(`Error en resumen: ${error}`);
  }

  // Click "Finalizar" o "Guardar"
  const btnFinalizar = await popup.$('input[value="Guardar"]')
    || await popup.$('input[value="Finalizar"]')
    || await popup.$('input#guardar')
    || await popup.$('input#finalizar');

  if (!btnFinalizar) {
    throw new Error('No se encontró el botón "Finalizar/Guardar" en sub-paso 5');
  }

  await takeScreenshot(popup, 'subpaso5_antes_finalizar');

  await btnFinalizar.click();

  // Esperar a que el popup se cierre o muestre confirmación
  await popup.waitForTimeout(2000);

  logger.info('[SUB-PASO 5/5] Completado - Cotizante guardado');
}

// ============================================================================
// PASO 4: CONFIRMAR PLANILLA GUARDADA
// ============================================================================

async function confirmarPlanilla(page: Page): Promise<{ numeroPlanilla: string; totalPagar: number }> {
  logger.info('[PASO 4] Confirmando planilla guardada');

  // Esperar que estemos en la página principal (puede estar en paso 2, 3 o 4)
  await page.waitForTimeout(2000);
  await page.bringToFront();

  await takeScreenshot(page, 'paso4_despues_popup');

  // Buscar mensaje de confirmación y número de planilla
  // Formato: "La planilla ha sido guardada correctamente con número: 601079595"
  const pageContent = await page.content();

  // Extraer número de planilla con regex más específico
  const numeroPlanillaMatch = pageContent.match(/guardada[^0-9]*(\d{9,12})/i) ||
                              pageContent.match(/n[uú]mero[:\s]*(\d{8,12})/i) ||
                              pageContent.match(/planilla[:\s#]*(\d{8,12})/i);

  let numeroPlanilla = numeroPlanillaMatch ? numeroPlanillaMatch[1] : '';
  logger.info(`[PASO 4] Número de planilla encontrado: ${numeroPlanilla}`);

  // Verificar errores
  const error = await checkForErrors(page);
  if (error) {
    throw new Error(`Error al confirmar planilla: ${error}`);
  }

  // Buscar botón "Siguiente" genérico (funciona en cualquier paso)
  // El botón puede tener varios selectores según el paso
  const btnSiguienteSelectors = [
    'input[value="Siguiente"]',
    '#siguiente1',
    '#siguiente2',
    'button:has-text("Siguiente")',
    'a:has-text("Siguiente")',
  ];

  // Avanzar hasta el paso final (Liquidación General - Paso 4 de 4)
  let maxClicks = 3; // Máximo 3 clicks de "Siguiente" para llegar al final

  for (let i = 0; i < maxClicks; i++) {
    // Verificar en qué paso estamos
    const currentStep = await page.evaluate(() => {
      const body = document.body.innerText;
      if (body.includes('Paso 4 de 4') || body.includes('Liquidación General')) return 4;
      if (body.includes('Paso 3 de 4') || body.includes('Validación')) return 3;
      if (body.includes('Paso 2 de 4') || body.includes('Información Detallada')) return 2;
      return 1;
    });

    logger.info(`[PASO 4] Actualmente en paso ${currentStep} de 4`);

    if (currentStep >= 4) {
      logger.info('[PASO 4] Ya estamos en el paso final');
      break;
    }

    // Buscar y hacer click en "Siguiente"
    let btnSiguiente = null;
    for (const selector of btnSiguienteSelectors) {
      try {
        btnSiguiente = await page.$(selector);
        if (btnSiguiente) {
          logger.info(`[PASO 4] Botón Siguiente encontrado con: ${selector}`);
          break;
        }
      } catch {
        // Continuar con el siguiente selector
      }
    }

    if (btnSiguiente) {
      await btnSiguiente.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, `paso4_step${currentStep}_to_${currentStep + 1}`);
    } else {
      logger.warn(`[PASO 4] No se encontró botón Siguiente en paso ${currentStep}`);
      break;
    }
  }

  const liquidacionShot = await takeScreenshot(page, 'paso4_liquidacion');
  analyzeScreenshot(liquidacionShot, '¿Los valores de liquidación SOI son números válidos y positivos? ¿Hay algún error, alerta o valor en cero visible?').then(r => logger.info('[Vision] paso4_liquidacion', r)).catch(() => {});

  // En Paso 4 (Liquidación General):
  // Hacer scroll hasta el final
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });

  await page.waitForTimeout(1000);

  // Capturar el total a pagar
  const totalText = await page.evaluate(() => {
    const body = document.body.innerText;
    // Buscar patrones como "TOTAL POR PAGAR: $1.234.567" o "Total: 1234567"
    const match = body.match(/TOTAL[^:]*:\s*\$?\s*([\d.,]+)/i) ||
                  body.match(/PAGAR[^:]*:\s*\$?\s*([\d.,]+)/i);
    return match ? match[1] : '';
  });

  let totalPagar = 0;
  if (totalText) {
    // Limpiar formato colombiano: "1.234.567" -> 1234567
    totalPagar = parseInt(totalText.replace(/[.,]/g, ''), 10);
  }

  // Si no tenemos número de planilla aún, buscarlo de nuevo
  if (!numeroPlanilla) {
    const content2 = await page.content();
    const match2 = content2.match(/planilla[:\s#]*(\d{8,12})/i) ||
                   content2.match(/n[uú]mero[:\s]*(\d{8,12})/i);
    numeroPlanilla = match2 ? match2[1] : '';
  }

  await takeScreenshot(page, 'paso4_antes_finalizar');

  // Click "Finalizar"
  const btnFinalizar = await page.$('input[value="Finalizar"]')
    || await page.$('input#finalizar')
    || await page.$('#finalizar');

  if (btnFinalizar) {
    await btnFinalizar.click();
    await page.waitForTimeout(3000);
  }

  // Esperar navegación o confirmación final
  try {
    await page.waitForFunction(
      () => window.location.href.includes('planillaEnLineaPaso3') ||
            window.location.href.includes('confirmacion') ||
            document.body.innerText.includes('exitosamente') ||
            document.body.innerText.includes('guardada'),
      { timeout: TIMEOUTS.NAVIGATION }
    );
  } catch {
    logger.warn('No se detectó confirmación explícita de finalización');
  }

  // Último intento de obtener número de planilla
  if (!numeroPlanilla) {
    const finalContent = await page.content();
    const finalMatch = finalContent.match(/(\d{10,12})/);
    numeroPlanilla = finalMatch ? finalMatch[1] : 'NO_ENCONTRADO';
  }

  await takeScreenshot(page, 'paso4_completado');

  logger.info('[PASO 4] Planilla confirmada', { numeroPlanilla, totalPagar });

  return { numeroPlanilla, totalPagar };
}

// ============================================================================
// FASE 2: PAGO PSE
// ============================================================================

/**
 * Inicia el proceso de pago PSE para una planilla ya creada.
 * Esta función continúa desde donde quedó crearPlanillaSOI() - después
 * de la página planillaEnLineaPaso3.do donde aparece el botón de pago PSE.
 *
 * FLUJO:
 * 1. Click en el círculo/botón de PSE
 * 2. Manejar advertencia PSE-04006 si aparece (click "Sí")
 * 3. Llegar al formulario de datos PSE e inspeccionar el HTML
 *
 * @param page - Página de Puppeteer (debe estar en la pantalla de pago)
 * @param numeroPlanilla - Número de la planilla a pagar
 * @returns Información del formulario PSE encontrado
 */
export async function pagarPlanillaPSE(
  page: Page,
  numeroPlanilla: string
): Promise<PagoResult> {
  logger.info('='.repeat(60));
  logger.info('FASE 2: INICIANDO PAGO PSE');
  logger.info('='.repeat(60));
  logger.info(`Planilla: ${numeroPlanilla}`);

  let lastScreenshot = '';

  try {
    // Verificar URL actual
    const currentUrl = page.url();
    logger.info(`[PSE] URL actual: ${currentUrl}`);

    await takeScreenshot(page, 'pse_paso0_inicio');

    // ========================================================================
    // PASO 0: SI ESTAMOS EN EL DASHBOARD, CLICK EN BOTÓN PAGAR PRIMERO
    // ========================================================================
    // En el dashboard principal, hay que hacer click en la imagen "pagar.png"
    // que tiene onclick="iniciarEdicion(...inicioPagoPlanillas...)"
    // Esto nos lleva a la página de pago donde está el botón PSE

    if (currentUrl.includes('loginIndependientes.do') || currentUrl.includes('inicio.do')) {
      logger.info('[PSE PASO 0] En dashboard, buscando botón PAGAR...');

      // Buscar la imagen de pagar
      const btnPagar = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        for (const img of images) {
          const onclick = img.getAttribute('onclick') || '';
          const src = img.getAttribute('src') || '';
          if (src.includes('pagar.png') || onclick.includes('inicioPagoPlanillas')) {
            // Click en la primera imagen pagar que encontremos
            (img as HTMLElement).click();
            return { clicked: true, src, onclick: onclick.substring(0, 80) };
          }
        }
        return { clicked: false };
      });

      if (btnPagar.clicked) {
        logger.info(`[PSE PASO 0] Click en botón pagar: ${JSON.stringify(btnPagar)}`);
        await page.waitForTimeout(3000);
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2000);

        const urlAfterPagar = page.url();
        logger.info(`[PSE PASO 0] URL después de pagar: ${urlAfterPagar}`);
        await takeScreenshot(page, 'pse_paso0_despues_pagar');
      } else {
        logger.warn('[PSE PASO 0] No se encontró botón pagar en dashboard');
      }
    }

    // ========================================================================
    // PASO 1: BUSCAR Y CLICK EN EL BOTÓN PSE
    // ========================================================================
    logger.info('[PSE PASO 1] Buscando elemento de pago PSE...');

    // El elemento PSE puede ser:
    // - Un link <a> con href que contiene "pagoPlanillaPSEInicio.do"
    // - Una imagen clickeable con el logo de PSE
    // - Un elemento con onclick que navega a PSE

    const pseSelectors = [
      'a[href*="pagoPlanillaPSEInicio"]',
      'a[href*="PSE"]',
      'img[src*="pse"]',
      'img[src*="PSE"]',
      'a img[src*="pse"]',
      'a img[src*="PSE"]',
      '[onclick*="PSE"]',
      '[onclick*="pse"]',
    ];

    let pseElement = null;
    let usedSelector = '';

    for (const selector of pseSelectors) {
      pseElement = await page.$(selector);
      if (pseElement) {
        usedSelector = selector;
        logger.info(`[PSE PASO 1] Elemento PSE encontrado con: ${selector}`);
        break;
      }
    }

    // Si no encontramos con selectores directos, buscar en el DOM
    if (!pseElement) {
      logger.info('[PSE PASO 1] Buscando elemento PSE en el DOM...');

      const pseInfo = await page.evaluate(() => {
        // Buscar todos los links
        const links = Array.from(document.querySelectorAll('a'));
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          const onclick = link.getAttribute('onclick') || '';
          const imgSrc = link.querySelector('img')?.getAttribute('src') || '';

          if (href.includes('pagoPlanillaPSE') ||
              href.includes('PSE') ||
              onclick.toLowerCase().includes('pse') ||
              imgSrc.toLowerCase().includes('pse')) {
            return {
              found: true,
              tagName: link.tagName,
              href: href.substring(0, 100),
              onclick: onclick.substring(0, 100),
              imgSrc: imgSrc.substring(0, 100),
              outerHTML: link.outerHTML.substring(0, 300),
            };
          }
        }

        // Buscar imágenes clickeables
        const images = Array.from(document.querySelectorAll('img'));
        for (const img of images) {
          const src = img.getAttribute('src') || '';
          if (src.toLowerCase().includes('pse')) {
            const parent = img.parentElement;
            return {
              found: true,
              tagName: 'IMG',
              src: src.substring(0, 100),
              parentTag: parent?.tagName,
              parentHref: parent?.getAttribute('href')?.substring(0, 100),
              outerHTML: (parent || img).outerHTML.substring(0, 300),
            };
          }
        }

        return { found: false };
      });

      logger.info(`[PSE PASO 1] Análisis DOM: ${JSON.stringify(pseInfo, null, 2)}`);

      if (pseInfo.found) {
        // Intentar click basado en la información encontrada
        if (pseInfo.href?.includes('pagoPlanillaPSE')) {
          pseElement = await page.$(`a[href*="pagoPlanillaPSE"]`);
          usedSelector = 'a[href*="pagoPlanillaPSE"]';
        }
      }
    }

    if (!pseElement) {
      // Listar todos los elementos clickeables para debug
      const clickables = await page.evaluate(() => {
        const elements = document.querySelectorAll('a, img[onclick], button');
        return Array.from(elements).slice(0, 20).map(el => ({
          tag: el.tagName,
          href: el.getAttribute('href')?.substring(0, 50),
          onclick: el.getAttribute('onclick')?.substring(0, 50),
          src: el.getAttribute('src')?.substring(0, 50),
          text: el.textContent?.substring(0, 30),
        }));
      });
      logger.warn('[PSE PASO 1] Elementos clickeables encontrados:', clickables);

      await takeScreenshot(page, 'pse_error_no_encontrado');
      return {
        success: false,
        estado: 'ERROR',
        error: 'No se encontró el elemento de pago PSE',
        urlActual: currentUrl,
        screenshotPath: await takeScreenshot(page, 'pse_error'),
      };
    }

    await takeScreenshot(page, 'pse_paso1_antes_click');

    // Click en el elemento PSE
    logger.info(`[PSE PASO 1] Haciendo click en PSE (${usedSelector})...`);
    await pseElement.click();

    // Esperar navegación
    await page.waitForTimeout(3000);

    const urlAfterClick = page.url();
    logger.info(`[PSE PASO 1] URL después del click: ${urlAfterClick}`);

    await takeScreenshot(page, 'pse_paso1_despues_click');

    // ========================================================================
    // PASO 2: MANEJAR ADVERTENCIA PSE-04006 (CONDICIONAL)
    // ========================================================================
    logger.info('[PSE PASO 2] Verificando si aparece advertencia PSE-04006...');

    // Verificar si estamos en la página de advertencia
    const pageText = await page.evaluate(() => document.body.innerText);

    if (pageText.includes('PSE-04006') ||
        pageText.includes('recalcular') ||
        pageText.includes('mora') ||
        urlAfterClick.includes('pagoPlanillaPSEInicio')) {

      logger.info('[PSE PASO 2] ⚠️ Advertencia PSE-04006 detectada');
      await takeScreenshot(page, 'pse_paso2_advertencia');

      // Buscar botón "Sí" o "Si"
      const btnSiSelectors = [
        'input[value="Sí"]',
        'input[value="Si"]',
        'input[value="SI"]',
        'button:contains("Sí")',
        'input[type="submit"][value*="i"]',  // Cualquier submit con "i" (Sí/Si)
      ];

      let btnSi = null;
      for (const selector of btnSiSelectors) {
        try {
          btnSi = await page.$(selector);
          if (btnSi) {
            logger.info(`[PSE PASO 2] Botón "Sí" encontrado con: ${selector}`);
            break;
          }
        } catch {
          // Continuar
        }
      }

      // Si no encontramos con selectores, buscar en DOM
      if (!btnSi) {
        const btnInfo = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input[type="submit"], input[type="button"], button');
          for (const input of inputs) {
            const value = input.getAttribute('value') || input.textContent || '';
            if (value.toLowerCase().includes('si') || value.toLowerCase().includes('sí')) {
              return {
                found: true,
                tag: input.tagName,
                value: value,
                type: input.getAttribute('type'),
                name: input.getAttribute('name'),
              };
            }
          }
          return { found: false };
        });

        logger.info(`[PSE PASO 2] Búsqueda DOM botón Sí: ${JSON.stringify(btnInfo)}`);

        if (btnInfo.found && btnInfo.value) {
          btnSi = await page.$(`input[value="${btnInfo.value}"]`);
        }
      }

      if (btnSi) {
        logger.info('[PSE PASO 2] Haciendo click en "Sí"...');
        await btnSi.click();
        await page.waitForTimeout(3000);

        const urlAfterSi = page.url();
        logger.info(`[PSE PASO 2] URL después de click "Sí": ${urlAfterSi}`);
        await takeScreenshot(page, 'pse_paso2_despues_si');
      } else {
        logger.warn('[PSE PASO 2] No se encontró botón "Sí", continuando...');
      }
    } else {
      logger.info('[PSE PASO 2] No hay advertencia PSE-04006, continuando...');
    }

    // ========================================================================
    // PASO 3: LLEGAR AL FORMULARIO DE DATOS PSE
    // ========================================================================
    logger.info('[PSE PASO 3] Verificando formulario de datos PSE...');

    const finalUrl = page.url();
    logger.info(`[PSE PASO 3] URL actual: ${finalUrl}`);

    await takeScreenshot(page, 'pse_paso3_formulario');

    // OBLIGATORIO: Imprimir el HTML del formulario
    logger.info('[PSE PASO 3] ========== HTML DEL FORMULARIO PSE ==========');

    let formHtml = '';
    try {
      formHtml = await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) {
          return form.outerHTML;
        }
        // Si no hay form, buscar el contenido principal
        const main = document.querySelector('main, #content, .content, body');
        return main?.innerHTML?.substring(0, 5000) || 'No se encontró formulario';
      });

      // Log del HTML completo
      console.log('PSE FORM HTML:', formHtml);
      logger.info('[PSE PASO 3] HTML del formulario (primeros 2000 chars):');
      logger.info(formHtml.substring(0, 2000));

    } catch (err) {
      logger.error('[PSE PASO 3] Error obteniendo HTML del formulario:', err);
    }

    // Buscar selectores específicos
    const selectoresEncontrados = await page.evaluate(() => {
      const result: Record<string, string | null> = {
        tipoAportante: null,
        entidadFinanciera: null,
        btnPagar: null,
      };

      // Buscar select de tipo de aportante
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const name = select.getAttribute('name') || '';
        const id = select.getAttribute('id') || '';
        const options = Array.from(select.options).map(o => o.text).join(', ');

        if (name.toLowerCase().includes('tipo') ||
            name.toLowerCase().includes('aportante') ||
            options.toLowerCase().includes('natural') ||
            options.toLowerCase().includes('juridica')) {
          result.tipoAportante = `select[name="${name}"]` || `select#${id}`;
        }

        if (name.toLowerCase().includes('entidad') ||
            name.toLowerCase().includes('banco') ||
            name.toLowerCase().includes('financiera') ||
            options.toLowerCase().includes('bancolombia')) {
          result.entidadFinanciera = `select[name="${name}"]` || `select#${id}`;
        }
      }

      // Buscar botón pagar
      const buttons = document.querySelectorAll('input[type="submit"], button, input[value*="Pagar"]');
      for (const btn of buttons) {
        const value = btn.getAttribute('value') || btn.textContent || '';
        if (value.toLowerCase().includes('pagar') || value.toLowerCase().includes('continuar')) {
          const name = btn.getAttribute('name');
          const id = btn.getAttribute('id');
          result.btnPagar = name ? `[name="${name}"]` : (id ? `#${id}` : btn.tagName.toLowerCase());
        }
      }

      return result;
    });

    logger.info('[PSE PASO 3] Selectores encontrados:', selectoresEncontrados);

    // Listar todos los selects con sus opciones
    const allSelects = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      return Array.from(selects).map(select => ({
        name: select.getAttribute('name'),
        id: select.getAttribute('id'),
        options: Array.from(select.options).slice(0, 10).map(o => ({
          value: o.value,
          text: o.text,
        })),
      }));
    });

    logger.info('[PSE PASO 3] Todos los selects encontrados:');
    for (const select of allSelects) {
      logger.info(`  - ${select.name || select.id}: ${JSON.stringify(select.options)}`);
    }

    // Listar todos los inputs/buttons
    const allButtons = await page.evaluate(() => {
      const elements = document.querySelectorAll('input[type="submit"], input[type="button"], button');
      return Array.from(elements).map(el => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        id: el.getAttribute('id'),
        value: el.getAttribute('value') || el.textContent?.substring(0, 30),
      }));
    });

    logger.info('[PSE PASO 3] Todos los botones encontrados:', allButtons);

    lastScreenshot = await takeScreenshot(page, 'pse_formulario');

    logger.info('='.repeat(60));
    logger.info('FASE 2: FORMULARIO PSE ALCANZADO');
    logger.info('='.repeat(60));
    logger.info(`URL: ${finalUrl}`);
    logger.info(`Screenshot: ${lastScreenshot}`);

    return {
      success: true,
      estado: 'FORMULARIO_PSE',
      urlActual: finalUrl,
      formHtml: formHtml.substring(0, 5000),  // Primeros 5000 chars
      selectoresEncontrados: {
        tipoAportante: selectoresEncontrados.tipoAportante || undefined,
        entidadFinanciera: selectoresEncontrados.entidadFinanciera || undefined,
        btnPagar: selectoresEncontrados.btnPagar || undefined,
      },
      screenshotPath: lastScreenshot,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error en pago PSE', { error: errorMsg });

    lastScreenshot = await takeScreenshot(page, 'pse_error');

    return {
      success: false,
      estado: 'ERROR',
      error: errorMsg,
      urlActual: page.url(),
      screenshotPath: lastScreenshot,
    };
  }
}

// ============================================================================
// FASE 3: COMPLETAR FORMULARIO PSE Y NAVEGAR AL BANCO
// ============================================================================

/**
 * Configuración PSE verificada
 */
export const PSE_CONFIG = {
  // Selectores SOI
  SELECTORS: {
    tipoAportante: 'select[name="codTipoEntidad"]',
    entidadFinanciera: 'select[name="codEntidadFinanciera"]',
    btnPagar: 'input[name="pagar"], #pagar',
  },

  // Valores para selects
  VALUES: {
    tipoJuridica: 'J',
    tipoNatural: 'N',
    bancolombia: '11, 1007,BANCOLOMBIA',
  },

  // Datos de ULE para PSE
  ULE: {
    nit: '9020190314',
    email: 'pagos.ule@gmail.com',
  },

  // Credenciales Bancolombia (solo usuario, NUNCA la clave)
  BANCOLOMBIA: {
    usuario: 'Lbrochet01',
    // NOTA: La clave NUNCA debe estar aquí. El admin la ingresa manualmente.
  },

  // URLs esperadas
  URLS: {
    formularioPSE: 'pagoPlanillaPSEAdvertencia.do',
    bancolombia: 'bancolombia.com',
    bancolombiaAuth: 'autenticacion.apps.bancolombia.com',
    pse: 'pse.com.co',
  },
};

/**
 * Input para completar el formulario PSE
 */
export interface CompletarPSEInput {
  tipoAportante: 'JURIDICA' | 'NATURAL';
  banco: string; // Value del select (ej: "11, 1007,BANCOLOMBIA")
}

/**
 * Resultado de completar el formulario PSE
 */
export interface CompletarPSEResult {
  success: boolean;
  estado: 'EN_BANCO' | 'ESPERANDO_CLAVE_BANCOLOMBIA' | 'ERROR';
  urlBanco?: string;
  error?: string;
  screenshotPath?: string;
}

/**
 * Completa el formulario PSE y navega al banco.
 *
 * PREREQUISITO: Debe estar en la página del formulario PSE
 * (pagoPlanillaPSEAdvertencia.do)
 *
 * FLUJO:
 * 1. Seleccionar tipo de aportante (JURIDICA/NATURAL)
 * 2. Seleccionar entidad financiera (Bancolombia)
 * 3. Click en botón "Pagar"
 * 4. Esperar redirección al banco
 * 5. DETENERSE - El admin debe ingresar credenciales manualmente
 *
 * @param page - Página de Puppeteer en el formulario PSE
 * @param input - Datos del pago (tipo aportante, banco)
 * @returns Resultado con URL del banco
 */
export async function completarFormularioPSE(
  page: Page,
  input: CompletarPSEInput = {
    tipoAportante: 'JURIDICA',
    banco: PSE_CONFIG.VALUES.bancolombia,
  },
  browser?: Browser
): Promise<CompletarPSEResult> {
  logger.info('='.repeat(60));
  logger.info('FASE 3: COMPLETANDO FORMULARIO PSE');
  logger.info('='.repeat(60));
  logger.info('Input:', input);

  let lastScreenshot = '';

  try {
    // Verificar que estamos en el formulario PSE
    const currentUrl = page.url();
    logger.info(`[PSE FORM] URL actual: ${currentUrl}`);

    if (!currentUrl.includes(PSE_CONFIG.URLS.formularioPSE)) {
      throw new Error(`No estamos en el formulario PSE. URL actual: ${currentUrl}`);
    }

    await takeScreenshot(page, 'pse_form_inicio');

    // ========================================================================
    // PASO 1: SELECCIONAR TIPO DE APORTANTE
    // ========================================================================
    logger.info('[PSE FORM PASO 1] Seleccionando tipo de aportante...');

    const tipoValue = input.tipoAportante === 'JURIDICA'
      ? PSE_CONFIG.VALUES.tipoJuridica
      : PSE_CONFIG.VALUES.tipoNatural;

    await page.select(PSE_CONFIG.SELECTORS.tipoAportante, tipoValue);
    await page.waitForTimeout(500);

    logger.info(`[PSE FORM PASO 1] Tipo seleccionado: ${input.tipoAportante} (value: ${tipoValue})`);

    // ========================================================================
    // PASO 2: SELECCIONAR ENTIDAD FINANCIERA
    // ========================================================================
    logger.info('[PSE FORM PASO 2] Seleccionando entidad financiera...');

    // Verificar que el banco existe en las opciones
    const bancoExiste = await page.evaluate((bancoValue) => {
      const select = document.querySelector('select[name="codEntidadFinanciera"]') as HTMLSelectElement;
      if (!select) return false;

      return Array.from(select.options).some(o => o.value === bancoValue);
    }, input.banco);

    if (!bancoExiste) {
      throw new Error(`El banco "${input.banco}" no existe en las opciones del select`);
    }

    await page.select(PSE_CONFIG.SELECTORS.entidadFinanciera, input.banco);
    await page.waitForTimeout(500);

    logger.info(`[PSE FORM PASO 2] Banco seleccionado: ${input.banco}`);

    await takeScreenshot(page, 'pse_form_completado');

    // ========================================================================
    // PASO 3: CLICK EN PAGAR
    // ========================================================================
    logger.info('[PSE FORM PASO 3] Click en botón Pagar...');

    // Buscar botón pagar
    const btnPagar = await page.$('input[name="pagar"]') ||
                     await page.$('#pagar') ||
                     await page.$('input[value="Pagar"]');

    if (!btnPagar) {
      throw new Error('No se encontró el botón Pagar');
    }

    // Screenshot antes de click
    await takeScreenshot(page, 'pse_antes_pagar');

    // Click y esperar navegación
    logger.info('[PSE FORM PASO 3] Haciendo click en Pagar...');

    // Usar Promise.all para click + navegación
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
      btnPagar.click(),
    ]);

    await page.waitForTimeout(3000);

    const urlAfterPagar = page.url();
    logger.info(`[PSE FORM PASO 3] URL después de Pagar: ${urlAfterPagar}`);

    await takeScreenshot(page, 'pse_despues_pagar');

    // ========================================================================
    // PASO 4: VERIFICAR REDIRECCIÓN AL BANCO
    // ========================================================================
    logger.info('[PSE FORM PASO 4] Verificando redirección al banco...');

    // El flujo PSE puede pasar por una página intermedia de PSE antes del banco
    // Esperamos hasta que estemos en el banco o timeout

    let enBanco = false;
    let urlBanco = '';

    // ========================================================================
    // PASO 5: COMPLETAR FORMULARIO PSE INTERMEDIO (NIT + EMAIL)
    // ========================================================================
    // La página PSE requiere NIT y email antes de ir al banco

    for (let i = 0; i < 15; i++) {
      const url = page.url();

      // ¿Llegamos al banco?
      if (url.includes('bancolombia.com') ||
          url.includes('empresas.bancolombia') ||
          url.includes('pse.bancolombia') ||
          url.includes('sucursalvirtual')) {
        enBanco = true;
        urlBanco = url;
        logger.info(`[PSE FORM PASO 5] ¡LLEGAMOS AL BANCO! URL: ${urlBanco}`);
        break;
      }

      // ¿Estamos en la página PSE intermedia?
      if (url.includes('pse.com.co') || url.includes('registro.pse')) {
        logger.info(`[PSE FORM PASO 5] En página PSE: ${url}`);

        // Verificar si hay formulario de NIT/email para llenar
        const hayFormularioPSE = await page.evaluate(() => {
          const nitInput = document.querySelector('input[placeholder*="NIT"]') ||
                          document.querySelector('input[name*="nit"]') ||
                          document.querySelector('input[id*="nit"]');
          return !!nitInput;
        });

        if (hayFormularioPSE) {
          logger.info('[PSE FORM PASO 5] Formulario PSE detectado, llenando NIT y Email...');

          await takeScreenshot(page, 'pse_intermedio_antes');

          // Llenar NIT
          const nitInput = await page.$('input[placeholder*="NIT"]') ||
                          await page.$('input[name*="nit"]') ||
                          await page.$('input[id*="nit"]') ||
                          await page.$('input[placeholder*="NIT registrado"]');

          if (nitInput) {
            await nitInput.click({ clickCount: 3 });
            await nitInput.type(PSE_CONFIG.ULE.nit, { delay: 50 });
            logger.info(`[PSE FORM PASO 5] NIT ingresado: ${PSE_CONFIG.ULE.nit}`);
          }

          // Llenar Email
          const emailInput = await page.$('input[placeholder*="mail"]') ||
                            await page.$('input[name*="email"]') ||
                            await page.$('input[type="email"]') ||
                            await page.$('input[placeholder*="E-mail"]');

          if (emailInput) {
            await emailInput.click({ clickCount: 3 });
            await emailInput.type(PSE_CONFIG.ULE.email, { delay: 50 });
            logger.info(`[PSE FORM PASO 5] Email ingresado: ${PSE_CONFIG.ULE.email}`);
          }

          await page.waitForTimeout(500);
          await takeScreenshot(page, 'pse_intermedio_lleno');

          // Click en "Ir al Banco" - usar evaluate porque :has-text() no es CSS estándar
          logger.info('[PSE FORM PASO 5] Buscando botón "Ir al Banco"...');

          const clicked = await page.evaluate(() => {
            // Buscar todos los botones y elementos clickeables
            const elements = document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, a[class*="btn"]');
            for (const el of elements) {
              const text = el.textContent?.trim() || (el as HTMLInputElement).value || '';
              console.log('Botón encontrado:', text);
              if (text.toLowerCase().includes('ir al banco')) {
                (el as HTMLElement).click();
                return { clicked: true, text };
              }
            }
            // Fallback: buscar cualquier botón que continúe el proceso
            for (const el of elements) {
              const text = el.textContent?.trim() || (el as HTMLInputElement).value || '';
              if (text.toLowerCase().includes('continuar') ||
                  text.toLowerCase().includes('siguiente') ||
                  text.toLowerCase().includes('aceptar')) {
                (el as HTMLElement).click();
                return { clicked: true, text };
              }
            }
            return { clicked: false, text: '' };
          });

          if (clicked.clicked) {
            logger.info(`[PSE FORM PASO 5] Click en "${clicked.text}"`);
          } else {
            logger.warn('[PSE FORM PASO 5] No se encontró botón para continuar');
          }

          // Esperar navegación al banco
          await page.waitForTimeout(5000);
          continue;
        }

        // Si no hay formulario, solo esperamos la redirección
        await page.waitForTimeout(3000);
        continue;
      }

      // Si seguimos en SOI, algo salió mal
      if (url.includes('nuevosoi.com.co')) {
        const pageText = await page.evaluate(() => document.body.innerText);
        if (pageText.includes('error') || pageText.includes('Error')) {
          throw new Error(`Error en SOI: ${pageText.substring(0, 500)}`);
        }
        await page.waitForTimeout(2000);
        continue;
      }

      await page.waitForTimeout(2000);
    }

    if (!enBanco) {
      // Último intento - verificar URL actual
      urlBanco = page.url();
      enBanco = urlBanco.includes('bancolombia') ||
                urlBanco.includes('pse') ||
                urlBanco.includes('sucursalvirtual') ||
                !urlBanco.includes('nuevosoi');
    }

    lastScreenshot = await takeScreenshot(page, 'pse_en_banco');

    logger.info('='.repeat(60));
    logger.info('FASE 3: EN PÁGINA DEL BANCO');
    logger.info('='.repeat(60));
    logger.info(`URL del banco: ${urlBanco}`);

    // ========================================================================
    // PASO 6-8: NAVEGAR BANCOLOMBIA NEGOCIOS (MODULO COMPARTIDO)
    // ========================================================================
    // Usa el modulo compartido que maneja:
    // - Seleccionar Bancolombia Negocios (tercera opcion)
    // - Esperar pagina de autenticacion
    // - Ingresar usuario
    // - Esperar campo de clave
    logger.info('[PSE FORM] Usando modulo compartido navegarBancolombiaNegocios...');

    // Obtener browser desde page si no se paso como parametro
    const browserInstance = browser || (page.browser() as Browser);
    const bancolombiaResult = await navegarBancolombiaNegocios(page, browserInstance);

    urlBanco = bancolombiaResult.urlBanco || page.url();
    lastScreenshot = bancolombiaResult.screenshotPath || '';

    if (!bancolombiaResult.success) {
      return {
        success: false,
        estado: 'ERROR',
        error: bancolombiaResult.error,
        screenshotPath: lastScreenshot,
      };
    }

    // Mapear estado del modulo compartido al estado de SOI
    const estadoSOI = bancolombiaResult.estado === 'ESPERANDO_CLAVE'
      ? 'ESPERANDO_CLAVE_BANCOLOMBIA'
      : 'EN_BANCO';

    return {
      success: true,
      estado: estadoSOI,
      urlBanco,
      screenshotPath: lastScreenshot,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error completando formulario PSE', { error: errorMsg });

    lastScreenshot = await takeScreenshot(page, 'pse_form_error');

    return {
      success: false,
      estado: 'ERROR',
      error: errorMsg,
      screenshotPath: lastScreenshot,
    };
  }
}

// ============================================================================
// FASE 3: ESPERAR PAGO Y DESCARGAR COMPROBANTE
// ============================================================================

/**
 * PARTE A: Polling para detectar que el admin completó el pago en Bancolombia.
 * PARTE B: Navegación a consultas SOI para descargar el comprobante PDF.
 *
 * Esta función se llama DESPUÉS de que el bot llegó a Bancolombia y el admin
 * debe ingresar la clave manualmente. El polling detecta cuando el pago se
 * completa (redirect a SOI o PSE confirmación).
 *
 * @param page - Página de Puppeteer (actualmente en Bancolombia esperando clave)
 * @param browser - Instancia del browser
 * @param input - Datos para identificar la planilla
 * @param numeroPlanilla - Número de la planilla a buscar
 * @returns Resultado con path del comprobante descargado
 */
export async function esperarPagoYDescargarComprobante(
  page: Page,
  browser: Browser,
  input: EsperarPagoInput,
  numeroPlanilla: string
): Promise<EsperarPagoResult> {
  logger.info('='.repeat(60));
  logger.info('FASE 3: ESPERAR PAGO Y DESCARGAR COMPROBANTE');
  logger.info('='.repeat(60));
  logger.info('Input:', {
    cedula: input.cedula,
    mesPago: input.mesPago,
    anioPago: input.anioPago,
    numeroPlanilla,
  });

  let lastScreenshot = '';
  const POLLING_INTERVAL = 5000; // 5 segundos
  const MAX_WAIT_TIME = 10 * 60 * 1000; // 10 minutos

  try {
    // ========================================================================
    // PARTE A: POLLING PARA DETECTAR QUE ADMIN COMPLETÓ EL PAGO
    // ========================================================================
    logger.info('[PARTE A] Iniciando polling para detectar pago completado...');
    logger.info(`[PARTE A] Intervalo: ${POLLING_INTERVAL / 1000}s, Máximo: ${MAX_WAIT_TIME / 60000} minutos`);

    const startTime = Date.now();
    let pagoDetectado = false;
    let urlActual = page.url();

    while (Date.now() - startTime < MAX_WAIT_TIME) {
      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
      logger.info(`[PARTE A] Polling ${elapsedSeconds}s - URL: ${urlActual.substring(0, 60)}...`);

      // Verificar si la URL cambió a SOI o PSE confirmación
      urlActual = page.url();

      // Condiciones para detectar pago completado:
      // 1. Redirect a SOI (nuevosoi.com.co)
      // 2. Página PSE con confirmación
      // 3. Ya no estamos en bancolombia.com
      if (
        urlActual.includes('nuevosoi.com.co') ||
        urlActual.includes('servicio.soi') ||
        (urlActual.includes('pse.com.co') && !urlActual.includes('botonbancolombia'))
      ) {
        logger.info('[PARTE A] ✅ Pago detectado - URL cambió a SOI/PSE');
        pagoDetectado = true;
        break;
      }

      // También verificar si hay algún indicador de éxito en la página
      const pageIndicators = await page.evaluate(() => {
        const body = document.body?.innerText?.toLowerCase() || '';
        return {
          tieneExito: body.includes('exitosa') || body.includes('aprobada') || body.includes('exitoso'),
          tieneError: body.includes('rechazada') || body.includes('fallida') || body.includes('error'),
          url: window.location.href,
        };
      });

      if (pageIndicators.tieneExito) {
        logger.info('[PARTE A] ✅ Indicador de éxito encontrado en página');
        pagoDetectado = true;
        break;
      }

      if (pageIndicators.tieneError) {
        lastScreenshot = await takeScreenshot(page, 'pago_error_detectado');
        return {
          success: false,
          estado: 'ERROR',
          error: 'Pago rechazado o con error en Bancolombia',
          screenshotPath: lastScreenshot,
        };
      }

      // Esperar antes del siguiente polling
      await page.waitForTimeout(POLLING_INTERVAL);
    }

    if (!pagoDetectado) {
      lastScreenshot = await takeScreenshot(page, 'pago_timeout');
      logger.warn('[PARTE A] ⏰ Timeout esperando pago');
      return {
        success: false,
        estado: 'TIMEOUT',
        error: `Timeout después de ${MAX_WAIT_TIME / 60000} minutos esperando confirmación de pago`,
        screenshotPath: lastScreenshot,
      };
    }

    lastScreenshot = await takeScreenshot(page, 'pago_detectado');

    // ========================================================================
    // PARTE B: NAVEGACIÓN A CONSULTAS Y DESCARGA DE COMPROBANTE
    // ========================================================================
    logger.info('[PARTE B] Navegando a consultas SOI para descargar comprobante...');

    const mesNumero = MES_A_NUMERO[input.mesPago.toUpperCase()] || '01';

    // PASO B.1: Navegar al dashboard de SOI (mantener sesión)
    logger.info('[PARTE B.1] Verificando sesión y navegando al dashboard...');

    const sessionId = await extractSessionId(page);
    if (!sessionId) {
      throw new Error('No se encontró sessionID - sesión expirada');
    }

    // Ir al dashboard principal
    const dashboardUrl = `https://servicio.nuevosoi.com.co/soi/loginIndependientes.do;nuevoSoiAchColombiaSessionID=${sessionId}`;
    await page.goto(dashboardUrl, {
      waitUntil: 'networkidle0',
      timeout: TIMEOUTS.NAVIGATION,
    });
    await page.waitForTimeout(2000);

    lastScreenshot = await takeScreenshot(page, 'comprobante_dashboard');

    // PASO B.2: Navegar por menú: Consultas > Activos > Ver marzo 2017 en adelante
    logger.info('[PARTE B.2] Navegando por menú lateral...');

    // Primero expandir "Consultas" en el menú
    const menuConsultasClick = await page.evaluate(() => {
      const menuItems = document.querySelectorAll('td[class*="menu"], td[onclick]');
      for (const item of menuItems) {
        const text = item.textContent?.trim().toLowerCase() || '';
        if (text === 'consultas') {
          (item as HTMLElement).click();
          return { clicked: true, text: item.textContent?.trim() };
        }
      }
      return { clicked: false };
    });

    if (menuConsultasClick.clicked) {
      logger.info(`[PARTE B.2] Click en menú: ${menuConsultasClick.text}`);
      await page.waitForTimeout(1000);
    }

    // Expandir submenú "Activos"
    const menuActivosClick = await page.evaluate(() => {
      const menuItems = document.querySelectorAll('td[class*="menu"], td[onclick], div[onclick]');
      for (const item of menuItems) {
        const text = item.textContent?.trim().toLowerCase() || '';
        if (text === 'activos') {
          (item as HTMLElement).click();
          return { clicked: true, text: item.textContent?.trim() };
        }
      }
      return { clicked: false };
    });

    if (menuActivosClick.clicked) {
      logger.info(`[PARTE B.2] Click en submenú: ${menuActivosClick.text}`);
      await page.waitForTimeout(1000);
    }

    // Click en "Ver: marzo 2017 en adelante"
    const menuMarzoClick = await page.evaluate(() => {
      const menuItems = document.querySelectorAll('td[class*="menu"], td[onclick]');
      for (const item of menuItems) {
        const text = item.textContent?.toLowerCase() || '';
        if (text.includes('marzo') && text.includes('2017') && text.includes('adelante')) {
          (item as HTMLElement).click();
          return { clicked: true, text: item.textContent?.trim() };
        }
      }
      return { clicked: false };
    });

    if (menuMarzoClick.clicked) {
      logger.info(`[PARTE B.2] Click en: ${menuMarzoClick.text}`);
      await page.waitForTimeout(2000);
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
    } else {
      // Si no encontramos el menú, navegar directamente
      logger.warn('[PARTE B.2] No se encontró menú, navegando directamente a consultaPlanilla.do...');
      const urlConsulta = `https://servicio.nuevosoi.com.co/soi/consultaPlanilla.do;nuevoSoiAchColombiaSessionID=${sessionId}`;
      await page.goto(urlConsulta, {
        waitUntil: 'networkidle0',
        timeout: TIMEOUTS.NAVIGATION,
      });
    }

    await page.waitForTimeout(2000);
    logger.info(`[PARTE B.2] URL actual: ${page.url().substring(0, 80)}...`);

    // PASO B.3: Usar tab "General" con búsqueda por año/mes
    // IMPORTANTE:
    // - El tab "General" requiere click en INPUT #buscarGeneral1 (NO en el TD decorativo)
    // - Esto abre la segunda pantalla con los selectores de año/mes
    // - Hay DOS botones "Buscar": #buscarEspecifica1 y #buscarGeneral1
    // - SIEMPRE usar #buscarGeneral1 para búsqueda por período
    logger.info(`[PARTE B.3] Activando tab "General" para búsqueda por período...`);

    // Click en #buscarGeneral1 para ir al tab General con selectores
    const buscarGeneral1 = await page.$('#buscarGeneral1');
    if (buscarGeneral1) {
      await buscarGeneral1.click();
      logger.info('[PARTE B.3] Click en #buscarGeneral1');
      await page.waitForTimeout(2000);
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
    } else {
      logger.warn('[PARTE B.3] No se encontró #buscarGeneral1');
    }

    await page.waitForTimeout(1000);
    lastScreenshot = await takeScreenshot(page, 'comprobante_tab_general');

    // PASO B.4: Configurar selectores de año/mes SIN disparar eventos
    // (los eventos pueden resetear otros selectores)
    logger.info(`[PARTE B.4] Configurando selectores: año=${input.anioPago}, mes=${mesNumero}...`);

    // Setear valores directamente sin eventos
    try {
      await page.$eval('select[name="periodoLiqOtrosSubsAnnio"]', (el, val) => {
        (el as HTMLSelectElement).value = val;
      }, input.anioPago);
      logger.info(`[PARTE B.4] ✅ Otros Año: ${input.anioPago}`);
    } catch (e) {
      logger.warn(`[PARTE B.4] ❌ Otros Año: ${e}`);
    }

    try {
      await page.$eval('select[name="periodoLiqOtrosSubsMes"]', (el, val) => {
        (el as HTMLSelectElement).value = val;
      }, mesNumero);
      logger.info(`[PARTE B.4] ✅ Otros Mes: ${mesNumero}`);
    } catch (e) {
      logger.warn(`[PARTE B.4] ❌ Otros Mes: ${e}`);
    }

    try {
      await page.$eval('select[name="periodoLiqSaludAnnio"]', (el, val) => {
        (el as HTMLSelectElement).value = val;
      }, input.anioPago);
      logger.info(`[PARTE B.4] ✅ Salud Año: ${input.anioPago}`);
    } catch (e) {
      logger.warn(`[PARTE B.4] ❌ Salud Año: ${e}`);
    }

    try {
      await page.$eval('select[name="periodoLiqSaludMes"]', (el, val) => {
        (el as HTMLSelectElement).value = val;
      }, mesNumero);
      logger.info(`[PARTE B.4] ✅ Salud Mes: ${mesNumero}`);
    } catch (e) {
      logger.warn(`[PARTE B.4] ❌ Salud Mes: ${e}`);
    }

    await page.waitForTimeout(500);
    lastScreenshot = await takeScreenshot(page, 'comprobante_filtros');

    // PASO B.4b: Click en #buscarGeneral1 de nuevo para buscar
    // IMPORTANTE: NO usar el primer botón "Buscar" genérico - usar específicamente #buscarGeneral1
    logger.info('[PARTE B.4b] Click en #buscarGeneral1 para ejecutar búsqueda...');

    const buscarGeneral1Final = await page.$('#buscarGeneral1');
    if (buscarGeneral1Final) {
      await buscarGeneral1Final.click();
      logger.info('[PARTE B.4b] ✅ Click en #buscarGeneral1');
      await page.waitForTimeout(3000);
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    } else {
      logger.warn('[PARTE B.4b] ❌ No se encontró #buscarGeneral1');
    }

    lastScreenshot = await takeScreenshot(page, 'comprobante_resultados');

    // PASO B.5: Buscar planilla en tabla de resultados
    logger.info(`[PARTE B.5] Buscando planilla ${numeroPlanilla} en resultados...`);

    // Imprimir filas que contengan números de planilla para debug
    const planillasEnTabla = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      const planillas: string[] = [];

      rows.forEach((row) => {
        const text = row.textContent || '';
        // Buscar números de 10 dígitos (formato planilla SOI)
        const matches = text.match(/\b\d{10}\b/g);
        if (matches) {
          planillas.push(`${matches[0]} | ${text.substring(0, 80).replace(/\s+/g, ' ')}`);
        }
      });

      return planillas.slice(0, 10); // Máximo 10 planillas
    });

    logger.info('[PARTE B.5] Planillas encontradas en tabla:');
    planillasEnTabla.forEach((p) => logger.info(`  - ${p}`));

    // Buscar fila con el número de planilla específico
    const planillaRowInfo = await page.evaluate((numPlanilla) => {
      const rows = document.querySelectorAll('tr');
      for (const row of rows) {
        const text = row.textContent || '';
        if (text.includes(numPlanilla)) {
          // Buscar todos los íconos/links en esta fila
          const images = row.querySelectorAll('img');
          const links = row.querySelectorAll('a');

          const imageInfo = Array.from(images).map((img) => ({
            src: img.src?.substring(img.src.lastIndexOf('/') + 1),
            onclick: img.getAttribute('onclick')?.substring(0, 50),
          }));

          const linkInfo = Array.from(links).map((a) => ({
            href: a.href?.substring(a.href.lastIndexOf('/') + 1, a.href.lastIndexOf('/') + 50),
            text: a.textContent?.trim(),
          }));

          return {
            found: true,
            rowText: text.substring(0, 150).replace(/\s+/g, ' '),
            images: imageInfo,
            links: linkInfo,
          };
        }
      }
      return { found: false };
    }, numeroPlanilla);

    if (!planillaRowInfo.found) {
      logger.warn(`[PARTE B.5] No se encontró planilla ${numeroPlanilla} en resultados`);
      lastScreenshot = await takeScreenshot(page, 'comprobante_planilla_no_encontrada');
    } else {
      logger.info(`[PARTE B.5] Planilla encontrada: ${planillaRowInfo.rowText}`);
      logger.info(`[PARTE B.5] Imágenes en fila: ${JSON.stringify(planillaRowInfo.images)}`);
      logger.info(`[PARTE B.5] Links en fila: ${JSON.stringify(planillaRowInfo.links)}`);
    }

    // Click en ícono de "Soporte Pago" (NO "Comprobante Pago")
    // La tabla tiene dos columnas con PDF: "Comprobante Pago" y "Soporte Pago"
    // Debemos usar "Soporte Pago" que es la que tiene el onclick "descargarSoportePago"
    const comprobanteClick = await page.evaluate((numPlanilla) => {
      const rows = document.querySelectorAll('tr');
      for (const row of rows) {
        const text = row.textContent || '';
        if (text.includes(numPlanilla)) {
          // Buscar específicamente el ícono con onclick="descargarSoportePago" o "descargarComprobante"
          const imgs = row.querySelectorAll('img');
          for (const img of imgs) {
            const onclick = img.getAttribute('onclick') || '';
            // Preferir descargarSoportePago, pero también aceptar descargarComprobante
            if (onclick.includes('descargarSoportePago') || onclick.includes('descargarComprobante')) {
              (img as HTMLElement).click();
              return {
                clicked: true,
                type: 'onclick',
                onclick: onclick.substring(0, 60),
                src: img.src?.split('/').pop()
              };
            }
          }

          // Fallback: buscar cualquier img con src que contenga "pdf"
          const pdfImg = row.querySelector('img[src*="pdf"]');
          if (pdfImg) {
            (pdfImg as HTMLElement).click();
            return { clicked: true, type: 'img-pdf', src: (pdfImg as HTMLImageElement).src?.split('/').pop() };
          }
        }
      }
      return { clicked: false };
    }, numeroPlanilla);

    if (comprobanteClick.clicked) {
      logger.info(`[PARTE B.5] Click en comprobante: ${JSON.stringify(comprobanteClick)}`);
      await page.waitForTimeout(2000);
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
    }

    // PASO B.6: Manejar página "soportePagoInicio.do"
    logger.info('[PARTE B.6] Verificando página de soporte...');

    const soporteUrl = page.url();
    logger.info(`[PARTE B.6] URL actual: ${soporteUrl.substring(0, 80)}...`);

    lastScreenshot = await takeScreenshot(page, 'comprobante_soporte_pagina');

    if (soporteUrl.includes('soporte') || soporteUrl.includes('Soporte')) {
      logger.info('[PARTE B.6] En página de soporte de pago');

      // Buscar el texto "Para descargar su(s) soporte(s)" y el ícono PDF
      const pdfDownloadInfo = await page.evaluate(() => {
        const body = document.body.innerHTML;
        const tieneTextoSoporte = body.includes('descargar') && body.includes('soporte');

        // Buscar imagen PDF cerca de ese texto
        const images = document.querySelectorAll('img');
        let pdfImg: HTMLImageElement | null = null;

        for (const img of images) {
          const src = img.src?.toLowerCase() || '';
          if (src.includes('pdf') || src.includes('soporte') || src.includes('descargar')) {
            pdfImg = img as HTMLImageElement;
            break;
          }
        }

        return {
          tieneTextoSoporte,
          pdfImgSrc: pdfImg?.src,
          pdfImgOnclick: pdfImg?.getAttribute('onclick'),
        };
      });

      logger.info(`[PARTE B.6] Info PDF: ${JSON.stringify(pdfDownloadInfo)}`);
    }

    // PASO B.7: Configurar descarga de PDF ANTES de hacer click
    logger.info('[PARTE B.7] Configurando descarga de PDF...');

    const downloadPath = path.resolve(process.cwd(), 'storage/comprobantes/tmp');

    // Crear directorio si no existe
    try {
      await fs.mkdir(downloadPath, { recursive: true });
    } catch {
      // Ignorar si ya existe
    }

    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
    });

    logger.info(`[PARTE B.7] Directorio de descarga: ${downloadPath}`);

    // Click en el ícono PDF para descargar
    const pdfFinalClick = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      for (const img of images) {
        const src = img.src?.toLowerCase() || '';
        const onclick = img.getAttribute('onclick') || '';

        if (src.includes('pdf') || onclick.includes('pdf') ||
            onclick.includes('soporte') || onclick.includes('descargar')) {
          (img as HTMLElement).click();
          return { clicked: true, src: img.src, onclick: onclick.substring(0, 50) };
        }
      }

      // Buscar links también
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const href = link.href?.toLowerCase() || '';
        const text = link.textContent?.toLowerCase() || '';

        if (href.includes('pdf') || href.includes('soporte') ||
            text.includes('descargar') || text.includes('pdf')) {
          (link as HTMLElement).click();
          return { clicked: true, href: link.href };
        }
      }

      return { clicked: false };
    });

    if (pdfFinalClick.clicked) {
      logger.info(`[PARTE B.7] Click para descargar: ${JSON.stringify(pdfFinalClick)}`);
    }

    // Esperar a que se descargue
    logger.info('[PARTE B.7] Esperando descarga...');
    await page.waitForTimeout(5000);

    // PASO B.8: Buscar archivo descargado, mover y renombrar
    logger.info('[PARTE B.8] Buscando archivo descargado...');

    // Formato: PILA_{cedula}_{mesPago}_{anioPago}.pdf
    const expectedFilename = `PILA_${input.cedula}_${input.mesPago}_${input.anioPago}.pdf`;

    // Directorio destino por usuario
    const userDir = input.uleUserId
      ? path.resolve(process.cwd(), 'storage/comprobantes', input.uleUserId)
      : path.resolve(process.cwd(), 'storage/comprobantes');

    // Crear directorio de usuario si no existe
    try {
      await fs.mkdir(userDir, { recursive: true });
    } catch {
      // Ignorar si ya existe
    }

    // Listar archivos en directorio de descargas
    let downloadedFile: string | null = null;
    let fileSize = 0;
    try {
      const files = await fs.readdir(downloadPath);
      logger.info(`[PARTE B.8] Archivos en ${downloadPath}: ${files.join(', ')}`);

      const pdfFiles = files.filter((f) => f.endsWith('.pdf'));

      // Buscar el PDF más reciente (últimos 60 segundos)
      for (const file of pdfFiles) {
        const filePath = path.join(downloadPath, file);
        const stats = await fs.stat(filePath);
        const fileAge = Date.now() - stats.mtimeMs;

        if (fileAge < 60000) {
          downloadedFile = file;
          fileSize = stats.size;
          logger.info(`[PARTE B.8] Archivo encontrado: ${file} (${Math.round(fileAge / 1000)}s, ${fileSize} bytes)`);
          break;
        }
      }
    } catch (err) {
      logger.warn(`[PARTE B.8] Error listando archivos: ${err}`);
    }

    let comprobantePath = '';
    if (downloadedFile) {
      // Mover y renombrar archivo
      const oldPath = path.join(downloadPath, downloadedFile);
      const newPath = path.join(userDir, expectedFilename);

      try {
        await fs.rename(oldPath, newPath);
        comprobantePath = newPath;
        logger.info(`[PARTE B.8] Archivo movido a: ${newPath}`);
      } catch (err) {
        // Si rename falla (cross-device), copiar y eliminar
        try {
          await fs.copyFile(oldPath, newPath);
          await fs.unlink(oldPath);
          comprobantePath = newPath;
          logger.info(`[PARTE B.8] Archivo copiado a: ${newPath}`);
        } catch (copyErr) {
          comprobantePath = oldPath;
          logger.warn(`[PARTE B.8] No se pudo mover, usando original: ${copyErr}`);
        }
      }
    } else {
      logger.warn('[PARTE B.8] No se encontró archivo PDF descargado');
      lastScreenshot = await takeScreenshot(page, 'comprobante_no_descargado');
    }

    // PASO B.9: Actualizar base de datos (si tenemos uleUserId)
    if (comprobantePath && input.uleUserId) {
      logger.info('[PARTE B.9] Actualizando base de datos...');

      try {
        // Importar PrismaClient dinámicamente
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        // Buscar la planilla
        const planilla = await prisma.pilaPlanilla.findUnique({
          where: { numeroPlanilla },
        });

        if (planilla) {
          // Actualizar estado de planilla
          await prisma.pilaPlanilla.update({
            where: { id: planilla.id },
            data: {
              estadoPago: 'PAGADA',
              fechaPago: new Date(),
            },
          });
          logger.info(`[PARTE B.9] ✅ Planilla ${numeroPlanilla} actualizada a PAGADA`);

          // Crear registro de comprobante
          await prisma.comprobante.create({
            data: {
              planillaId: planilla.id,
              uleUserId: input.uleUserId,
              fileName: expectedFilename,
              filePath: comprobantePath,
              fileSize: fileSize || 0,
              mimeType: 'application/pdf',
            },
          });
          logger.info(`[PARTE B.9] ✅ Comprobante registrado en DB`);
        } else {
          logger.warn(`[PARTE B.9] No se encontró planilla ${numeroPlanilla} en DB`);
        }
      } catch (dbErr) {
        logger.error(`[PARTE B.9] Error actualizando DB: ${dbErr}`);
        // No fallar el proceso por error de DB
      }
    }

    // Resultado final
    logger.info('='.repeat(60));
    logger.info('FASE 3 COMPLETADA');
    logger.info('='.repeat(60));
    logger.info(`Planilla: ${numeroPlanilla}`);
    logger.info(`Comprobante: ${comprobantePath || '(no descargado)'}`);
    logger.info('='.repeat(60));

    return {
      success: true,
      estado: 'PAGADO',
      numeroPlanilla,
      comprobantePath: comprobantePath || undefined,
      screenshotPath: lastScreenshot,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error en esperarPagoYDescargarComprobante', { error: errorMsg });

    lastScreenshot = await takeScreenshot(page, 'comprobante_error');

    return {
      success: false,
      estado: 'ERROR',
      error: errorMsg,
      screenshotPath: lastScreenshot,
    };
  }
}

/**
 * Extrae el sessionID de SOI de la URL o cookies
 */
async function extractSessionId(page: Page): Promise<string> {
  const url = page.url();
  const match = url.match(/nuevoSoiAchColombiaSessionID=([^&]+)/);
  if (match) {
    return match[1];
  }

  // Intentar obtener de cookies
  const cookies = await page.cookies();
  const sessionCookie = cookies.find((c) => c.name.includes('Session') || c.name.includes('session'));
  return sessionCookie?.value || '';
}

// ============================================================================
// FUNCIÓN PRINCIPAL EXPORTADA
// ============================================================================

/**
 * Crea una planilla PILA en SOI para un independiente.
 *
 * @param page - Página de Puppeteer ya autenticada en SOI
 * @param browser - Instancia del browser (necesario para manejar popup)
 * @param input - Datos de la planilla a crear
 * @returns Resultado con número de planilla y total a pagar
 */
export async function crearPlanillaSOI(
  page: Page,
  browser: Browser,
  input: PlanillaInput
): Promise<PlanillaResult> {
  logger.info('='.repeat(60));
  logger.info('INICIANDO CREACIÓN DE PLANILLA SOI');
  logger.info('='.repeat(60));
  logger.info('Input:', {
    cedula: input.cedula,
    departamento: input.departamento,
    municipio: input.municipio,
    ibc: input.ibc,
    mesPago: input.mesPago,
    anioPago: input.anioPago,
  });

  let lastScreenshot = '';

  try {
    // PASO 0: Verificar si ya existe planilla GUARDADA para este periodo
    const existente = await checkPlanillaExistente(page, input);

    if (existente.existe) {
      logger.info('='.repeat(60));
      logger.info(`Planilla ${existente.numeroPlanilla} ya existe en estado GUARDADA.`);
      logger.info('Saltando creación, procediendo directo al pago.');
      logger.info('='.repeat(60));

      lastScreenshot = await takeScreenshot(page, 'planilla_ya_existia');

      return {
        success: true,
        numeroPlanilla: existente.numeroPlanilla,
        totalPagar: existente.totalPagar,
        screenshotPath: lastScreenshot,
        yaExistia: true,
      };
    }

    // PASO 1: Navegar a "En línea"
    await navegarAEnLinea(page);

    // PASO 2: Configurar información básica (Paso 1 de 4)
    await configurarInformacionBasica(page, input);

    // PASO 3: Agregar cotizante via popup
    await agregarCotizante(page, browser, input);

    // PASO 4: Confirmar planilla guardada
    const { numeroPlanilla, totalPagar } = await confirmarPlanilla(page);

    lastScreenshot = await takeScreenshot(page, 'planilla_exitosa');
    analyzeScreenshot(lastScreenshot, '¿Aparece un número de planilla y total a pagar? ¿La planilla SOI fue creada exitosamente?').then(r => logger.info('[Vision] planilla_exitosa', r)).catch(() => {});

    logger.info('='.repeat(60));
    logger.info('PLANILLA CREADA EXITOSAMENTE');
    logger.info(`Número: ${numeroPlanilla}`);
    logger.info(`Total a pagar: $${totalPagar.toLocaleString('es-CO')}`);
    logger.info('='.repeat(60));

    return {
      success: true,
      numeroPlanilla,
      totalPagar,
      screenshotPath: lastScreenshot,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error creando planilla SOI', { error: errorMsg });

    lastScreenshot = await takeScreenshot(page, 'planilla_error');

    return {
      success: false,
      error: errorMsg,
      screenshotPath: lastScreenshot,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  crearPlanillaSOI,
  pagarPlanillaPSE,
  completarFormularioPSE,
  esperarPagoYDescargarComprobante,
  PSE_CONFIG,
};
