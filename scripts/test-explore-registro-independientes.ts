/**
 * Script para explorar el formulario de registro de independientes en SOI
 * Paso 2: Revisar selectores
 */

import dotenv from 'dotenv';
dotenv.config();

import puppeteer from 'puppeteer';

async function exploreRegistroIndependientes() {
  console.log('========================================');
  console.log('Explorando Registro de Independientes SOI');
  console.log('========================================\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  try {
    // Navegar a la página de login de independientes
    console.log('1. Navegando a login de independientes...');
    await page.goto('https://servicio.nuevosoi.com.co/soi/index.do?LoginIndependiente=true', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await page.waitForTimeout(2000);

    // Buscar links de registro
    console.log('\n2. Buscando links de registro...\n');

    const links = await page.evaluate(() => {
      const allLinks: { text: string; href: string }[] = [];
      document.querySelectorAll('a').forEach((link) => {
        const text = link.textContent?.trim() || '';
        const href = link.href || '';
        if (
          text.toLowerCase().includes('registr') ||
          text.toLowerCase().includes('crear cuenta') ||
          text.toLowerCase().includes('nuevo') ||
          href.toLowerCase().includes('registr') ||
          href.toLowerCase().includes('crear')
        ) {
          allLinks.push({ text, href });
        }
      });
      return allLinks;
    });

    console.log('Links encontrados:', JSON.stringify(links, null, 2));

    // Buscar botones de registro
    const buttons = await page.evaluate(() => {
      const allButtons: { text: string; onclick: string }[] = [];
      document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach((btn) => {
        const text = (btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '';
        const onclick = btn.getAttribute('onclick') || '';
        if (
          text.toLowerCase().includes('registr') ||
          text.toLowerCase().includes('crear') ||
          onclick.toLowerCase().includes('registr')
        ) {
          allButtons.push({ text, onclick });
        }
      });
      return allButtons;
    });

    console.log('\nBotones encontrados:', JSON.stringify(buttons, null, 2));

    // Tomar screenshot
    await page.screenshot({ path: 'screenshots/soi-login-independientes.png', fullPage: true });
    console.log('\n📸 Screenshot guardado: screenshots/soi-login-independientes.png');

    // Intentar encontrar link de registro en la página
    console.log('\n3. Buscando texto de registro en la página...');
    const pageText = await page.evaluate(() => document.body.innerText);

    const registroLines = pageText.split('\n').filter(
      (line: string) =>
        line.toLowerCase().includes('registr') ||
        line.toLowerCase().includes('crear cuenta') ||
        line.toLowerCase().includes('no tiene cuenta')
    );

    console.log('Líneas relacionadas con registro:');
    registroLines.forEach((line: string) => console.log(`  - ${line.trim()}`));

    // Listar todos los links de la página para inspección manual
    console.log('\n4. Todos los links de la página:');
    const allPageLinks = await page.evaluate(() => {
      const links: { text: string; href: string }[] = [];
      document.querySelectorAll('a').forEach((link) => {
        links.push({
          text: link.textContent?.trim() || '(vacío)',
          href: link.href,
        });
      });
      return links;
    });

    allPageLinks.forEach((link) => {
      console.log(`  ${link.text} => ${link.href}`);
    });

    // Buscar formularios en la página
    console.log('\n5. Formularios en la página:');
    const forms = await page.evaluate(() => {
      const formData: { action: string; method: string; inputs: string[] }[] = [];
      document.querySelectorAll('form').forEach((form) => {
        const inputs: string[] = [];
        form.querySelectorAll('input, select').forEach((input) => {
          const name = input.getAttribute('name') || input.id || '';
          const type = input.getAttribute('type') || input.tagName.toLowerCase();
          if (name) {
            inputs.push(`${type}: ${name}`);
          }
        });
        formData.push({
          action: form.action || '(mismo URL)',
          method: form.method || 'get',
          inputs,
        });
      });
      return formData;
    });

    forms.forEach((form, i) => {
      console.log(`\n  Form ${i + 1}:`);
      console.log(`    Action: ${form.action}`);
      console.log(`    Method: ${form.method}`);
      console.log(`    Inputs: ${form.inputs.join(', ')}`);
    });

    // Esperar para inspección manual
    console.log('\n\n⏳ Navegador abierto para inspección manual...');
    console.log('   Busca el link/botón de "Registrarse" o "Crear cuenta"');
    console.log('   Presiona Ctrl+C para cerrar\n');

    // Mantener abierto 5 segundos
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

exploreRegistroIndependientes();
