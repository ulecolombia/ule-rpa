/**
 * SOI Crear Planilla Bot
 *
 * Maneja el flujo completo de crear planilla PILA en SOI para independientes.
 *
 * Flujo:
 * 1. Navegar a "Deseo liquidar una planilla"
 * 2. Llenar Paso 1 Planilla (periodo, tipo aportante)
 * 3. Ir a Paso 2 y abrir popup "Agregar Cotizante"
 * 4. En popup: 5 pasos con campos IBC
 * 5. Guardar y continuar a validación
 * 6. Liquidar y obtener número de planilla
 *
 * @author Claude Code
 * @date 2026-02-22
 */

import { Page, Browser } from 'puppeteer';
import { SOI_SELECTORS } from './selectors';
import { logger } from '../../utils/logger';
import type {
  SOIPlanillaLiquidacion,
  SOICotizante,
  SOISeguridadSocial,
} from '../../types/soi-planilla.types';

// ============================================================================
// INTERFACES
// ============================================================================

export interface CrearPlanillaResult {
  success: boolean;
  numeroPlanilla?: string;
  valorTotal?: number;
  desglose?: {
    salud: number;
    pension: number;
    arl?: number;
    fsp?: number;
  };
  estado?: 'LIQUIDADA' | 'PENDIENTE_PAGO' | 'ERROR';
  error?: string;
  screenshotPath?: string;
}

export interface CrearPlanillaOptions {
  takeScreenshots?: boolean;
  screenshotPrefix?: string;
  waitTimeMultiplier?: number; // Para conexiones lentas
}

// ============================================================================
// BOT PRINCIPAL
// ============================================================================

export class SOICrearPlanillaBot {
  private page: Page;
  private browser: Browser;
  private options: CrearPlanillaOptions;
  private baseWait: number;

  constructor(page: Page, options: CrearPlanillaOptions = {}) {
    this.page = page;
    this.browser = page.browser();
    this.options = {
      takeScreenshots: true,
      screenshotPrefix: 'soi-crear-planilla',
      waitTimeMultiplier: 1,
      ...options,
    };
    this.baseWait = 1000 * (this.options.waitTimeMultiplier || 1);
  }

  /**
   * Crea una planilla completa con los datos proporcionados
   */
  async crearPlanilla(data: SOIPlanillaLiquidacion): Promise<CrearPlanillaResult> {
    logger.info('Starting planilla creation', {
      userId: data.userId,
      periodo: `${data.periodo.mes}/${data.periodo.anio}`,
      cotizantes: data.cotizantes.length,
    });

    try {
      // 1. Navegar a crear planilla
      await this.navegarACrearPlanilla();
      await this.takeScreenshot('01-inicio-planilla');

      // 2. Llenar Paso 1 - Info del aportante
      await this.llenarPaso1Planilla(data);
      await this.takeScreenshot('02-paso1-completado');

      // 3. Ir a Paso 2 y agregar cotizante(s)
      for (let i = 0; i < data.cotizantes.length; i++) {
        logger.info(`Adding cotizante ${i + 1}/${data.cotizantes.length}`);
        await this.agregarCotizante(data.cotizantes[i]);
        await this.takeScreenshot(`03-cotizante-${i + 1}-agregado`);
      }

      // 4. Continuar a validación y liquidación
      const resultado = await this.continuarALiquidacion();
      await this.takeScreenshot('04-liquidacion-completada');

      logger.info('Planilla created successfully', {
        numeroPlanilla: resultado.numeroPlanilla,
        valorTotal: resultado.valorTotal,
      });

      return resultado;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error creating planilla', { error: errorMsg });

      await this.takeScreenshot('error-crear-planilla');

      return {
        success: false,
        estado: 'ERROR',
        error: errorMsg,
      };
    }
  }

  // ============================================================================
  // PASO 1: Navegar e Información del Aportante
  // ============================================================================

