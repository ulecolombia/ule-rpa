/**
 * TEST DE REGISTRO COMPLETO - SOI y Mi Planilla
 *
 * Este script prueba los flujos de registro de usuario en AMBOS operadores.
 *
 * TESTS INCLUIDOS:
 * 1. SOI - Validar credenciales existentes
 * 2. SOI - Flujo de registro (DRY RUN - navega sin crear)
 * 3. Mi Planilla - Validar credenciales existentes
 * 4. Mi Planilla - Flujo de registro (DRY RUN - navega sin crear)
 *
 * Usage:
 *   npx tsx scripts/test-registro-completo.ts              # Todos los tests
 *   npx tsx scripts/test-registro-completo.ts --soi        # Solo SOI
 *   npx tsx scripts/test-registro-completo.ts --miplanilla # Solo Mi Planilla
 */

import dotenv from 'dotenv';
dotenv.config();

import { Page } from 'puppeteer';
import { SOIAuthBot } from '../src/bots/soi';
import { MiPlanillaAuthBot } from '../src/bots/miplanilla';
import { BrowserManager } from '../src/bots/utils/browser';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import { MIPLANILLA_URLS } from '../src/types/miplanilla.types';

// Colores para output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg: string, color = RESET) {
  console.log(`${color}${msg}${RESET}`);
}

// Credenciales existentes para validación
const EXISTING_SOI_USER = {
  tipoDocumento: 'CC' as const,
  documento: process.env.SOI_USUARIO_NUMERO_DOC || '1018482146',
  password: process.env.SOI_PASSWORD || '',
};

const EXISTING_MIPLANILLA_USER = {
  tipoDocumento: 'CC' as const,
  documento: process.env.TEST_MIPLANILLA_DOCUMENTO || '',
  password: process.env.TEST_MIPLANILLA_PASSWORD || '',
};

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  log(`\n${'═'.repeat(60)}`, BLUE);
  log(`  ${name}`, BOLD);
  log(`${'═'.repeat(60)}`, BLUE);

  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, message: 'OK', duration });
    log(`\n✅ ${name} - PASSED (${duration}ms)`, GREEN);
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, message, duration });
    log(`\n❌ ${name} - FAILED: ${message}`, RED);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 1: Validar credenciales SOI existentes
