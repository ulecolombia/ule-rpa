/**
 * Script para inspeccionar los selectores reales de la página de login de SOI
 */

import { BrowserManager } from '../src/bots/utils/browser';

async function main() {
  console.log('Inspeccionando página de login SOI...\n');

  const browserManager = new BrowserManager({
    headless: false,
    downloadsPath: './downloads/temp',
  });

  await browserManager.launch();
  const page = await browserManager.newPage();

  try {
    // Navegar a la página de login de independientes
    const url = 'https://servicio.nuevosoi.com.co/soi/index.do?LoginIndependiente=true';
    console.log(`Navegando a: ${url}\n`);

    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await page.waitForTimeout(2000);

    // Inspeccionar elementos del formulario
    const formInfo = await page.evaluate(() => {
      const results: Record<string, any> = {
        forms: [],
        selects: [],
        inputs: [],
        buttons: [],
        labels: [],
      };

      // Formularios
      document.querySelectorAll('form').forEach((form, i) => {
        results.forms.push({
          index: i,
          id: form.id || 'sin-id',
          name: form.name || 'sin-name',
          action: form.action || 'sin-action',
        });
      });

      // Selects
      document.querySelectorAll('select').forEach((select) => {
        results.selects.push({
          id: select.id || '',
          name: select.name || '',
          className: select.className || '',
          options: Array.from(select.options).map(o => o.text).slice(0, 5),
        });
      });

      // Inputs
      document.querySelectorAll('input').forEach((input) => {
        results.inputs.push({
          id: input.id || '',
          name: input.name || '',
          type: input.type || '',
          className: input.className || '',
          placeholder: input.placeholder || '',
        });
      });

      // Buttons
      document.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach((btn) => {
        results.buttons.push({
          tagName: btn.tagName,
          id: (btn as HTMLElement).id || '',
          name: (btn as HTMLInputElement).name || '',
          type: (btn as HTMLButtonElement).type || '',
          text: (btn as HTMLElement).innerText?.trim().slice(0, 30) || '',
          className: (btn as HTMLElement).className || '',
        });
      });

      // Labels importantes
      document.querySelectorAll('label').forEach((label) => {
        const text = label.innerText?.trim();
        if (text && (text.toLowerCase().includes('documento') || text.toLowerCase().includes('clave') || text.toLowerCase().includes('usuario'))) {
          results.labels.push({
            text: text.slice(0, 50),
            for: label.htmlFor || '',
          });
        }
      });

      return results;
    });

    console.log('=== FORMULARIOS ===');
    console.log(JSON.stringify(formInfo.forms, null, 2));

    console.log('\n=== SELECTS ===');
    console.log(JSON.stringify(formInfo.selects, null, 2));

    console.log('\n=== INPUTS ===');
    console.log(JSON.stringify(formInfo.inputs, null, 2));

    console.log('\n=== BUTTONS ===');
    console.log(JSON.stringify(formInfo.buttons, null, 2));

    console.log('\n=== LABELS RELEVANTES ===');
    console.log(JSON.stringify(formInfo.labels, null, 2));

    // Tomar screenshot
    await page.screenshot({ path: 'screenshots/soi-inspect-login.png', fullPage: true });
    console.log('\nScreenshot guardado en: screenshots/soi-inspect-login.png');

    // Esperar un poco para ver
    await page.waitForTimeout(3000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browserManager.close();
  }
}

main();
