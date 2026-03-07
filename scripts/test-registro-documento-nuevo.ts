/**
 * Script: Test de Registro con Documento Nuevo
 *
 * Prueba el flujo completo de crearCuentaSOI() con un documento
 * que NO tiene cuenta en SOI.
 *
 * Este script:
 * 1. Llama directamente a crearCuentaSOI() (no pasa por la API)
 * 2. Muestra en consola cada paso del formulario
 * 3. Al final consulta la DB y muestra el estado del EnlaceUser
 *
 * IMPORTANTE: No ejecutar sin antes configurar el documento de prueba.
 *
 * Uso: npx tsx scripts/test-registro-documento-nuevo.ts
 */

import { PrismaClient } from '@prisma/client';
import { crearCuentaSOI } from '../src/bots/soi/registro.bot';
import type { SOIUserRegistration } from '../src/types/soi.types';

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACION DEL TEST - MODIFICAR AQUI
// ═══════════════════════════════════════════════════════════════════════════

const TEST_CONFIG = {
  // Documento de prueba - CAMBIAR por uno que NO tenga cuenta en SOI
  tipoDocumento: 'CC' as const,
  documento: '1047478670',

  // Datos del usuario de prueba
  nombres: 'Camilo Andres',
  apellidos: 'Maturana Mejia',

  // Ubicación (requeridos por SOI)
  departamento: 'BOLIVAR',
  municipio: 'CARTAGENA',

  // Contacto (opcional)
  celular: '3022739005',
  email: 'pagos.ule@gmail.com', // Email de ULE para recibir activación
};

// ═══════════════════════════════════════════════════════════════════════════

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step: number, message: string) {
  console.log(`\n${colors.cyan}[PASO ${step}]${colors.reset} ${message}`);
}

function logSuccess(message: string) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message: string) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logInfo(label: string, value: string | number | boolean | null | undefined) {
  console.log(`  ${colors.dim}${label}:${colors.reset} ${value ?? 'N/A'}`);
}

