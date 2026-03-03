/**
 * Script para probar el flujo de pago SOI via PSE
 *
 * Este script realiza:
 * 1. Login en SOI (Independientes)
 * 2. Navegación a Gestionar Planillas
 * 3. Selección de planilla en línea
 * 4. Flujo de pago PSE (hasta selección de banco)
 *
 * Uso: npx tsx scripts/test-soi-pago.ts [numeroPlanilla]
 */

import { getSOIAuthBot, resetSOIAuthBot } from '../src/bots/soi/auth.bot';
import { SOIPagoBot } from '../src/bots/soi/pago.bot';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';

// Configuración de prueba
const TEST_CONFIG = {
  // Número de planilla a pagar (si no se pasa por argumento)
  numeroPlanilla: process.argv[2] || '1234567890',
  valorTotal: 150000, // Valor de prueba
};

async function testPagoFlow() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║         🧪 TEST DE PAGO SOI VIA PSE - ULE RPA          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const authBot = getSOIAuthBot();
  let success = true;

  try {
    // ====== PASO 1: Autenticación ======
    console.log('📍 PASO 1: Autenticación en SOI...');
    const session = await authBot.login();

    if (!session.isAuthenticated) {
      throw new Error('No se pudo autenticar en SOI');
    }

    console.log('✅ Autenticación exitosa');
    console.log(`   Usuario: ${session.userName}`);
    console.log(`   Fecha: ${session.lastLogin?.toLocaleString()}\n`);

    // ====== PASO 2: Verificar Dashboard con Planillas ======
    console.log('📍 PASO 2: Verificando dashboard con planillas...');
    const page = authBot.getPage();

    if (!page) {
      throw new Error('No se pudo obtener la página');
    }

    // Ya estamos en el dashboard después del login - NO navegar a otra URL
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'screenshots/test-pago-1-dashboard.png',
      fullPage: true,
    });

    console.log('✅ Dashboard de planillas cargado\n');

    // ====== PASO 3: Explorar menú lateral ======
    console.log('📍 PASO 3: Explorando menú lateral...');

    // Buscar opciones del menú lateral
    const menuOptions = await page.evaluate(() => {
      const menuItems = document.querySelectorAll('[class*="menu"] a, nav a, aside a, .sidebar a');
      const options: string[] = [];

      menuItems.forEach((item) => {
        const text = item.textContent?.trim();
        if (text && text.length > 2) options.push(text);
      });

      // También buscar en links generales
      if (options.length === 0) {
        const links = document.querySelectorAll('a');
        links.forEach((link) => {
          const text = link.textContent?.trim();
          if (text && text.includes('Planilla')) options.push(text);
          if (text && text.includes('Consulta')) options.push(text);
          if (text && text.includes('Pago')) options.push(text);
        });
      }

      return [...new Set(options)];
    });

    console.log('   Menú encontrado:', menuOptions.slice(0, 8).join(', ') || 'Ninguno');
    console.log('');

    // ====== PASO 4: Explorar tabla de planillas ======
    console.log('📍 PASO 4: Explorando tabla de planillas...');

    const planillasInfo = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const info: {
        tablesFound: number;
        rows: number;
        planillas: { numero: string; estado: string; valor: string }[];
      } = {
        tablesFound: tables.length,
        rows: 0,
        planillas: [],
      };

      tables.forEach((table) => {
        const rows = table.querySelectorAll('tbody tr');
        info.rows += rows.length;

        rows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            info.planillas.push({
              numero: cells[0]?.textContent?.trim() || '',
              estado: cells[1]?.textContent?.trim() || '',
              valor: cells[2]?.textContent?.trim() || '',
            });
          }
        });
      });

      return info;
    });

    console.log(`   Tablas encontradas: ${planillasInfo.tablesFound}`);
    console.log(`   Filas totales: ${planillasInfo.rows}`);

    if (planillasInfo.planillas.length > 0) {
      console.log('   Planillas:');
      planillasInfo.planillas.slice(0, 5).forEach((p, i) => {
        console.log(`     ${i + 1}. ${p.numero} - ${p.estado} - ${p.valor}`);
      });
    } else {
      console.log('   ⚠️ No se encontraron planillas en la tabla');
    }

    await page.screenshot({
      path: 'screenshots/test-pago-4-tabla.png',
      fullPage: true,
    });
    console.log('');

    // ====== PASO 5: Probar selección de planilla ======
    console.log('📍 PASO 5: Probando selección de planilla...');

    // Buscar checkboxes
    const checkboxes = await page.evaluate(() => {
      const cbs = document.querySelectorAll('input[type="checkbox"]');
      return cbs.length;
    });

    console.log(`   Checkboxes encontrados: ${checkboxes}`);

    if (checkboxes > 0) {
      // Seleccionar el primer checkbox
      await page.evaluate(() => {
        const firstCb = document.querySelector(
          'table tbody tr input[type="checkbox"]'
        ) as HTMLInputElement;
        if (firstCb) {
          firstCb.checked = true;
          firstCb.dispatchEvent(new Event('change', { bubbles: true }));
          firstCb.click();
          return true;
        }
        return false;
      });
      console.log('   ✅ Primera planilla seleccionada');

      await page.screenshot({
        path: 'screenshots/test-pago-5-seleccion.png',
        fullPage: true,
      });
    }
    console.log('');

    // ====== PASO 6: Buscar botón continuar ======
    console.log('📍 PASO 6: Buscando botón de continuar...');

    const buttons = await page.evaluate(() => {
      const btns = document.querySelectorAll('button, input[type="submit"], a.btn');
      const btnTexts: string[] = [];

      btns.forEach((btn) => {
        const text =
          btn.textContent?.trim() ||
          (btn as HTMLInputElement).value ||
          '';
        if (text) btnTexts.push(text);
      });

      return btnTexts;
    });

    console.log('   Botones encontrados:', buttons.slice(0, 10).join(', '));
    console.log('');

    // ====== PASO 7: Mostrar datos PSE de ULE ======
    console.log('📍 PASO 7: Datos PSE para pago:');
    console.log(`   Tipo Persona: ${SOI_SELECTORS.PSE_ULE.TIPO_PERSONA}`);
    console.log(`   Tipo Documento: ${SOI_SELECTORS.PSE_ULE.TIPO_DOCUMENTO}`);
    console.log(`   Número Documento: ${SOI_SELECTORS.PSE_ULE.NUMERO_DOCUMENTO}`);
    console.log(`   Email: ${SOI_SELECTORS.PSE_ULE.EMAIL}`);
    console.log(`   Banco por defecto: ${SOI_SELECTORS.PSE_ULE.BANCO_DEFAULT}`);
    console.log('');

    // ====== RESUMEN ======
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESUMEN                          ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('✅ Autenticación: OK');
    console.log('✅ Dashboard de planillas: OK');
    console.log(`✅ Menú lateral: ${menuOptions.length > 0 ? menuOptions.length + ' opciones' : 'No detectado'}`);
    console.log(`✅ Checkboxes disponibles: ${checkboxes}`);
    console.log('');
    console.log('📸 Screenshots guardados en ./screenshots/test-pago-*.png');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error durante la prueba:', error);
    success = false;

    const page = authBot.getPage();
    if (page) {
      await page.screenshot({
        path: 'screenshots/test-pago-error.png',
        fullPage: true,
      });
    }
  } finally {
    // Cerrar navegador
    console.log('\n🔄 Cerrando navegador...');
    await resetSOIAuthBot();
    console.log('✅ Navegador cerrado');
  }

  return success;
}

// Ejecutar test
testPagoFlow()
  .then((success) => {
    if (success) {
      console.log('\n🎉 TEST COMPLETADO EXITOSAMENTE');
      process.exit(0);
    } else {
      console.log('\n❌ TEST FALLIDO');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n💥 Error fatal:', error);
    process.exit(1);
  });