  private async navegarACrearPlanilla(): Promise<void> {
    logger.info('Navigating to create planilla');

    // Buscar y click en "Deseo liquidar una planilla"
    const clicked = await this.page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l =>
        l.textContent?.toLowerCase().includes('deseo liquidar una planilla') ||
        l.textContent?.toLowerCase().includes('liquidar planilla')
      );
      if (link) {
        link.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      // Intentar navegar directamente
      await this.page.goto(SOI_SELECTORS.URLS.BASE + '/inicioPlanillaEnLinea.do', {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
    }

    await this.wait(3000);

    // Verificar que estamos en la página correcta
    const isCorrectPage = await this.page.evaluate(() => {
      return document.body.innerText.includes('Paso 1') ||
             document.body.innerText.includes('Tipo de Aportante') ||
             document.body.innerText.includes('Periodo de Liquidación');
    });

    if (!isCorrectPage) {
      throw new Error('No se pudo navegar a la página de crear planilla');
    }

    logger.info('Successfully navigated to create planilla page');
  }

  private async llenarPaso1Planilla(data: SOIPlanillaLiquidacion): Promise<void> {
    logger.info('Filling Paso 1 - Aportante info', {
      periodo: `${data.periodo.mes}/${data.periodo.anio}`,
    });

    const selectors = SOI_SELECTORS.CREAR_PLANILLA.PASO1;

    // Verificar si los campos ya están pre-llenados para independiente
    const tipoAportanteValue = await this.getSelectValue(selectors.TIPO_APORTANTE);
    logger.info(`Current tipoAportante: ${tipoAportanteValue}`);

    // Solo cambiar si es necesario
    if (data.aportante && data.aportante.tipoAportante) {
      await this.selectOption(selectors.TIPO_APORTANTE, data.aportante.tipoAportante);
    }

    // Seleccionar periodo
    await this.selectOption(selectors.PERIODO_MES, data.periodo.mes.toString());
    await this.wait(500);
    await this.selectOption(selectors.PERIODO_ANIO, data.periodo.anio.toString());
    await this.wait(500);

    // Click siguiente
    await this.clickButton(selectors.BTN_SIGUIENTE);
    await this.wait(3000);

    // Verificar que avanzamos a Paso 2
    const isStep2 = await this.page.evaluate(() => {
      return document.body.innerText.includes('Paso 2') ||
             document.body.innerText.includes('Agregar cotizante') ||
             document.body.innerText.includes('Información Detallada');
    });

    if (!isStep2) {
      // Buscar mensaje de error
      const errorMsg = await this.getErrorMessage();
      if (errorMsg) {
        throw new Error(`Error en Paso 1: ${errorMsg}`);
      }
      throw new Error('No se pudo avanzar al Paso 2');
    }

    logger.info('Paso 1 completed successfully');
  }

  // ============================================================================
  // PASO 2-5: Agregar Cotizante (Popup)
  // ============================================================================

  private async agregarCotizante(cotizante: SOICotizante): Promise<void> {
    logger.info('Opening cotizante popup', {
      documento: cotizante.identificacion.numeroDocumento,
    });

    // Capturar popup cuando se abra
    const popupPromise = this.esperarPopup();

    // Click en "Agregar cotizante"
    await this.page.evaluate(() => {
      // Primero intentar con la función global
      if (typeof (window as any).agregarCotizante === 'function') {
        (window as any).agregarCotizante();
        return;
      }
      // Si no, buscar el link
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l =>
        l.textContent?.toLowerCase().includes('agregar cotizante') ||
        l.getAttribute('onclick')?.includes('agregarCotizante')
      );
      if (link) link.click();
    });

    // Esperar popup
    const popup = await popupPromise;
    if (!popup) {
      throw new Error('No se pudo abrir el popup de agregar cotizante');
    }

    logger.info('Popup opened successfully');

    try {
      // Llenar los 5 pasos del popup
      await this.llenarPopupCotizante(popup, cotizante);
      logger.info('Cotizante added successfully');
    } finally {
      // El popup se cierra solo después de guardar
      // Esperar a que se cierre
      await this.wait(2000);
    }
  }

