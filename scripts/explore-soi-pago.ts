/**
 * Script para explorar el flujo de pago de PILA en SOI
 */

import { getSOIAuthBot, resetSOIAuthBot } from '../src/bots/soi/auth.bot';

async function explorePagoFlow() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     🔍 EXPLORAR FLUJO DE PAGO PILA EN SOI             ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const fs = await import('fs');
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots', { recursive: true });
  }

  try {
    const authBot = getSOIAuthBot();
    console.log('🔐 Autenticando en SOI...\n');

    const page = await authBot.ensureAuthenticated();

    console.log('✅ Autenticación exitosa\n');

    // 1. Ir a Gestionar Planillas
    console.log('📍 1. Navegando a "Gestionar Planillas"...');
    await page.goto('https://servicio.nuevosoi.com.co/soi/gestionarPlanilla.do', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/pago-1-gestionar-planillas.png', fullPage: true });
    console.log('   📸 Screenshot: pago-1-gestionar-planillas.png\n');

    // 2. Ir a Consultar Planillas
    console.log('📍 2. Navegando a "Consultar Planillas"...');
    await page.goto('https://servicio.nuevosoi.com.co/soi/consultarplanillas.do', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/pago-2-consultar-planillas.png', fullPage: true });
    console.log('   📸 Screenshot: pago-2-consultar-planillas.png\n');

    // 3. Buscar sección "Unificar para pago"
    console.log('📍 3. Buscando "Unificar para pago"...');
    try {
      await page.goto('https://servicio.nuevosoi.com.co/soi/unificarPago.do', {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'screenshots/pago-3-unificar-pago.png', fullPage: true });
      console.log('   📸 Screenshot: pago-3-unificar-pago.png\n');
    } catch (e) {
      console.log('   ⚠️  URL no encontrada, explorando menú...\n');
    }

    // 4. Explorar menú para encontrar opciones de pago
    console.log('📍 4. Explorando menú principal...');
    await page.goto('https://servicio.nuevosoi.com.co/soi/loginIndependientes.do', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/pago-4-menu-principal.png', fullPage: true });
    console.log('   📸 Screenshot: pago-4-menu-principal.png\n');

    // 5. Buscar links de pago en la página
    console.log('📍 5. Buscando enlaces de pago en el menú...');
    const menuLinks = await page.evaluate(() => {
      const links: string[] = [];
      document.querySelectorAll('a').forEach(a => {
        const text = a.textContent?.trim() || '';
        const href = a.href || '';
        if (text.toLowerCase().includes('pago') ||
            text.toLowerCase().includes('pagar') ||
            text.toLowerCase().includes('pse') ||
            text.toLowerCase().includes('unificar') ||
            href.toLowerCase().includes('pago') ||
            href.toLowerCase().includes('pagar')) {
          links.push(`${text} -> ${href}`);
        }
      });
      return links;
    });

    console.log('   Enlaces relacionados con pago encontrados:');
    if (menuLinks.length > 0) {
      menuLinks.forEach(link => console.log(`   - ${link}`));
    } else {
      console.log('   - Ninguno encontrado directamente');
    }
    console.log('');

    // 6. Listar todos los enlaces del menú
    console.log('📍 6. Listando todos los enlaces del menú...');
    const allMenuLinks = await page.evaluate(() => {
      const links: { text: string; href: string }[] = [];
      document.querySelectorAll('a').forEach(a => {
        const text = a.textContent?.trim() || '';
        const href = a.href || '';
        if (href && href.includes('soi') && text.length > 0 && text.length < 50) {
          links.push({ text, href });
        }
      });
      return links;
    });

    console.log('   Enlaces del menú SOI:');
    allMenuLinks.forEach(link => {
      console.log(`   - ${link.text}`);
      console.log(`     ${link.href}`);
    });
    console.log('');

    // Mantener abierto para inspección
    console.log('⏳ El navegador se cerrará en 60 segundos para inspección manual...');
    console.log('   Revisa las capturas de pantalla en ./screenshots/\n');

    await new Promise(resolve => setTimeout(resolve, 60000));

    console.log('🔄 Cerrando navegador...');
    await resetSOIAuthBot();

    console.log('\n✅ Exploración completada');

  } catch (error) {
    console.error('❌ Error:', error);
    await resetSOIAuthBot();
    process.exit(1);
  }
}

explorePagoFlow().catch(console.error);
