/**
 * Test simplificado: Ver campos de Paso 3 Seguridad Social
 * Usa JavaScript evaluate para evitar problemas de contexto
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

async function testPaso3Simple() {
  console.log('========================================');
  console.log('TEST: Ver campos Paso 3 Seguridad Social');
  console.log('========================================\n');

  const authBot = new SOIAuthBot();

  try {
    // Login
    console.log('1. Logging in...');
    await authBot.loginAsUser(TEST_CREDENTIALS);
    const page = authBot.getPage();
    if (!page) throw new Error('Page not available');
    const browserManager = (authBot as any).browserManager;
    await page.waitForTimeout(1500);

    // Navigate to planilla and go to step 2
    console.log('2. Navigating to planilla form...');
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l => l.textContent?.trim().includes('Deseo liquidar una planilla'));
      if (link) link.click();
    });
    await page.waitForTimeout(3000);

    // Click Siguiente to go to Step 2
    await page.evaluate(() => {
      const btn = document.querySelector('input[value="Siguiente"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(4000);

    // Get CSRF
    const csrfToken = await page.evaluate(() => {
      const csrfInput = document.getElementById('csrfPreventionSalt') as HTMLInputElement;
      return csrfInput?.value || '';
    });

    // Navigate directly to ingresarCotizante
    console.log('3. Navigating to ingresarCotizante...');
    await page.goto(`https://servicio.nuevosoi.com.co/soi/ingresarCotizante.do?csrfPreventionSalt=${csrfToken}`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // Fill form using evaluate
    console.log('4. Filling Paso 1 using evaluate...');

    await page.evaluate((doc) => {
      // Fill documento
      const numInput = document.querySelector('input[name="numeroIdentificacionCotizante"]') as HTMLInputElement;
      if (numInput) {
        numInput.value = doc;
        numInput.dispatchEvent(new Event('input', { bubbles: true }));
        numInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Fill names
      const nombres = [
        { name: 'primerNombreCotizante', value: 'CAMILO' },
        { name: 'segundoNombreCotizante', value: 'ANDRES' },
        { name: 'primerApellidoCotizante', value: 'TORRES' },
        { name: 'segundoApellidoCotizante', value: 'SANDOVAL' }
      ];
      nombres.forEach(n => {
        const input = document.querySelector(`input[name="${n.name}"]`) as HTMLInputElement;
        if (input) {
          input.value = n.value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      // Select Tipo Cotizante (pick first available option)
      const tipoCzte = document.querySelector('select[name="tipoCotizante"]') as HTMLSelectElement;
      if (tipoCzte && tipoCzte.options.length > 1) {
        // Find "independiente" option or use index 1
        const options = Array.from(tipoCzte.options);
        const indepOpt = options.find(o => o.text.toLowerCase().includes('independiente'));
        tipoCzte.value = indepOpt ? indepOpt.value : tipoCzte.options[1].value;
        tipoCzte.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, TEST_CREDENTIALS.documento);

    await page.waitForTimeout(2000);

    // Select SubTipo
    await page.evaluate(() => {
      const subTipo = document.querySelector('select[name="subTipoCotizante"]') as HTMLSelectElement;
      if (subTipo && subTipo.options.length > 1) {
        subTipo.selectedIndex = 1;
        subTipo.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(1000);

    // Select Departamento
    await page.evaluate(() => {
      const depto = document.querySelector('select[name="departamento"]') as HTMLSelectElement;
      if (depto && depto.options.length > 1) {
        const bogOption = Array.from(depto.options).find(o => o.text.toLowerCase().includes('bogota'));
        depto.value = bogOption ? bogOption.value : depto.options[1].value;
        depto.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(1500);

    // Select Municipio
    await page.evaluate(() => {
      const muni = document.querySelector('select[name="municipio"]') as HTMLSelectElement;
      if (muni && muni.options.length > 1) {
        muni.selectedIndex = 1;
        muni.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);

    console.log('   ✓ Paso 1 filled');
    await browserManager?.takeScreenshot(page, 'test-simple-paso1-filled');

    // Click Siguiente to go to Paso 2 (Novedades)
    console.log('\n5. Going to Paso 2...');
    await page.evaluate(() => {
      const btn = document.querySelector('input[value="Siguiente"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(4000);

    console.log('   Current URL:', page.url());
    await browserManager?.takeScreenshot(page, 'test-simple-paso2-novedades');

    // Click Siguiente to go to Paso 3 (Seguridad Social)
    console.log('\n6. Going to Paso 3...');
    await page.evaluate(() => {
      const btn = document.querySelector('input[value="Siguiente"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(4000);

    console.log('   Current URL:', page.url());
    await browserManager?.takeScreenshot(page, 'test-simple-paso3-seguridad-social');

    // ANALYZE PASO 3 - This is where IBC should be!
    console.log('\n7. ===== ANALYZING PASO 3 - SEGURIDAD SOCIAL =====');

    // Get ALL form fields
    const paso3Fields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs.map(el => ({
        tag: el.tagName,
        type: (el as HTMLInputElement).type || '',
        name: (el as HTMLInputElement).name || '',
        id: el.id || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
        hidden: (el as HTMLInputElement).type === 'hidden',
        visible: (el as HTMLElement).offsetParent !== null,
      }));
    });

    console.log('\n   VISIBLE form fields (no hidden):');
    paso3Fields.filter(f => !f.hidden && f.visible).forEach((f, i) => {
      console.log(`      ${i + 1}. [${f.tag}:${f.type}] name="${f.name}" id="${f.id}"`);
    });

    // Look for IBC/salary specific fields
    const ibcFields = paso3Fields.filter(f => {
      const name = f.name.toLowerCase();
      const id = f.id.toLowerCase();
      return name.includes('ibc') || name.includes('salario') || name.includes('ingreso') ||
             name.includes('dias') || name.includes('cotizado') || name.includes('tarifa') ||
             id.includes('ibc') || id.includes('salario') || id.includes('dias');
    });

    if (ibcFields.length > 0) {
      console.log('\n   ★★★ IBC-RELATED FIELDS FOUND: ★★★');
      ibcFields.forEach((f, i) => {
        console.log(`      ${i + 1}. [${f.tag}:${f.type}] name="${f.name}" id="${f.id}"`);
      });
    }

    // Get all labels
    console.log('\n   Labels on Paso 3:');
    const labels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label, th, td'))
        .map(l => l.textContent?.trim() || '')
        .filter(t => t.length > 2 && t.length < 70)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 40);
    });
    labels.forEach((l, i) => {
      console.log(`      ${i + 1}. "${l}"`);
    });

    console.log('\n========================================');
    console.log('✓ ANALYSIS COMPLETED');
    console.log('========================================');

    console.log('\n⏳ Browser open for inspection (30 seconds)...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    const page = authBot.getPage();
    const browserManager = (authBot as any).browserManager;
    if (page && browserManager) {
      try {
        await browserManager.takeScreenshot(page, 'test-simple-error');
      } catch {}
    }
  } finally {
    await authBot.close();
  }
}

testPaso3Simple();
