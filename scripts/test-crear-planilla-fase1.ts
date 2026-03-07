/**
 * Test: Crear Planilla SOI - Flujo Completo hasta Bancolombia
 *
 * Prueba el flujo completo:
 * 1. Login en SOI
 * 2. Crear planilla (o usar existente)
 * 3. Iniciar pago PSE
 * 4. Completar formulario PSE
 * 5. Llegar a Bancolombia
 * 6. Seleccionar "Bancolombia Negocios"
 * 7. Ingresar usuario
 * 8. Detenerse cuando aparece campo de clave
 *
 * USO:
 *   npx tsx scripts/test-crear-planilla-fase1.ts
 *
 * REQUISITOS:
 *   - Usuario debe existir en DB con credenciales SOI
 *   - .env configurado con DATABASE_URL y ENCRYPTION_KEY
 */

import { PrismaClient } from '@prisma/client';
import { BrowserManager } from '../src/bots/utils/browser';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import {
  crearPlanillaSOI,
  PlanillaInput,
  pagarPlanillaPSE,
  completarFormularioPSE,
  PSE_CONFIG,
} from '../src/bots/soi/planilla.bot';
import { decryptPassword } from '../src/utils/crypto';

const prisma = new PrismaClient();

// ============================================================================
// CONFIGURACIÓN DE PRUEBA
// ============================================================================

const TEST_CONFIG = {
  // Cédula del usuario de prueba
  cedula: '1047478670',

  // Datos de la planilla
  // NOTA: AFP y EPS NO se pasan porque vienen prellenados del RUAF (disabled)
  ibc: 2000000,
  departamento: 'BOLIVAR',
  municipio: 'CARTAGENA',
};

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Obtiene el mes anterior en formato para SOI (ENERO, FEBRERO, etc.)
 */
function getMesAnterior(): { mesPago: string; anioPago: string } {
  const meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
  ];

  const hoy = new Date();
  let mes = hoy.getMonth() - 1; // Mes anterior (0-indexed)
  let anio = hoy.getFullYear();

  if (mes < 0) {
    mes = 11; // Diciembre
    anio -= 1;
  }

  return {
    mesPago: meses[mes],
    anioPago: anio.toString(),
  };
}

/**
 * Obtiene las credenciales SOI desencriptadas de un usuario
 */