async function main() {
  console.log('\n' + '='.repeat(70));
  log('  TEST DE REGISTRO SOI - DOCUMENTO NUEVO', 'bright');
  console.log('='.repeat(70));

  // Validar configuración
  if (TEST_CONFIG.documento === 'CAMBIAR_DOCUMENTO_AQUI') {
    logError('ERROR: Debes configurar el documento de prueba en TEST_CONFIG');
    logInfo('Archivo', 'scripts/test-registro-documento-nuevo.ts');
    logInfo('Variable', 'TEST_CONFIG.documento');
    console.log('\nEdita el archivo y cambia "CAMBIAR_DOCUMENTO_AQUI" por un documento real.\n');
    process.exit(1);
  }

  log(`\nConfiguración del test:`, 'cyan');
  logInfo('Tipo Documento', TEST_CONFIG.tipoDocumento);
  logInfo('Documento', TEST_CONFIG.documento);
  logInfo('Nombres', TEST_CONFIG.nombres);
  logInfo('Apellidos', TEST_CONFIG.apellidos);
  logInfo('Departamento', TEST_CONFIG.departamento);
  logInfo('Municipio', TEST_CONFIG.municipio);
  logInfo('Celular', TEST_CONFIG.celular);
  logInfo('Email', TEST_CONFIG.email);

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 1: Verificar si ya existe en DB local
  // ═══════════════════════════════════════════════════════════════════════════
  logStep(1, 'Verificando si el usuario ya existe en DB local...');

  const existingUser = await prisma.enlaceUser.findFirst({
    where: { numeroDocumento: TEST_CONFIG.documento },
  });

  if (existingUser) {
    log('\n⚠️  Usuario ya existe en DB local:', 'yellow');
    logInfo('ID', existingUser.id);
    logInfo('Operador', existingUser.operador);
    logInfo('EnlaceStatus', existingUser.enlaceStatus);
    logInfo('SOI Account Status', existingUser.soiAccountStatus);
    logInfo('SOI Password', existingUser.soiPassword ? '(existe)' : '(null)');

    log('\n¿Deseas continuar? El registro en SOI podría fallar si ya tiene cuenta.', 'yellow');
    log('Presiona Ctrl+C para cancelar o espera 5 segundos para continuar...\n', 'dim');

    await new Promise((resolve) => setTimeout(resolve, 5000));
  } else {
    logSuccess('Usuario no existe en DB local - listo para crear');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 2: Preparar datos para crearCuentaSOI
  // ═══════════════════════════════════════════════════════════════════════════
  logStep(2, 'Preparando datos para crearCuentaSOI()...');

  const soiUserData: SOIUserRegistration = {
    tipoDocumento: TEST_CONFIG.tipoDocumento,
    documento: TEST_CONFIG.documento,
    nombres: TEST_CONFIG.nombres,
    apellidos: TEST_CONFIG.apellidos,
    departamento: TEST_CONFIG.departamento,
    municipio: TEST_CONFIG.municipio,
    celularUsuario: TEST_CONFIG.celular,
    emailUsuario: TEST_CONFIG.email,
  };

  logSuccess('Datos preparados:');
  console.log(JSON.stringify(soiUserData, null, 2));

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 3: Ejecutar crearCuentaSOI
  // ═══════════════════════════════════════════════════════════════════════════
  logStep(3, 'Ejecutando crearCuentaSOI()...');
  log('(Esto puede tomar 1-2 minutos mientras el bot navega el formulario)\n', 'dim');

  const startTime = Date.now();

  try {
    const result = await crearCuentaSOI(soiUserData);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '-'.repeat(50));
    log('RESULTADO DE crearCuentaSOI()', 'bright');
    console.log('-'.repeat(50));

    logInfo('success', result.success);
    logInfo('accountCreated', result.accountCreated);
    logInfo('message', result.message);
    logInfo('error', result.error);
    logInfo('generatedPassword', result.generatedPassword ? '(generada)' : '(no)');
    logInfo('Duración', `${duration}s`);

    if (result.success && result.accountCreated) {
      logSuccess('\n¡CUENTA CREADA EXITOSAMENTE EN SOI!');
      log('SOI enviará un email de activación a: ' + TEST_CONFIG.email, 'cyan');
      log('La tarea ACTIVACION debería encolarse con 90s de delay.\n', 'dim');
    } else if (result.success && !result.accountCreated) {
      log('\n⚠️  El usuario ya existe en SOI', 'yellow');
      log('Esto activaría el fallback a Mi Planilla en el worker.\n', 'dim');
    } else {
      logError('\nError al crear cuenta en SOI');
      logInfo('Error', result.error || result.message);
    }
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logError(`\nExcepción en crearCuentaSOI() (después de ${duration}s)`);
    console.error(error);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 4: Verificar estado en DB
  // ═══════════════════════════════════════════════════════════════════════════
  logStep(4, 'Verificando estado en DB local...');

  const userAfter = await prisma.enlaceUser.findFirst({
    where: { numeroDocumento: TEST_CONFIG.documento },
  });

  if (userAfter) {
    log('\nUsuario encontrado en DB:', 'green');
    logInfo('ID', userAfter.id);
    logInfo('uleUserId', userAfter.uleUserId);
    logInfo('Documento', userAfter.numeroDocumento);
    logInfo('Nombre', userAfter.nombre);
    logInfo('Operador', userAfter.operador);
    logInfo('EnlaceStatus', userAfter.enlaceStatus);
    logInfo('SOI Account Status', userAfter.soiAccountStatus);
    logInfo('SOI Password', userAfter.soiPassword ? '✓ existe' : '✗ null');
    logInfo('SOI Password IV', userAfter.soiPasswordIV ? '✓ existe' : '✗ null');
    logInfo('Mi Planilla User', userAfter.miplanillaUser);
    logInfo('Mi Planilla Password', userAfter.miplanillaPassword ? '✓ existe' : '✗ null');
    logInfo('Creado', userAfter.createdAt?.toLocaleString('es-CO'));
    logInfo('Actualizado', userAfter.updatedAt?.toLocaleString('es-CO'));
  } else {
    log('\n⚠️  Usuario NO encontrado en DB local', 'yellow');
    log('Nota: crearCuentaSOI() solo crea la cuenta en SOI.', 'dim');
    log('El worker es quien guarda el usuario en la DB local después del registro.\n', 'dim');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 5: Verificar tareas pendientes
  // ═══════════════════════════════════════════════════════════════════════════
  logStep(5, 'Verificando tareas pendientes/recientes...');

  const recentTasks = await prisma.task.findMany({
    where: {
      uleUserId: { contains: TEST_CONFIG.documento },
      createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }, // Últimos 10 min
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (recentTasks.length > 0) {
    log(`\nTareas encontradas (últimos 10 min):`, 'cyan');
    for (const task of recentTasks) {
      console.log(`  - [${task.type}] ${task.status} - ${task.createdAt.toLocaleString('es-CO')}`);
      if (task.error) {
        console.log(`    Error: ${task.error.substring(0, 50)}...`);
      }
    }
  } else {
    log('\nNo hay tareas recientes para este documento', 'dim');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUMEN FINAL
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(70));
  log('  RESUMEN DEL TEST', 'bright');
  console.log('='.repeat(70));

  log('\nPróximos pasos:', 'cyan');
  console.log('  1. Verificar que el email de activación llegó a: ' + TEST_CONFIG.email);
  console.log('  2. Verificar si se encoló la tarea ACTIVACION (con 90s delay)');
  console.log('  3. Esperar a que la tarea ACTIVACION se procese');
  console.log('  4. Verificar que el usuario quede con soiAccountStatus: ACTIVE');
  console.log('\nPara verificar el estado de la DB:');
  console.log('  npx tsx scripts/verificar-db-estado.ts\n');

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('\nError fatal:', error);
  await prisma.$disconnect();
  process.exit(1);
});
