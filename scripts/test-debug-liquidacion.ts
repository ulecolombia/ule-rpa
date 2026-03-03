/**
 * Script de depuración para encontrar el error __name is not defined
 */

import { SOIAuthBot, SOIUserCredentials } from '../src/bots/soi/auth.bot';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';

async function main() {
  console.log('🔍 Depurando error __name is not defined...\n');

  const authBot = new SOIAuthBot();

  try {
    // Login como el usuario
    const credentials: SOIUserCredentials = {
      tipoDocumento: 'CC',
      documento: '1018482146',
      password: 'Ulecolombia123*',
    };

    console.log('1️⃣ Intentando login...');
    await authBot.loginAsUser(credentials);
    console.log('✅ Login exitoso');

    const page = authBot.getPage();
    if (!page) {
      throw new Error('No se pudo obtener la página');
    }

    console.log('\n2️⃣ Navegando a Gestionar Planillas...');
    try {
      await page.goto(SOI_SELECTORS.URLS.GESTIONAR_PLANILLAS, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
      console.log('✅ Navegación exitosa');
      console.log('   URL actual:', page.url());
    } catch (navError) {
      console.log('❌ Error en navegación:', navError);
    }

    // Esperar un poco
    await page.waitForTimeout(2000);

    // Screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({
      path: `screenshots/debug-gestionar-planillas_${timestamp}.png`,
      fullPage: true,
    });
    console.log('📸 Screenshot guardado');

    console.log('\n3️⃣ Probando page.evaluate básico...');
    try {
      const bodyText = await page.evaluate(() => {
        return document.body.innerText.substring(0, 200);
      });
      console.log('✅ page.evaluate básico funciona');
      console.log('   Preview:', bodyText.substring(0, 100) + '...');
    } catch (evalError) {
      console.log('❌ Error en page.evaluate básico:', evalError);
    }

    console.log('\n4️⃣ Probando page.evaluate con código inline...');
    try {
      // La solución es NO usar funciones nombradas dentro de evaluate
      // En su lugar, hacer el trabajo directamente o usando IIFEs
      const result = await page.evaluate(() => {
        // Hacer el trabajo inline sin nombrar funciones
        const el = document.querySelector('body');
        let value: number | undefined;
        if (el) {
          const text = el.textContent?.replace(/[^0-9]/g, '') || '0';
          value = parseInt(text, 10) || undefined;
        }
        return { test: value };
      });
      console.log('✅ page.evaluate con código inline funciona');
      console.log('   Resultado:', result);
    } catch (evalError) {
      console.log('❌ Error en page.evaluate con código inline:', evalError);
    }

    console.log('\n5️⃣ Probando page.evaluate con Array.from...');
    try {
      const options = await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        return Array.from(selects).map((s) => s.name || s.id);
      });
      console.log('✅ page.evaluate con Array.from funciona');
      console.log('   Selects encontrados:', options.slice(0, 5));
    } catch (evalError) {
      console.log('❌ Error en page.evaluate con Array.from:', evalError);
    }

    console.log('\n✅ Depuración completada sin errores críticos');
  } catch (error) {
    console.error('\n❌ Error general:', error);
  } finally {
    console.log('\n🔚 Cerrando navegador...');
    await authBot.close();
    console.log('✅ Navegador cerrado');
  }
}

main();
