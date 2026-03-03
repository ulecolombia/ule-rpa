/**
 * Test: Crear Nueva Planilla (DRY RUN)
 *
 * Explora el flujo de crear una nueva planilla:
 * 1. Login como usuario
 * 2. Navegar a "Gestionar Planillas" → "En línea"
 * 3. Analizar formulario de nueva planilla
 *
 * NO crea ninguna planilla real
 */

import dotenv from 'dotenv';
dotenv.config();

import { SOIAuthBot } from '../src/bots/soi/auth.bot';
import type { SOIUserCredentials } from '../src/bots/soi/auth.bot';

const TEST_CREDENTIALS: SOIUserCredentials = {
  tipoDocumento: (process.env.SOI_USUARIO_TIPO_DOC || 'CC') as 'CC' | 'CE' | 'NIT',
  documento: process.env.SOI_USUARIO_NUMERO_DOC || '',
  password: process.env.SOI_PASSWORD || '',
};

async function testCrearPlanillaDryRun() {
  console.log('========================================');
  console.log('TEST: Crear Nueva Planilla (DRY RUN)');
  console.log('========================================\n');

  const authBot = new SOIAuthBot();

  try {
    // Step 1: Login
    console.log('1. Logging in as user...');
    await authBot.loginAsUser(TEST_CREDENTIALS);
    console.log('   ✓ Login successful');

    const page = authBot.getPage();
    if (!page) throw new Error('Page not available');

    const browserManager = (authBot as any).browserManager;

    // Step 2: Try to click "+ planillas para pago" button (for creating new planilla)
    console.log('\n2. Looking for "crear nueva planilla" options...');

    // Wait for page to stabilize
    await page.waitForTimeout(1500);

    // First, let's see what's on the page
    const pageButtons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      return btns
        .filter(b => b.textContent?.trim())
        .map(b => ({
          text: b.textContent?.trim().substring(0, 50) || '',
          tag: b.tagName,
          classes: (b as HTMLElement).className || '',
        }))
        .filter(b =>
          b.text.includes('planilla') ||
          b.text.includes('Planilla') ||
          b.text.includes('nueva') ||
          b.text.includes('Nueva') ||
          b.text.includes('+')
        );
    });

    console.log('   Planilla-related buttons:');
    pageButtons.forEach((btn, i) => {
      console.log(`      ${i + 1}. [${btn.tag}] "${btn.text}"`);
    });

    await browserManager?.takeScreenshot(page, 'test-crear-planilla-before-menu');

    // Click on "Deseo liquidar una planilla" link
    console.log('\n3. Clicking "Deseo liquidar una planilla"...');

    const liquidarLinkClicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l => l.textContent?.trim().includes('Deseo liquidar una planilla'));
      if (link) {
        link.click();
        return { clicked: true, href: link.href || '' };
      }
      return { clicked: false, href: '' };
    });

    console.log(`   Result: ${JSON.stringify(liquidarLinkClicked)}`);

    if (liquidarLinkClicked.clicked) {
      console.log('   ✓ Clicked "Deseo liquidar una planilla"');
      await page.waitForTimeout(3000);  // Wait for navigation/form to load
    }

    await browserManager?.takeScreenshot(page, 'test-crear-planilla-form-loaded');

    // Check new page/form
    console.log('\n4. Analyzing new planilla form...');
    const newUrl = page.url();
    console.log(`   New URL: ${newUrl}`);

    // Step 3: Look for "En línea" or "Nueva planilla" option
    console.log('\n3. Looking for "En línea" or new planilla option...');

    // List all submenu items
    const submenuItems = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('a, span, li'));
      return items
        .filter(el => {
          const text = el.textContent?.trim() || '';
          return text.includes('línea') ||
                 text.includes('nueva') ||
                 text.includes('Nueva') ||
                 text.includes('Pendiente') ||
                 text.includes('Proyectar') ||
                 text.includes('Activos');
        })
        .map(el => ({
          text: el.textContent?.trim().substring(0, 50) || '',
          tag: el.tagName,
          classList: Array.from(el.classList).join(' '),
        }))
        .slice(0, 10);
    });

    console.log('   Submenu items found:');
    submenuItems.forEach((item, i) => {
      console.log(`      ${i + 1}. [${item.tag}] "${item.text}"`);
    });

    // Click on "En línea"
    const enLineaClicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      for (const link of links) {
        if (link.textContent?.trim().includes('En línea')) {
          link.click();
          return true;
        }
      }
      return false;
    });

    if (enLineaClicked) {
      console.log('   ✓ Clicked "En línea"');
      await page.waitForTimeout(2000);
    } else {
      console.log('   → "En línea" not found, page may already show form');
    }

    await browserManager?.takeScreenshot(page, 'test-crear-planilla-form');

    // Step 4: Analyze the form
    console.log('\n4. Analyzing planilla form...');

    const formAnalysis = await page.evaluate(() => {
      // Find all form inputs
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      const formFields = inputs.map(el => ({
        tag: el.tagName,
        type: (el as HTMLInputElement).type || '',
        name: (el as HTMLInputElement).name || '',
        id: el.id || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
        options: el.tagName === 'SELECT'
          ? Array.from((el as HTMLSelectElement).options).map(o => o.text).slice(0, 5)
          : [],
      }));

      // Find labels
      const labels = Array.from(document.querySelectorAll('label'))
        .map(l => ({
          text: l.textContent?.trim() || '',
          for: l.htmlFor || '',
        }))
        .filter(l => l.text.length > 0)
        .slice(0, 15);

      // Check for specific fields we expect
      const expectedFields = {
        tipoCotizante: !!document.querySelector('[name*="tipoCotizante"], [id*="tipoCotizante"]'),
        ibc: !!document.querySelector('[name*="ibc"], [name*="IBC"], [id*="ibc"]'),
        periodo: !!document.querySelector('[name*="periodo"], [name*="mes"], [id*="periodo"]'),
        diasSalud: !!document.querySelector('[name*="diasSalud"], [name*="dias"], [id*="diasSalud"]'),
      };

      return { formFields, labels, expectedFields };
    });

    console.log('\n   Form fields found:');
    formAnalysis.formFields.slice(0, 15).forEach((field, i) => {
      const info = field.name || field.id || field.placeholder || 'unnamed';
      console.log(`      ${i + 1}. [${field.tag}:${field.type}] ${info}`);
      if (field.options.length > 0) {
        console.log(`         Options: ${field.options.join(', ')}`);
      }
    });

    console.log('\n   Labels found:');
    formAnalysis.labels.forEach((label, i) => {
      console.log(`      ${i + 1}. "${label.text}" → for="${label.for}"`);
    });

    console.log('\n   Expected fields check:');
    console.log(`      - Tipo Cotizante: ${formAnalysis.expectedFields.tipoCotizante ? '✓' : '✗'}`);
    console.log(`      - IBC: ${formAnalysis.expectedFields.ibc ? '✓' : '✗'}`);
    console.log(`      - Periodo: ${formAnalysis.expectedFields.periodo ? '✓' : '✗'}`);
    console.log(`      - Días Salud: ${formAnalysis.expectedFields.diasSalud ? '✓' : '✗'}`);

    // Step 5: Check current page URL and title
    console.log('\n5. Page info:');
    const pageInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
    }));
    console.log(`   URL: ${pageInfo.url}`);
    console.log(`   Title: ${pageInfo.title}`);

    // Step 6: Look for submit/liquidar button
    console.log('\n6. Looking for submit/liquidar button...');
    const buttons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn'));
      return btns
        .filter(b => b.textContent?.trim() || (b as HTMLInputElement).value)
        .map(b => ({
          text: b.textContent?.trim() || (b as HTMLInputElement).value || '',
          tag: b.tagName,
          id: b.id || '',
        }))
        .filter(b =>
          b.text.toLowerCase().includes('liquidar') ||
          b.text.toLowerCase().includes('guardar') ||
          b.text.toLowerCase().includes('calcular') ||
          b.text.toLowerCase().includes('crear') ||
          b.text.toLowerCase().includes('continuar')
        );
    });

    if (buttons.length > 0) {
      console.log('   Submit buttons found:');
      buttons.forEach((btn, i) => {
        console.log(`      ${i + 1}. [${btn.tag}] "${btn.text}" (id: ${btn.id || 'none'})`);
      });
    } else {
      console.log('   No submit buttons found yet');
    }

    await browserManager?.takeScreenshot(page, 'test-crear-planilla-analysis');

    console.log('\n========================================');
    console.log('✓ DRY RUN COMPLETED');
    console.log('========================================');
    console.log('\n⚠️  NO planilla was created (dry run).');

    // Keep browser open for inspection
    console.log('\n⏳ Browser open for inspection (15 seconds)...');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await authBot.close();
    console.log('\n✓ Browser closed');
  }
}

testCrearPlanillaDryRun();
