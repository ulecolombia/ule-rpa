/**
 * Test: Flujos de registro de usuario SOI para ULE
 *
 * Este script prueba los dos flujos principales:
 *
 * USUARIO NUEVO SIN CUENTA SOI:
 * 1. Usuario llena registro en ULE
 * 2. Selecciona "No tengo cuenta SOI"
 * 3. ULE llama RPA: POST /api/soi/create-account
 * 4. RPA crea cuenta en SOI, retorna password
 * 5. ULE guarda password encriptado
 * 6. Usuario listo para pagar
 *
 * USUARIO NUEVO CON CUENTA SOI:
 * 1. Usuario llena registro en ULE
 * 2. Selecciona "Ya tengo cuenta SOI"
 * 3. Ingresa su password de SOI
 * 4. ULE llama RPA: POST /api/soi/validate-credentials
 * 5. Si válido, ULE guarda password encriptado
 * 6. Usuario listo para pagar
 */

const API_KEY = 'ule-rpa-dev-key-12345678901234567890123456789012';
const BASE_URL = 'http://localhost:3001';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  data?: any;
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  return fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
}

// ============================================
// TEST 1: Validar credenciales CORRECTAS
// ============================================
async function testValidarCredencialesCorrectas(): Promise<TestResult> {
  console.log('\n📋 TEST 1: Validar credenciales CORRECTAS');
  console.log('=' .repeat(50));

  try {
    // Usar credenciales del usuario de prueba (Usuario Simulacro)
    const response = await fetchWithAuth('/api/soi/validate-credentials', {
      method: 'POST',
      body: JSON.stringify({
        tipoDocumento: 'CC',
        documento: '1018482146',
        password: 'Camilo2835*', // Password conocida del usuario de prueba
      }),
    });

    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));

    if (result.success && result.data?.valid) {
      return {
        test: 'Validar credenciales correctas',
        passed: true,
        message: `Credenciales válidas. Usuario: ${result.data.userName}`,
        data: result.data,
      };
    } else {
      return {
        test: 'Validar credenciales correctas',
        passed: false,
        message: result.data?.message || result.error || 'Validación falló',
        data: result,
      };
    }
  } catch (error) {
    return {
      test: 'Validar credenciales correctas',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// TEST 2: Validar credenciales INCORRECTAS
// ============================================
async function testValidarCredencialesIncorrectas(): Promise<TestResult> {
  console.log('\n📋 TEST 2: Validar credenciales INCORRECTAS');
  console.log('=' .repeat(50));

  try {
    const response = await fetchWithAuth('/api/soi/validate-credentials', {
      method: 'POST',
      body: JSON.stringify({
        tipoDocumento: 'CC',
        documento: '1018482146',
        password: 'PasswordIncorrecta123', // Password incorrecta
      }),
    });

    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));

    // En este caso, esperamos que el API retorne valid: false
    if (result.success && result.data?.valid === false) {
      return {
        test: 'Validar credenciales incorrectas',
        passed: true,
        message: `API detectó credenciales inválidas correctamente: ${result.data.message}`,
        data: result.data,
      };
    } else if (!result.success) {
      return {
        test: 'Validar credenciales incorrectas',
        passed: true,
        message: `API rechazó credenciales inválidas: ${result.error}`,
        data: result,
      };
    } else {
      return {
        test: 'Validar credenciales incorrectas',
        passed: false,
        message: 'API aceptó credenciales incorrectas (debería rechazarlas)',
        data: result,
      };
    }
  } catch (error) {
    return {
      test: 'Validar credenciales incorrectas',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// TEST 3: Validar usuario que NO existe en SOI
// ============================================
async function testValidarUsuarioInexistente(): Promise<TestResult> {
  console.log('\n📋 TEST 3: Validar usuario que NO existe en SOI');
  console.log('=' .repeat(50));

  try {
    const response = await fetchWithAuth('/api/soi/validate-credentials', {
      method: 'POST',
      body: JSON.stringify({
        tipoDocumento: 'CC',
        documento: '9999999999', // Usuario que no existe
        password: 'cualquierPassword123',
      }),
    });

    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));

    // Esperamos que el API retorne valid: false para usuario inexistente
    if (result.success && result.data?.valid === false) {
      return {
        test: 'Validar usuario inexistente',
        passed: true,
        message: `API detectó usuario inexistente: ${result.data.message}`,
        data: result.data,
      };
    } else if (!result.success) {
      return {
        test: 'Validar usuario inexistente',
        passed: true,
        message: `API rechazó usuario inexistente: ${result.error}`,
        data: result,
      };
    } else {
      return {
        test: 'Validar usuario inexistente',
        passed: false,
        message: 'API aceptó usuario inexistente (debería rechazarlo)',
        data: result,
      };
    }
  } catch (error) {
    return {
      test: 'Validar usuario inexistente',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// TEST 4: Vincular cuenta existente (link-account)
// ============================================
async function testVincularCuentaExistente(): Promise<TestResult> {
  console.log('\n📋 TEST 4: Vincular cuenta SOI existente');
  console.log('=' .repeat(50));

  try {
    const response = await fetchWithAuth('/api/soi/link-account', {
      method: 'POST',
      body: JSON.stringify({
        uleUserId: 'test-user-123',
        tipoDocumento: 'CC',
        documento: '1018482146',
        password: 'Camilo2835*',
      }),
    });

    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));

    if (result.success && result.data?.linked) {
      return {
        test: 'Vincular cuenta existente',
        passed: true,
        message: `Cuenta vinculada exitosamente. Usuario: ${result.data.userName}`,
        data: {
          userName: result.data.userName,
          accountType: result.data.accountType,
          hasEncryptedPassword: !!result.data.passwordEncrypted,
          hasIV: !!result.data.passwordIV,
        },
      };
    } else {
      return {
        test: 'Vincular cuenta existente',
        passed: false,
        message: result.error || 'Vinculación falló',
        data: result,
      };
    }
  } catch (error) {
    return {
      test: 'Vincular cuenta existente',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// TEST 5: Vincular con credenciales incorrectas
// ============================================
async function testVincularCredencialesIncorrectas(): Promise<TestResult> {
  console.log('\n📋 TEST 5: Vincular con credenciales INCORRECTAS');
  console.log('=' .repeat(50));

  try {
    const response = await fetchWithAuth('/api/soi/link-account', {
      method: 'POST',
      body: JSON.stringify({
        uleUserId: 'test-user-456',
        tipoDocumento: 'CC',
        documento: '1018482146',
        password: 'PasswordIncorrecta999',
      }),
    });

    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));

    // Esperamos que rechace el intento de vincular con password incorrecta
    if (!result.success || result.data?.linked === false) {
      return {
        test: 'Vincular con credenciales incorrectas',
        passed: true,
        message: `API rechazó vinculación correctamente: ${result.error || result.message}`,
        data: result,
      };
    } else {
      return {
        test: 'Vincular con credenciales incorrectas',
        passed: false,
        message: 'API aceptó vinculación con credenciales incorrectas (debería rechazar)',
        data: result,
      };
    }
  } catch (error) {
    return {
      test: 'Vincular con credenciales incorrectas',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// TEST 6: Crear cuenta SOI (dry-run info)
// ============================================
async function testCrearCuentaSOIInfo(): Promise<TestResult> {
  console.log('\n📋 TEST 6: Crear cuenta SOI (INFO - no ejecuta)');
  console.log('=' .repeat(50));

  // Este test solo muestra qué datos se necesitan para crear cuenta
  // No ejecuta realmente porque crearía un usuario real en SOI

  const datosRequeridos = {
    tipoDocumento: 'CC',
    documento: '123456789', // Documento del nuevo usuario
    nombres: 'Nombre del Usuario',
    apellidos: 'Apellidos del Usuario',
    departamento: 'Bogotá D.C.',
    municipio: 'Bogotá D.C.',
  };

  console.log('Datos requeridos para crear cuenta SOI:');
  console.log(JSON.stringify(datosRequeridos, null, 2));

  console.log('\nEndpoint: POST /api/soi/create-account');
  console.log('\nNOTA: La contraseña se genera automáticamente por SOI');
  console.log('y se envía al email de ULE (pagos.ule@gmail.com).');
  console.log('El RPA la devuelve encriptada para guardar en la BD de ULE.');

  return {
    test: 'Crear cuenta SOI (info)',
    passed: true,
    message: 'Información mostrada (no se ejecutó creación real)',
    data: datosRequeridos,
  };
}

// ============================================
// MAIN: Ejecutar todos los tests
// ============================================
async function main() {
  console.log('🚀 PRUEBAS DE REGISTRO DE USUARIO SOI PARA ULE');
  console.log('='.repeat(60));
  console.log('\nEste script prueba los flujos de registro/vinculación de usuarios.\n');

  const results: TestResult[] = [];

  // Ejecutar tests secuencialmente (algunos dependen de browser)
  results.push(await testValidarCredencialesCorrectas());
  results.push(await testValidarCredencialesIncorrectas());
  results.push(await testValidarUsuarioInexistente());
  results.push(await testVincularCuentaExistente());
  results.push(await testVincularCredencialesIncorrectas());
  results.push(await testCrearCuentaSOIInfo());

  // Resumen
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN DE RESULTADOS');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.test}: ${result.message}`);
    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${results.length} tests | ✅ Pasaron: ${passed} | ❌ Fallaron: ${failed}`);

  if (failed > 0) {
    console.log('\n⚠️ Algunos tests fallaron. Revisar los detalles arriba.');
  } else {
    console.log('\n🎉 Todos los tests pasaron!');
  }

  // Explicación del flujo
  console.log('\n' + '='.repeat(60));
  console.log('📖 RESUMEN DE FLUJOS DE REGISTRO');
  console.log('='.repeat(60));
  console.log(`
USUARIO NUEVO SIN CUENTA SOI:
  1. Usuario llena registro en ULE
  2. Selecciona "No tengo cuenta SOI"
  3. ULE llama: POST /api/soi/create-account
  4. RPA crea cuenta en SOI, retorna password encriptada
  5. ULE guarda password encriptado en EnlaceUser
  6. Usuario listo para liquidar y pagar

USUARIO NUEVO CON CUENTA SOI:
  1. Usuario llena registro en ULE
  2. Selecciona "Ya tengo cuenta SOI"
  3. Ingresa su password de SOI
  4. ULE llama: POST /api/soi/validate-credentials
  5. Si válido:
     - ULE llama: POST /api/soi/link-account (valida y encripta)
     - ULE guarda password encriptado en EnlaceUser
  6. Usuario listo para liquidar y pagar

QUÉ PASA SI LAS CREDENCIALES SON INCORRECTAS:
  - validate-credentials retorna: { valid: false, message: "error" }
  - link-account retorna: { success: false, linked: false, error: "..." }
  - ULE debe mostrar error al usuario y NO guardar nada
  - Usuario debe corregir la contraseña e intentar de nuevo
`);
}

// Ejecutar
main().catch(console.error);