// ═══════════════════════════════════════════════════════════════
async function testSOIValidateCredentials(): Promise<void> {
  log('\n📋 Validando credenciales SOI existentes...', YELLOW);
  log(`   Documento: ${EXISTING_SOI_USER.documento}`);

  if (!EXISTING_SOI_USER.password) {
    throw new Error('SOI_PASSWORD no configurado en .env');
  }

  const authBot = new SOIAuthBot();

  try {
    const result = await authBot.validateCredentials(EXISTING_SOI_USER);

    if (!result.valid) {
      throw new Error(`Validación fallida: ${result.error}`);
    }

    log(`   ✓ Usuario: ${result.userName}`, GREEN);
    log(`   ✓ Tipo: ${result.accountType}`, GREEN);
  } finally {
    await authBot.close();
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 2: Validar credenciales Mi Planilla existentes
// ═══════════════════════════════════════════════════════════════
async function testMiPlanillaValidateCredentials(): Promise<void> {
  log('\n📋 Validando credenciales Mi Planilla existentes...', YELLOW);
  log(`   Usuario: CC${EXISTING_MIPLANILLA_USER.documento}`);

  const authBot = new MiPlanillaAuthBot();

  try {
    const result = await authBot.login(EXISTING_MIPLANILLA_USER);

    if (!result.isAuthenticated) {
      throw new Error('Login fallido');
    }

    log(`   ✓ Autenticado: ${result.isAuthenticated}`, GREEN);
    log(`   ✓ Usuario: ${result.userName || 'OK'}`, GREEN);

    // No hay método logout en MiPlanillaAuthBot, simplemente cerramos
  } finally {
    await authBot.close();
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 3: Flujo registro SOI (DRY RUN - solo navegación)
// ═══════════════════════════════════════════════════════════════
async function testSOIRegistroDryRun(): Promise<void> {
  log('\n📋 Probando flujo de registro SOI (DRY RUN)...', YELLOW);
  log(`   ⚠️  Este test navega al formulario pero NO crea usuario`, YELLOW);

  const browserManager = new BrowserManager({
    headless: false,
    downloadsPath: './downloads/test-soi-registro',
  });

  try {
    await browserManager.launch();
    const page = await browserManager.newPage();

    // Navegar a la página de registro de independientes
    log('   → Navegando a página de registro SOI...', YELLOW);
    await page.goto(SOI_SELECTORS.URLS.REGISTRO_INDEPENDIENTES, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await browserManager.takeScreenshot(page, 'test-soi-registro-page');
    log(`   ✓ Página de registro cargada`, GREEN);
    log(`   ✓ URL: ${page.url()}`, GREEN);

    // Verificar que el formulario de registro existe
    const formExists = await page.evaluate(() => {
      // Buscar elementos del formulario de registro
      const tipoDocSelect = document.querySelector('select[name*="tipo"], select[id*="tipo"]');
      const docInput = document.querySelector('input[name*="documento"], input[id*="documento"]');
      const nombreInput = document.querySelector('input[name*="nombre"], input[id*="nombre"]');

      return !!(tipoDocSelect || docInput || nombreInput);
    });

    if (formExists) {
      log(`   ✓ Formulario de registro detectado`, GREEN);
    } else {
      // Intentar detectar si es otra página
      const pageContent = await page.evaluate(() => {
        return {
          title: document.title,
          hasInputs: document.querySelectorAll('input').length,
          hasSelects: document.querySelectorAll('select').length,
          bodyText: document.body.innerText.substring(0, 500),
        };
      });
      log(`   ⚠️  Formulario no detectado automáticamente`, YELLOW);
      log(`   → Título: ${pageContent.title}`, YELLOW);
      log(`   → Inputs: ${pageContent.hasInputs}, Selects: ${pageContent.hasSelects}`, YELLOW);
    }

    // Esperar para inspección visual
    log(`   → Esperando 3s para inspección visual...`, YELLOW);
    await page.waitForTimeout(3000);

    await browserManager.takeScreenshot(page, 'test-soi-registro-final');
    log(`   ✓ DRY RUN completado`, GREEN);

  } finally {
    await browserManager.close();
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 4: Flujo registro Mi Planilla (DRY RUN - solo navegación)
// ═══════════════════════════════════════════════════════════════
async function testMiPlanillaRegistroDryRun(): Promise<void> {
  log('\n📋 Probando flujo de registro Mi Planilla (DRY RUN)...', YELLOW);
  log(`   ⚠️  Este test navega al formulario pero NO crea usuario`, YELLOW);

  const browserManager = new BrowserManager({
    headless: false,
    downloadsPath: './downloads/test-miplanilla-registro',
  });

  try {
    await browserManager.launch();
    const page = await browserManager.newPage();

    // Paso 1: Ir a la landing de Mi Planilla
    log('   → Navegando a landing de Mi Planilla...', YELLOW);
    await page.goto(MIPLANILLA_URLS.landing, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(2000);

    await browserManager.takeScreenshot(page, 'test-miplanilla-01-landing');
    log(`   ✓ Landing cargado`, GREEN);

    // Paso 2: Click en "Independiente"
    log('   → Buscando botón "Independiente"...', YELLOW);
    const clicked = await clickByText(page, 'Independiente');

    if (clicked) {
      log(`   ✓ Click en "Independiente"`, GREEN);
      await page.waitForTimeout(2000);
    } else {
      log(`   ⚠️  Botón "Independiente" no encontrado, navegando directo...`, YELLOW);
      await page.goto('https://www.miplanilla.com/independiente', {
        waitUntil: 'domcontentloaded',
      });
    }

    await browserManager.takeScreenshot(page, 'test-miplanilla-02-independiente');

    // Paso 3: Buscar "Registrarme" o similar
    log('   → Buscando opción de registro...', YELLOW);

    const registroClicked = await clickByText(page, 'Registrarme') ||
                            await clickByText(page, 'Crear cuenta') ||
                            await clickByText(page, 'Registro');

    if (registroClicked) {
      log(`   ✓ Click en registro`, GREEN);
      await page.waitForTimeout(2000);
    }

    await browserManager.takeScreenshot(page, 'test-miplanilla-03-registro');

    // Verificar que llegamos a un formulario de registro
    const formInfo = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        hasForm: !!document.querySelector('form'),
        inputs: document.querySelectorAll('input').length,
      };
    });

    log(`   → URL actual: ${formInfo.url}`, GREEN);
    log(`   → Formulario presente: ${formInfo.hasForm ? 'SÍ' : 'NO'}`, formInfo.hasForm ? GREEN : YELLOW);
    log(`   → Número de inputs: ${formInfo.inputs}`, GREEN);

    // Esperar para inspección visual
    log(`   → Esperando 3s para inspección visual...`, YELLOW);
    await page.waitForTimeout(3000);

    await browserManager.takeScreenshot(page, 'test-miplanilla-04-final');
    log(`   ✓ DRY RUN completado`, GREEN);

  } finally {
    await browserManager.close();
  }
}

// Helper para hacer click por texto
async function clickByText(page: Page, text: string): Promise<boolean> {
  try {
    const clicked = await page.evaluate((searchText) => {
      const elements = document.querySelectorAll('a, button, [role="button"], span, div');
      for (const el of elements) {
        if (el.textContent?.toLowerCase().includes(searchText.toLowerCase())) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, text);
    return clicked;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);
  const soiOnly = args.includes('--soi');
  const miplanillaOnly = args.includes('--miplanilla');

  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗', BLUE);
  log('║       TEST DE REGISTRO COMPLETO - SOI & Mi Planilla        ║', BLUE);
  log('╚════════════════════════════════════════════════════════════╝', BLUE);

  log('\n📋 MODO DRY RUN: Los tests navegan pero NO crean usuarios reales', YELLOW);

  const startTime = Date.now();

  // Ejecutar tests según argumentos
  if (!miplanillaOnly) {
    await runTest('SOI - Validar credenciales existentes', testSOIValidateCredentials);
    await runTest('SOI - Registro (DRY RUN)', testSOIRegistroDryRun);
  }

  if (!soiOnly) {
    await runTest('Mi Planilla - Validar credenciales existentes', testMiPlanillaValidateCredentials);
    await runTest('Mi Planilla - Registro (DRY RUN)', testMiPlanillaRegistroDryRun);
  }

  // Resumen
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n');
  log('═══════════════════════════════════════════════════════════════', BLUE);
  log('                         RESUMEN', BOLD);
  log('═══════════════════════════════════════════════════════════════', BLUE);

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    const color = r.passed ? GREEN : RED;
    log(`  ${icon} ${r.name} (${r.duration}ms)`, color);
    if (!r.passed) {
      log(`     └─ ${r.message}`, RED);
    }
  }

  console.log('');
  log(`  Total: ${passed} passed, ${failed} failed`, passed === results.length ? GREEN : RED);
  log(`  Tiempo: ${totalTime}s`, BLUE);
  console.log('');

  if (failed > 0) {
    log('❌ ALGUNOS TESTS FALLARON', RED);
    process.exit(1);
  } else {
    log('✅ TODOS LOS TESTS PASARON', GREEN);
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
