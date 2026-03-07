/**
 * Script: Test de Activación de Cuenta SOI
 *
 * Prueba el flujo completo de activación usando SOIAccountActivationService:
 * 1. Inicializa Gmail Reader
 * 2. Busca email de activación por documento
 * 3. Extrae link de activación
 * 4. Navega al link y crea contraseña
 * 5. Muestra la contraseña generada
 *
 * Uso: npx tsx scripts/test-activacion-soi.ts
 */

import 'dotenv/config';
import { SOIAccountActivationService } from '../src/services/soi-account-activation.service';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACION DEL TEST
// ═══════════════════════════════════════════════════════════════════════════

const TEST_USER = {
  documento: '1047478670',
  tipoDocumento: 'CC',
  nombreCompleto: 'Camilo Andres Maturana Mejia',
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
  log('  TEST DE ACTIVACION SOI - SOIAccountActivationService', 'bright');
  console.log('='.repeat(70));

  log(`\nUsuario de prueba:`, 'cyan');
  logInfo('Documento', TEST_USER.documento);
  logInfo('Tipo', TEST_USER.tipoDocumento);
  logInfo('Nombre', TEST_USER.nombreCompleto);

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 1: Verificar configuración de Gmail
  // ═══════════════════════════════════════════════════════════════════════════
  logStep(1, 'Verificando configuración de Gmail...');

  const hasGmailConfig = !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  );

  if (!hasGmailConfig) {
    logError('Faltan credenciales de Gmail en .env');
    logInfo('GMAIL_CLIENT_ID', process.env.GMAIL_CLIENT_ID ? '✓' : '✗');
    logInfo('GMAIL_CLIENT_SECRET', process.env.GMAIL_CLIENT_SECRET ? '✓' : '✗');
    logInfo('GMAIL_REFRESH_TOKEN', process.env.GMAIL_REFRESH_TOKEN ? '✓' : '✗');
    process.exit(1);
  }

  logSuccess('Credenciales de Gmail configuradas');

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 2: Crear instancia del servicio
  // ═══════════════════════════════════════════════════════════════════════════
  logStep(2, 'Creando instancia de SOIAccountActivationService...');

  const activationService = new SOIAccountActivationService();
  logSuccess('Servicio creado');

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 3: Verificar setup de Gmail
  // ═══════════════════════════════════════════════════════════════════════════
  logStep(3, 'Verificando setup de Gmail Reader...');

  const gmailSetup = await activationService.checkGmailSetup();
  logInfo('configured', gmailSetup.configured);
  logInfo('hasToken', gmailSetup.hasToken);

  if (!gmailSetup.configured || !gmailSetup.hasToken) {
    logError('Gmail Reader no está configurado correctamente');
    if (gmailSetup.authUrl) {
      log('\nURL de autorización:', 'yellow');
      console.log(gmailSetup.authUrl);
    }
    process.exit(1);
  }

  logSuccess('Gmail Reader configurado correctamente');

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 4: Ejecutar processActivation
  // ═══════════════════════════════════════════════════════════════════════════
  logStep(4, 'Ejecutando processActivation()...');
  log('(Esto puede tomar 1-2 minutos mientras busca el email y activa la cuenta)\n', 'dim');

  const startTime = Date.now();

  try {
    const result = await activationService.processActivation({
      documento: TEST_USER.documento,
      tipoDocumento: TEST_USER.tipoDocumento,
      nombreCompleto: TEST_USER.nombreCompleto,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '-'.repeat(50));
    log('RESULTADO DE processActivation()', 'bright');
    console.log('-'.repeat(50));

    logInfo('success', result.success);
    logInfo('message', result.message);
    logInfo('error', result.error);
    logInfo('Duración', `${duration}s`);

    if (result.email) {
      console.log('\n  Email encontrado:');
      logInfo('  messageId', result.email.messageId);
      logInfo('  subject', result.email.subject);
      logInfo('  receivedAt', result.email.receivedAt?.toLocaleString('es-CO'));
      logInfo('  activationLink', result.email.activationLink ? '(existe)' : '(no encontrado)');
    }

    if (result.activation) {
      console.log('\n  Resultado de activación:');
      logInfo('  accountActivated', result.activation.accountActivated);
      logInfo('  message', result.activation.message);
      logInfo('  error', result.activation.error);
    }

    if (result.success && result.activation?.generatedPassword) {
      console.log('\n' + '='.repeat(50));
      log('¡CUENTA ACTIVADA EXITOSAMENTE!', 'green');
      console.log('='.repeat(50));
      log(`\n  PASSWORD GENERADA: ${result.activation.generatedPassword}`, 'bright');
      log('\n  ⚠️  GUARDA ESTA CONTRASEÑA - Solo se muestra una vez', 'yellow');

      if (result.encryptedPassword) {
        logInfo('\n  Password encriptada', result.encryptedPassword.substring(0, 30) + '...');
      }
    } else {
      logError('\nLa activación no fue exitosa');
      logInfo('Error', result.error || result.message);
    }
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logError(`\nExcepción en processActivation() (después de ${duration}s)`);
    console.error(error);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUMEN FINAL
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(70));
  log('  FIN DEL TEST', 'bright');
  console.log('='.repeat(70) + '\n');
}

main().catch((error) => {
  console.error('\nError fatal:', error);
  process.exit(1);
});