  private async esperarPopup(timeout: number = 15000): Promise<Page | null> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        logger.warn('Popup timeout - trying to find existing popup');
        // Intentar buscar popup existente
        this.browser.pages().then(pages => {
          const popup = pages.find(p =>
            p.url().includes('ingresarCotizante') ||
            p.url().includes('informacionBasica')
          );
          resolve(popup || null);
        });
      }, timeout);

      const handleTarget = async (target: any) => {
        if (target.type() === 'page') {
          clearTimeout(timeoutId);
          this.browser.off('targetcreated', handleTarget);
          const newPage = await target.page();
          // Dar tiempo para que cargue
          await newPage.waitForTimeout(2000);
          resolve(newPage);
        }
      };

      this.browser.on('targetcreated', handleTarget);
    });
  }

  private async llenarPopupCotizante(popup: Page, cotizante: SOICotizante): Promise<void> {
    const selectors = SOI_SELECTORS.AGREGAR_COTIZANTE;

    // ========== PASO 1: Información Básica ==========
    await this.llenarPopupPaso1(popup, cotizante, selectors.PASO1);

    // ========== PASO 2: Novedades ==========
    await this.llenarPopupPaso2(popup, cotizante, selectors.PASO2);

    // ========== PASO 3: Seguridad Social (IBC) ⭐ ==========
    await this.llenarPopupPaso3(popup, cotizante, selectors.PASO3);

    // ========== PASO 4: Parafiscales ==========
    await this.llenarPopupPaso4(popup, cotizante, selectors.PASO4);

    // ========== PASO 5: Resumen - Guardar ==========
    await this.llenarPopupPaso5(popup, selectors.PASO5);
  }

  private async llenarPopupPaso1(
    popup: Page,
    cotizante: SOICotizante,
    selectors: typeof SOI_SELECTORS.AGREGAR_COTIZANTE.PASO1
  ): Promise<void> {
    logger.info('Popup Paso 1: Información Básica');

    await popup.waitForTimeout(2000);

    // Tipo de documento
    await this.selectOptionInPage(
      popup,
      selectors.TIPO_DOCUMENTO,
      cotizante.identificacion.tipoDocumento
    );
    await popup.waitForTimeout(500);

    // Número de documento
    await popup.waitForSelector(selectors.NUMERO_DOCUMENTO, { timeout: 5000 });
    await popup.click(selectors.NUMERO_DOCUMENTO, { clickCount: 3 });
    await popup.type(selectors.NUMERO_DOCUMENTO, cotizante.identificacion.numeroDocumento, { delay: 50 });

    // Trigger BDUA lookup
    logger.info('Triggering BDUA lookup...');
    await popup.evaluate((selector: string) => {
      const input = document.querySelector(selector) as HTMLInputElement;
      if (input) {
        input.blur();
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, selectors.NUMERO_DOCUMENTO);

    // Esperar BDUA (5-7 segundos)
    await popup.waitForTimeout(6000);

    // Verificar si BDUA llenó los nombres
    const nombresLlenos = await popup.evaluate((selector: string) => {
      const input = document.querySelector(selector) as HTMLInputElement;
      return input?.value?.length > 0;
    }, selectors.PRIMER_NOMBRE);

    if (!nombresLlenos) {
      logger.warn('BDUA did not fill names, filling manually');
      // Llenar nombres manualmente si es necesario
      if (cotizante.nombres.primerNombre) {
        await this.fillInputInPage(popup, selectors.PRIMER_NOMBRE, cotizante.nombres.primerNombre);
      }
      if (cotizante.nombres.segundoNombre) {
        await this.fillInputInPage(popup, selectors.SEGUNDO_NOMBRE, cotizante.nombres.segundoNombre);
      }
      if (cotizante.nombres.primerApellido) {
        await this.fillInputInPage(popup, selectors.PRIMER_APELLIDO, cotizante.nombres.primerApellido);
      }
      if (cotizante.nombres.segundoApellido) {
        await this.fillInputInPage(popup, selectors.SEGUNDO_APELLIDO, cotizante.nombres.segundoApellido);
      }
    }

    // Seleccionar tipo de cotizante
    const tipoCotizanteActual = await this.getSelectValueInPage(popup, selectors.TIPO_COTIZANTE);
    logger.info(`Current tipoCotizante: ${tipoCotizanteActual}`);

    if (!tipoCotizanteActual || tipoCotizanteActual === '' || tipoCotizanteActual.includes('SELECCIONE')) {
      logger.info('Selecting tipoCotizante = 3 (INDEPENDIENTE)');
      await this.selectOptionInPage(
        popup,
        selectors.TIPO_COTIZANTE,
        cotizante.clasificacion.tipoCotizante || '3'
      );
      await popup.waitForTimeout(1500);
    }

    // ⚠️ IMPORTANTE: NO tocar subTipoCotizante - dejarlo en "SELECCIONE"
    // El sistema usa el valor correcto de BDUA automáticamente
    logger.info('SubTipoCotizante: leaving as SELECCIONE (important for independientes)');

    // Ubicación - IMPORTANTE: El municipio se carga dinámicamente después del departamento
    // Para Bogotá D.C., el departamento y municipio son el mismo
    const departamentoValue = cotizante.ubicacion.departamento || 'BOGOTA';
    logger.info(`Selecting departamento: ${departamentoValue}`);
    await this.selectOptionInPage(popup, selectors.DEPARTAMENTO, departamentoValue);

    // Esperar a que se carguen los municipios (solicitud AJAX) - esperar más tiempo
    await popup.waitForTimeout(3000);

    // Forzar disparo de evento change en el departamento para asegurar que los municipios carguen
    await popup.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (select) {
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, selectors.DEPARTAMENTO);

    // Esperar más para AJAX
    await popup.waitForTimeout(3000);

    // Siempre intentar seleccionar municipio
    const municipioValue = cotizante.ubicacion.municipio || 'BOGOTA';
    logger.info(`Selecting municipio: ${municipioValue}`);

    // Esperar a que el select de municipio tenga opciones (máx 8 segundos)
    await popup.waitForFunction(
      (sel: string) => {
        const select = document.querySelector(sel) as HTMLSelectElement;
        return select && select.options.length > 1;
      },
      { timeout: 8000 },
      selectors.MUNICIPIO
    ).catch(() => {
      logger.warn('Municipio select may not have loaded properly');
    });

    // Intentar seleccionar el municipio
    await this.selectOptionInPage(popup, selectors.MUNICIPIO, municipioValue);

    // Si no se seleccionó, intentar con el primer municipio disponible (que no sea SELECCIONE)
    const municipioSelected = await popup.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (!select) return { selected: false, value: '' };

      // Si ya tiene un valor que no es vacío o SELECCIONE, está bien
      if (select.value && !select.value.includes('SELECCIONE') && select.value !== '') {
        return { selected: true, value: select.value };
      }

      // Intentar seleccionar la primera opción válida
      const options = Array.from(select.options);
      const validOption = options.find(o =>
        o.value && o.value !== '' && !o.text.includes('SELECCIONE')
      );

      if (validOption) {
        select.value = validOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return { selected: true, value: validOption.value, text: validOption.text };
      }

      return { selected: false, value: '', options: options.map(o => o.text).slice(0, 5) };
    }, selectors.MUNICIPIO);

    logger.info('Municipio selection result:', municipioSelected);
    await popup.waitForTimeout(500);

    // Screenshot antes de continuar
    if (this.options.takeScreenshots) {
      await popup.screenshot({
        path: `screenshots/${this.options.screenshotPrefix}-popup-paso1.png`,
        fullPage: true,
      });
    }

    // Click siguiente
    await popup.click(selectors.BTN_SIGUIENTE);
    await popup.waitForTimeout(3000);

    // Verificar errores
    const error = await this.getErrorMessageInPage(popup);
    if (error) {
      throw new Error(`Error en Popup Paso 1: ${error}`);
    }

    logger.info('Popup Paso 1 completed');
  }

  private async llenarPopupPaso2(
    popup: Page,
    cotizante: SOICotizante,
    selectors: typeof SOI_SELECTORS.AGREGAR_COTIZANTE.PASO2
  ): Promise<void> {
    logger.info('Popup Paso 2: Novedades');

    // Verificar que estamos en paso 2
    const isPaso2 = await popup.evaluate(() => {
      return document.body.innerText.includes('Paso 2') ||
             document.body.innerText.includes('Novedades');
    });

    if (!isPaso2) {
      logger.warn('Not in Paso 2, may have skipped');
      return;
    }

    // TODO: Implementar llenado de novedades si es necesario
    // Por ahora, solo avanzamos (no hay novedades)

    if (cotizante.novedades?.ingreso) {
      // Llenar novedad de ingreso si existe
      logger.info('Filling ingreso novedad');
      // await this.fillInputInPage(popup, selectors.NOVEDAD_INGRESO, ...);
    }

    // Click siguiente
    await popup.evaluate(() => {
      const btns = document.querySelectorAll('input[type="button"]');
      for (const btn of btns) {
        if ((btn as HTMLInputElement).value?.toLowerCase().includes('siguiente')) {
          (btn as HTMLElement).click();
          return;
        }
      }
    });
    await popup.waitForTimeout(3000);

    logger.info('Popup Paso 2 completed');
  }

  private async llenarPopupPaso3(
    popup: Page,
    cotizante: SOICotizante,
    selectors: typeof SOI_SELECTORS.AGREGAR_COTIZANTE.PASO3
  ): Promise<void> {
    logger.info('Popup Paso 3: Seguridad Social (IBC) ⭐');

    // Verificar que estamos en paso 3
    const isPaso3 = await popup.evaluate(() => {
      return document.body.innerText.includes('Paso 3') ||
             document.body.innerText.includes('Seguridad Social') ||
             document.body.innerText.includes('IBC');
    });

    if (!isPaso3) {
      throw new Error('No se llegó al Paso 3 (Seguridad Social)');
    }

    const ss = cotizante.seguridadSocial;

    // ====== SALARIO BÁSICO ======
    // NOTA: El campo tiene un typo en SOI: "sarioBasico" no "salarioBasico"
    logger.info(`Filling salarioBasico: ${ss.salarioBasico}`);
    await this.fillInputInPage(popup, selectors.SALARIO_BASICO, ss.salarioBasico.toString());
    await popup.waitForTimeout(500);

    // ====== PENSIÓN ======
    logger.info('Filling pension fields');

    // Administradora de pensión
    if (ss.pension.administradora.codigo) {
      await this.selectOptionInPage(
        popup,
        selectors.ADMINISTRADORA_PENSION,
        ss.pension.administradora.codigo
      );
      await popup.waitForTimeout(500);
    }

    // Días cotizados pensión
    await this.fillInputInPage(
      popup,
      selectors.DIAS_COTIZADOS_PENSION,
      ss.pension.diasCotizados.toString()
    );
    await popup.waitForTimeout(300);

    // ⭐ IBC PENSIÓN
    logger.info(`Filling ibcPension: ${ss.pension.ibc}`);
    await this.fillInputInPage(popup, selectors.IBC_PENSION, ss.pension.ibc.toString());
    await popup.waitForTimeout(500);

    // ⭐ Tarifa pensión - OBLIGATORIA (16% por defecto para independientes)
    const tarifaPension = ss.pension.tarifa || 16;
    logger.info(`Selecting tarifaPension: ${tarifaPension}%`);
    await this.selectOptionInPage(popup, selectors.TARIFA_PENSION, `${tarifaPension}%`);
    await popup.waitForTimeout(300);

    // ====== SALUD ======
    logger.info('Filling salud fields');

    // Administradora de salud (EPS)
    if (ss.salud.administradora.codigo) {
      await this.selectOptionInPage(
        popup,
        selectors.ADMINISTRADORA_SALUD,
        ss.salud.administradora.codigo
      );
      await popup.waitForTimeout(500);
    }

    // Días cotizados salud
    await this.fillInputInPage(
      popup,
      selectors.DIAS_COTIZADOS_SALUD,
      ss.salud.diasCotizados.toString()
    );
    await popup.waitForTimeout(300);

    // ⭐ IBC SALUD
    logger.info(`Filling ibcSalud: ${ss.salud.ibc}`);
    await this.fillInputInPage(popup, selectors.IBC_SALUD, ss.salud.ibc.toString());
    await popup.waitForTimeout(500);

    // Tarifa salud - usualmente 12.5% para independientes, verificar que esté seleccionada
    const tarifaSalud = ss.salud.tarifa || 12.5;
    logger.info(`Verifying tarifaSalud: ${tarifaSalud}%`);
    // Solo seleccionar si no está ya seleccionada (12.5% es el default en SOI)
    if (tarifaSalud !== 12.5) {
      await this.selectOptionInPage(popup, selectors.TARIFA_SALUD, `${tarifaSalud}%`);
      await popup.waitForTimeout(300);
    }

    // ====== RIESGOS LABORALES (ARL) - Opcional ======
    if (ss.riesgosLaborales?.administradora?.codigo) {
      logger.info('Filling ARL fields');
      await this.selectOptionInPage(
        popup,
        selectors.ADMINISTRADORA_ARL,
        ss.riesgosLaborales.administradora.codigo
      );
      await popup.waitForTimeout(500);

      if (ss.riesgosLaborales.ibc) {
        await this.fillInputInPage(popup, selectors.IBC_ARL, ss.riesgosLaborales.ibc.toString());
      }
    }

    // Screenshot de IBC
    if (this.options.takeScreenshots) {
      await popup.screenshot({
        path: `screenshots/${this.options.screenshotPrefix}-popup-paso3-ibc.png`,
        fullPage: true,
      });
    }

    // Verificar en qué paso estamos antes de continuar
    const stepBefore = await popup.evaluate(() => {
      const body = document.body.innerText;
      const match = body.match(/Paso\s*(\d+)\s*de\s*5/i);
      return match ? parseInt(match[1]) : 0;
    });
    logger.info(`Before clicking Siguiente - current step: ${stepBefore}`);

    // ⭐ IMPORTANTE: Quitar el foco de cualquier campo antes de hacer click
    // Esto asegura que los valores se guarden correctamente
    await popup.evaluate(() => {
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement) {
        activeElement.blur();
      }
    });
    await popup.waitForTimeout(500);

    // Click siguiente - usar múltiples estrategias
    logger.info('Clicking Siguiente in Paso 3...');

    // Scroll al botón primero
    await popup.evaluate((selector: string) => {
      const btn = document.querySelector(selector) ||
                  document.querySelector('input[value="Siguiente"]');
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, selectors.BTN_SIGUIENTE);
    await popup.waitForTimeout(500);

    // Intentar click con Puppeteer directamente
    let clicked = 'none';
    try {
      // Primero intentar con el selector específico
      const btnHandle = await popup.$(selectors.BTN_SIGUIENTE);
      if (btnHandle) {
        await btnHandle.click();
        clicked = 'puppeteer-handle';
      } else {
        // Fallback a selector genérico
        const genericBtn = await popup.$('input[value="Siguiente"]');
        if (genericBtn) {
          await genericBtn.click();
          clicked = 'generic-selector';
        }
      }
    } catch (e) {
      logger.warn('Puppeteer click failed, trying evaluate');
    }

    // Si no funcionó, intentar con evaluate
    if (clicked === 'none') {
      clicked = await popup.evaluate((selector: string) => {
        const btn = document.querySelector(selector) as HTMLInputElement;
        if (btn) {
          // Simular evento de click más completo
          btn.focus();
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          return 'evaluate-dispatch';
        }
        // Fallback: buscar por value
        const btns = document.querySelectorAll('input[type="button"], input[type="submit"]');
        for (const b of btns) {
          const val = (b as HTMLInputElement).value?.toLowerCase() || '';
          if (val.includes('siguiente')) {
            (b as HTMLElement).focus();
            b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return 'evaluate-value-search';
          }
        }
        return 'none';
      }, selectors.BTN_SIGUIENTE);
    }

    logger.info(`Clicked via: ${clicked}`);

    // Esperar más tiempo para la navegación
    await popup.waitForTimeout(4000);

    // Verificar si avanzamos
    const stepAfter = await popup.evaluate(() => {
      const body = document.body.innerText;
      const match = body.match(/Paso\s*(\d+)\s*de\s*5/i);
      return match ? parseInt(match[1]) : 0;
    });
    logger.info(`After clicking Siguiente - current step: ${stepAfter}`);

    // Verificar errores
    const error = await this.getErrorMessageInPage(popup);
    if (error) {
      throw new Error(`Error en Popup Paso 3 (IBC): ${error}`);
    }

    // Si no avanzamos, hay un problema
    if (stepAfter === stepBefore && stepBefore !== 0) {
      logger.warn(`Did not advance from step ${stepBefore}, taking debug screenshot`);
      await popup.screenshot({
        path: `screenshots/${this.options.screenshotPrefix}-popup-paso3-stuck.png`,
        fullPage: true,
      });
    }

    logger.info('Popup Paso 3 (IBC) completed');
  }

  private async llenarPopupPaso4(
    popup: Page,
    cotizante: SOICotizante,
    selectors: typeof SOI_SELECTORS.AGREGAR_COTIZANTE.PASO4
  ): Promise<void> {
    logger.info('Popup Paso 4: Parafiscales');

    // Verificar que estamos en paso 4
    const isPaso4 = await popup.evaluate(() => {
      return document.body.innerText.includes('Paso 4') ||
             document.body.innerText.includes('Parafiscales');
    });

    if (!isPaso4) {
      logger.warn('Not in Paso 4, may have skipped');
    }

    await popup.waitForTimeout(1000);

    // Para independientes: la Caja de Compensación Familiar es OPCIONAL
    // Si existe el select de CCF y tiene "SELECCIONE", dejarlo así
    // Los campos de CCF se llenan automáticamente si se selecciona una caja

    // Screenshot para debug
    if (this.options.takeScreenshots) {
      await popup.screenshot({
        path: `screenshots/${this.options.screenshotPrefix}-popup-paso4-parafiscales.png`,
        fullPage: true,
      });
    }

    // Verificar si hay campos de CCF visibles y limpiarlos si es necesario
    // para independientes que NO pagan CCF
    const ccfInfo = await popup.evaluate(() => {
      // Buscar select de caja de compensación
      const ccfSelect = document.querySelector('select[name*="cajaCompensacion"], select[name*="ccf"]') as HTMLSelectElement;
      // Buscar si hay campos de días cotizados para CCF
      const diasCCF = document.querySelector('input[name*="diasCcf"], input[name*="diasCotizadosCcf"]') as HTMLInputElement;

      return {
        hasCcfSelect: !!ccfSelect,
        ccfValue: ccfSelect?.value || '',
        hasDiasCCF: !!diasCCF,
        diasCCFValue: diasCCF?.value || ''
      };
    });

    logger.info('CCF info in Paso 4:', ccfInfo);

    // Si el campo de días CCF tiene valor pero no hay caja seleccionada, limpiarlo
    // (esto evita errores de validación)
    if (ccfInfo.hasDiasCCF && ccfInfo.diasCCFValue && (!ccfInfo.ccfValue || ccfInfo.ccfValue.includes('SELECCIONE'))) {
      logger.info('Clearing CCF days field (no CCF selected)');
      await popup.evaluate(() => {
        const diasCCF = document.querySelector('input[name*="diasCcf"], input[name*="diasCotizadosCcf"]') as HTMLInputElement;
        if (diasCCF) {
          diasCCF.value = '';
          diasCCF.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    // Click siguiente
    logger.info('Clicking Siguiente in Paso 4');
    await popup.evaluate(() => {
      const btns = document.querySelectorAll('input[type="button"]');
      for (const btn of btns) {
        if ((btn as HTMLInputElement).value?.toLowerCase().includes('siguiente')) {
          (btn as HTMLElement).click();
          return;
        }
      }
    });

    await popup.waitForTimeout(3000);

    // Verificar si realmente avanzamos a Paso 5
    const currentStep = await popup.evaluate(() => {
      const body = document.body.innerText;
      if (body.includes('Paso 5') || body.includes('Resumen')) return 5;
      if (body.includes('Paso 4') || body.includes('Parafiscales')) return 4;
      return 0;
    });

    if (currentStep === 4) {
      logger.warn('Still in Paso 4, checking for errors');
      const error = await this.getErrorMessageInPage(popup);
      if (error) {
        logger.error(`Error in Paso 4: ${error}`);
        // Si el error es sobre CCF, intentar ignorarlo
        if (error.toLowerCase().includes('caja') || error.toLowerCase().includes('compensacion')) {
          logger.info('CCF error detected, trying to continue without CCF');
        } else {
          throw new Error(`Error en Popup Paso 4: ${error}`);
        }
      }
    } else {
      logger.info(`Advanced to step ${currentStep}`);
    }

    logger.info('Popup Paso 4 completed');
  }

  private async llenarPopupPaso5(
    popup: Page,
    selectors: typeof SOI_SELECTORS.AGREGAR_COTIZANTE.PASO5
  ): Promise<void> {
    logger.info('Popup Paso 5: Resumen - Guardar');

    // Verificar que estamos en paso 5
    const stepInfo = await popup.evaluate(() => {
      const body = document.body.innerText;
      const isPaso5 = body.includes('Paso 5') || body.includes('Resumen');
      // Detectar en qué paso estamos realmente
      const pasoMatch = body.match(/Paso\s*(\d+)\s*de\s*5/i);
      const currentPaso = pasoMatch ? parseInt(pasoMatch[1]) : (isPaso5 ? 5 : 0);
      return { isPaso5, currentPaso };
    });

    logger.info(`Step info: isPaso5=${stepInfo.isPaso5}, currentPaso=${stepInfo.currentPaso}`);

    if (!stepInfo.isPaso5 && stepInfo.currentPaso !== 5) {
      logger.warn(`Not in Paso 5 (currently in Paso ${stepInfo.currentPaso}), attempting to advance`);

      // Si estamos en un paso anterior, hacer click en Siguiente hasta llegar a Paso 5
      for (let i = stepInfo.currentPaso; i < 5; i++) {
        logger.info(`Attempting to advance from Paso ${i} to ${i + 1}`);
        await popup.evaluate(() => {
          const btns = document.querySelectorAll('input[type="button"]');
          for (const btn of btns) {
            if ((btn as HTMLInputElement).value?.toLowerCase().includes('siguiente')) {
              (btn as HTMLElement).click();
              return;
            }
          }
        });
        await popup.waitForTimeout(2000);
      }
    }

    // Screenshot del resumen
    if (this.options.takeScreenshots) {
      await popup.screenshot({
        path: `screenshots/${this.options.screenshotPrefix}-popup-paso5-resumen.png`,
        fullPage: true,
      });
    }

    // Verificar errores antes de guardar
    const errorBeforeSave = await this.getErrorMessageInPage(popup);
    if (errorBeforeSave) {
      logger.error(`Error before saving: ${errorBeforeSave}`);
      throw new Error(`Error en Popup Paso 5 antes de guardar: ${errorBeforeSave}`);
    }

    // Click Finalizar (en Paso 5 el botón es "Finalizar", NO "Guardar")
    logger.info('Clicking Finalizar button');
    const finalizado = await popup.evaluate(() => {
      const btns = document.querySelectorAll('input[type="button"]');
      for (const btn of btns) {
        const value = (btn as HTMLInputElement).value?.toLowerCase() || '';
        // Buscar "finalizar" primero, luego "guardar" como fallback
        if (value.includes('finalizar') || value.includes('guardar')) {
          (btn as HTMLElement).click();
          return value;
        }
      }
      // También buscar en botones normales
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('finalizar') || text.includes('guardar')) {
          btn.click();
          return text;
        }
      }
      return null;
    });

    if (finalizado) {
      logger.info(`Clicked button with value/text: "${finalizado}"`);
    } else {
      logger.warn('Could not find Finalizar/Guardar button, trying to find any submit button');
      await popup.evaluate(() => {
        const submitBtns = document.querySelectorAll('input[type="submit"]');
        if (submitBtns.length > 0) {
          (submitBtns[0] as HTMLElement).click();
        }
      });
    }

    await popup.waitForTimeout(4000);

    // Verificar si el popup se cerró o si hay error
    const isClosed = await popup.isClosed();
    if (isClosed) {
      logger.info('Popup closed successfully - cotizante saved');
    } else {
      // Verificar si hay mensaje de éxito o error
      const postSaveInfo = await popup.evaluate(() => {
        const body = document.body.innerText;
        const hasSuccess = body.includes('exitoso') || body.includes('guardado') || body.includes('correctamente');
        const hasError = body.includes('error') || body.includes('Error');
        return { hasSuccess, hasError, bodyPreview: body.substring(0, 500) };
      }).catch(() => ({ hasSuccess: false, hasError: false, bodyPreview: 'popup may be closed' }));

      logger.info('Post-save info:', postSaveInfo);

      if (postSaveInfo.hasError && !postSaveInfo.hasSuccess) {
        const error = await this.getErrorMessageInPage(popup);
        throw new Error(`Error al guardar cotizante: ${error || 'unknown error'}`);
      }
    }

    logger.info('Popup Paso 5 completed - cotizante saved');
  }

  // ============================================================================
  // PASO 3-4: Validación y Liquidación
  // ============================================================================

  private async continuarALiquidacion(): Promise<CrearPlanillaResult> {
    logger.info('Continuing to validation and liquidation');

    // Volver a la ventana principal
    await this.page.bringToFront();
    await this.wait(2000);

    // Click siguiente para ir a Paso 3 (Validación)
    await this.clickButton(SOI_SELECTORS.CREAR_PLANILLA.PASO2.BTN_SIGUIENTE);
    await this.wait(5000);

    // Verificar si hay errores de validación
    const validationError = await this.getErrorMessage();
    if (validationError) {
      throw new Error(`Error de validación: ${validationError}`);
    }

    // Click siguiente para ir a Paso 4 (Liquidación)
    await this.clickButton(SOI_SELECTORS.CREAR_PLANILLA.PASO3?.BTN_SIGUIENTE || '#siguiente2');
    await this.wait(3000);

    // Extraer resultados
    const resultado = await this.extraerResultadoLiquidacion();

    return resultado;
  }

  private async extraerResultadoLiquidacion(): Promise<CrearPlanillaResult> {
    logger.info('Extracting liquidation results');

    // Screenshot antes de extraer para debug
    if (this.options.takeScreenshots) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await this.page.screenshot({
        path: `screenshots/${this.options.screenshotPrefix}-resultado-liquidacion_${timestamp}.png`,
        fullPage: true,
      });
    }

    // Capturar URL y texto para debug
    const currentUrl = this.page.url();
    logger.info(`Current URL: ${currentUrl}`);

    // NOTA: Evitar funciones nombradas dentro de page.evaluate
    // porque esbuild inyecta __name que no existe en el navegador
    const resultado = await this.page.evaluate(() => {
      const body = document.body.innerText;

      // Buscar número de planilla
      const planillaMatch = body.match(/planilla[:\s]*(\d{10,})/i) ||
                           body.match(/n[úu]mero[:\s]*(\d{10,})/i);
      const numeroPlanilla = planillaMatch?.[1];

      // Buscar valor total
      const totalMatch = body.match(/total[:\s]*\$?\s*([\d.,]+)/i) ||
                        body.match(/valor a pagar[:\s]*\$?\s*([\d.,]+)/i);
      let valorTotal: number | undefined;
      if (totalMatch) {
        // Limpiar formato de moneda colombiana (1.234.567 -> 1234567)
        const cleanValue = totalMatch[1].replace(/\./g, '').replace(',', '.');
        valorTotal = parseFloat(cleanValue);
      }

      // Buscar valores individuales - hacer inline sin función nombrada
      const saludMatch = body.match(/salud[:\s]*\$?\s*([\d.,]+)/i);
      const pensionMatch = body.match(/pensi[óo]n[:\s]*\$?\s*([\d.,]+)/i);
      const arlMatch = body.match(/arl[:\s]*\$?\s*([\d.,]+)/i);

      // Parsear valores inline (evitar función nombrada)
      const salud = saludMatch ? parseFloat(saludMatch[1].replace(/\./g, '').replace(',', '.')) : 0;
      const pension = pensionMatch ? parseFloat(pensionMatch[1].replace(/\./g, '').replace(',', '.')) : 0;
      const arl = arlMatch ? parseFloat(arlMatch[1].replace(/\./g, '').replace(',', '.')) : undefined;

      return {
        numeroPlanilla,
        valorTotal,
        desglose: { salud, pension, arl },
      };
    });

    return {
      success: !!resultado.numeroPlanilla,
      numeroPlanilla: resultado.numeroPlanilla,
      valorTotal: resultado.valorTotal,
      desglose: resultado.desglose,
      estado: resultado.numeroPlanilla ? 'LIQUIDADA' : 'ERROR',
      error: resultado.numeroPlanilla ? undefined : 'No se pudo obtener número de planilla',
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms * (this.options.waitTimeMultiplier || 1));
  }

  private async takeScreenshot(name: string): Promise<void> {
    if (!this.options.takeScreenshots) return;

    try {
      await this.page.screenshot({
        path: `screenshots/${this.options.screenshotPrefix}-${name}.png`,
        fullPage: true,
      });
    } catch (error) {
      logger.warn(`Failed to take screenshot: ${name}`);
    }
  }

  private async clickButton(selector: string): Promise<void> {
    try {
      await this.page.waitForSelector(selector, { timeout: 5000 });
      await this.page.click(selector);
    } catch {
      // Intentar con evaluate
      await this.page.evaluate((sel) => {
        const btn = document.querySelector(sel) as HTMLElement;
        if (btn) btn.click();
      }, selector);
    }
  }

  private async selectOption(selector: string, value: string): Promise<void> {
    await this.selectOptionInPage(this.page, selector, value);
  }

  private async selectOptionInPage(page: Page, selector: string, value: string): Promise<void> {
    try {
      // Esperar a que el select exista
      await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});

      const result = await page.evaluate(
        (sel, val) => {
          const select = document.querySelector(sel) as HTMLSelectElement;
          if (!select) return { found: false, error: 'select not found', options: [] };

          const options = Array.from(select.options);
          const optionTexts = options.map(o => `${o.value}:${o.text}`).slice(0, 10);

          // Buscar de múltiples formas
          const valLower = val.toLowerCase();
          const option = options.find(
            (o) =>
              o.value === val ||
              o.value.toLowerCase() === valLower ||
              o.value.includes(val) ||
              o.value.toLowerCase().includes(valLower) ||
              o.text === val ||
              o.text.toLowerCase() === valLower ||
              o.text.includes(val) ||
              o.text.toLowerCase().includes(valLower)
          );

          if (option) {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return { found: true, selectedValue: option.value, selectedText: option.text };
          }

          return { found: false, error: 'option not found', options: optionTexts };
        },
        selector,
        value
      );

      if (!result.found) {
        logger.warn(`Could not select option: ${selector} = ${value}`, {
          error: result.error,
          availableOptions: result.options
        });
      } else {
        logger.debug(`Selected: ${result.selectedValue} (${result.selectedText})`);
      }

      await page.waitForTimeout(300);
    } catch (error) {
      logger.warn(`Could not select option: ${selector} = ${value}`, { error });
    }
  }

  private async getSelectValue(selector: string): Promise<string> {
    return this.getSelectValueInPage(this.page, selector);
  }

  private async getSelectValueInPage(page: Page, selector: string): Promise<string> {
    try {
      return await page.evaluate((sel) => {
        const select = document.querySelector(sel) as HTMLSelectElement;
        return select?.value || '';
      }, selector);
    } catch {
      return '';
    }
  }

  private async fillInputInPage(page: Page, selector: string, value: string): Promise<void> {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector, { clickCount: 3 });
      await page.type(selector, value, { delay: 30 });
      await page.waitForTimeout(200);
    } catch (error) {
      logger.warn(`Could not fill input: ${selector}`);
    }
  }

  private async getErrorMessage(): Promise<string | null> {
    return this.getErrorMessageInPage(this.page);
  }

  private async getErrorMessageInPage(page: Page): Promise<string | null> {
    try {
      return await page.evaluate(() => {
        const errorSelectors = [
          '.mensajeError',
          '.error',
          '.alert-danger',
          '[class*="Error"]',
          '.mensaje-error',
        ];

        for (const sel of errorSelectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent?.trim()) {
            return el.textContent.trim();
          }
        }

        return null;
      });
    } catch {
      return null;
    }
  }
}

// ============================================================================
// FUNCIÓN HELPER PARA USO EXTERNO
// ============================================================================

/**
 * Crea una planilla usando una página ya autenticada
 */
export async function crearPlanillaSOI(
  page: Page,
  data: SOIPlanillaLiquidacion,
  options?: CrearPlanillaOptions
): Promise<CrearPlanillaResult> {
  const bot = new SOICrearPlanillaBot(page, options);
  return bot.crearPlanilla(data);
}

export default SOICrearPlanillaBot;