async function getDecryptedPassword(cedula: string): Promise<string> {
  const user = await prisma.enlaceUser.findFirst({
    where: { numeroDocumento: cedula },
  });

  if (!user) {
    throw new Error(`Usuario con cédula ${cedula} no encontrado en la base de datos`);
  }

  if (!user.soiPassword || !user.soiPasswordIV) {
    throw new Error(`Usuario ${cedula} no tiene credenciales SOI configuradas`);
  }

  return decryptPassword(user.soiPassword, user.soiPasswordIV);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('TEST: Crear Planilla SOI - Fase 1');
  console.log('='.repeat(60));

  // Usar BrowserManager directamente con headless: false para ver el proceso
  const browserManager = new BrowserManager({ headless: false });

  try {
    // 1. Obtener credenciales del usuario
    console.log('\n[1] Obteniendo credenciales del usuario...');
    const password = await getDecryptedPassword(TEST_CONFIG.cedula);
    console.log(`    Cédula: ${TEST_CONFIG.cedula}`);
    console.log(`    Password: ${'*'.repeat(password.length)}`);

    // 2. Calcular mes y año de pago
    const { mesPago, anioPago } = getMesAnterior();
    console.log(`\n[2] Periodo de pago: ${mesPago} ${anioPago}`);

    // 3. Preparar input de planilla
    // NOTA: AFP y EPS vienen prellenados del RUAF automáticamente (disabled)
    const planillaInput: PlanillaInput = {
      cedula: TEST_CONFIG.cedula,
      departamento: TEST_CONFIG.departamento,
      municipio: TEST_CONFIG.municipio,
      ibc: TEST_CONFIG.ibc,
      mesPago,
      anioPago,
    };

    console.log('\n[3] Datos de la planilla:');
    console.log(`    IBC: $${planillaInput.ibc.toLocaleString('es-CO')}`);
    console.log(`    Departamento: ${planillaInput.departamento}`);
    console.log(`    Municipio: ${planillaInput.municipio}`);
    console.log('    AFP/EPS: Se obtienen automáticamente del RUAF');

    // 4. Login en SOI
    console.log('\n[4] Iniciando sesión en SOI...');
    const browser = await browserManager.launch();
    const page = await browserManager.newPage();

    // Navegar a login de independientes
    await page.goto(SOI_SELECTORS.URLS.LOGIN_INDEPENDIENTES, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Seleccionar tipo documento (value "1" = Cédula de ciudadanía)
    await page.select('select', '1');
    await page.waitForTimeout(300);

    // Ingresar número de documento
    const docInput = await page.$('input[type="text"]');
    if (docInput) {
      await docInput.click({ clickCount: 3 });
      await docInput.type(TEST_CONFIG.cedula, { delay: 30 });
    }
    await page.waitForTimeout(300);

    // Ingresar password
    const pwdInput = await page.$('input[type="password"]');
    if (pwdInput) {
      await pwdInput.click();
      await pwdInput.type(password, { delay: 30 });
    }
    await page.waitForTimeout(300);

    // Click en Ingresar
    const btnIngresar = await page.$('button');
    if (btnIngresar) await btnIngresar.click();

    await page.waitForTimeout(3000);
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    console.log(`    URL post-login: ${page.url()}`);

    // Verificar login exitoso - buscar elementos del dashboard o sessionID en URL
    const currentUrl = page.url();
    const sessionMatch = currentUrl.match(/nuevoSoiAchColombiaSessionID=([^&]+)/);

    if (!sessionMatch) {
      // Verificar si hay error de login
      const errorText = await page.evaluate(() => {
        const errorEl = document.querySelector('.alert-danger, .error, .mensaje-error');
        return errorEl?.textContent?.trim() || '';
      });

      if (errorText) {
        throw new Error(`Login falló: ${errorText}`);
      }

      throw new Error('Login falló - no se encontró sessionID en URL');
    }

    console.log(`    Session ID: ${sessionMatch[1].substring(0, 20)}...`);
    console.log('    Login exitoso');

    // 5. Crear planilla
    console.log('\n[5] Creando planilla...');
    const result = await crearPlanillaSOI(page, browser, planillaInput);

    // 6. Mostrar resultado de creación
    console.log('\n' + '='.repeat(60));
    console.log('RESULTADO CREACIÓN PLANILLA');
    console.log('='.repeat(60));

    if (result.success) {
      console.log('\n  ✅ PLANILLA CREADA/EXISTENTE');
      console.log(`  Número de Planilla: ${result.numeroPlanilla}`);
      console.log(`  Total a Pagar: $${result.totalPagar?.toLocaleString('es-CO') || 'N/A'}`);
      console.log(`  Ya existía: ${result.yaExistia ? 'Sí' : 'No'}`);
    } else {
      console.log('\n  ❌ ERROR CREANDO PLANILLA');
      console.log(`  Mensaje: ${result.error}`);
      console.log(`  Screenshot: ${result.screenshotPath}`);
      throw new Error(`No se pudo crear planilla: ${result.error}`);
    }

    console.log('\n' + '='.repeat(60));

    // 7. Continuar con PSE si la planilla existe
    if (!result.numeroPlanilla) {
      throw new Error('No se obtuvo número de planilla');
    }

    console.log('\n[6] Iniciando proceso PSE...');
    console.log(`    Planilla: ${result.numeroPlanilla}`);

    // Navegar a PSE
    const pseResult = await pagarPlanillaPSE(page, result.numeroPlanilla);

    if (!pseResult.success) {
      console.log('\n  ❌ ERROR EN PSE');
      console.log(`  Mensaje: ${pseResult.error}`);
      console.log(`  Screenshot: ${pseResult.screenshotPath}`);
      throw new Error(`Error en PSE: ${pseResult.error}`);
    }

    console.log('    ✅ En formulario PSE');
    console.log(`    Estado: ${pseResult.estado}`);
    console.log(`    URL: ${pseResult.urlActual}`);

    // 8. Completar formulario PSE y navegar a Bancolombia
    console.log('\n[7] Completando formulario PSE...');
    console.log(`    Tipo Aportante: JURIDICA`);
    console.log(`    Banco: BANCOLOMBIA`);
    console.log(`    NIT ULE: ${PSE_CONFIG.ULE.nit}`);
    console.log(`    Email: ${PSE_CONFIG.ULE.email}`);

    const formResult = await completarFormularioPSE(page, {
      tipoAportante: 'JURIDICA',
      banco: PSE_CONFIG.VALUES.bancolombia,
    });

    console.log('\n' + '='.repeat(60));
    console.log('RESULTADO FINAL');
    console.log('='.repeat(60));

    if (formResult.success) {
      console.log('\n  ✅ ÉXITO - BOT DETENIDO EN BANCOLOMBIA');
      console.log(`  Estado: ${formResult.estado}`);
      console.log(`  URL: ${formResult.urlBanco}`);
      console.log(`  Usuario Bancolombia: ${PSE_CONFIG.BANCOLOMBIA.usuario}`);
      console.log(`  Screenshot: ${formResult.screenshotPath}`);
      console.log('');
      console.log('  ⛔ EL ADMIN DEBE INGRESAR LA CLAVE MANUALMENTE');
    } else {
      console.log('\n  ❌ ERROR');
      console.log(`  Mensaje: ${formResult.error}`);
      console.log(`  Screenshot: ${formResult.screenshotPath}`);
    }

    console.log('\n' + '='.repeat(60));

    // Mantener browser abierto para que el admin pueda ingresar la clave
    console.log('\nManteniendo browser abierto 120 segundos...');
    console.log('El admin puede ingresar la clave de Bancolombia manualmente.\n');
    await new Promise(resolve => setTimeout(resolve, 120000));

  } catch (error) {
    console.error('\n ERROR FATAL:', error);
    throw error;
  } finally {
    // Cerrar browser
    console.log('\nCerrando browser...');
    await browserManager.close();
    await prisma.$disconnect();
    console.log('Finalizado.');
  }
}

// Ejecutar
main().catch(console.error);
