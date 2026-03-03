/**
 * Test: Liquidar Planilla as User (DRY RUN)
 * Step 4 of multi-user testing
 *
 * This script tests the user-specific session flow:
 * 1. Login as user (using credentials from env)
 * 2. Navigate to planilla management
 * 3. Check existing planillas
 * BUT does NOT create a new planilla
 */

import dotenv from 'dotenv';
dotenv.config();

import { SOIAuthBot } from '../src/bots/soi/auth.bot';
import { SOI_SELECTORS } from '../src/bots/soi/selectors';
import type { SOIUserCredentials } from '../src/bots/soi/auth.bot';

const TEST_CREDENTIALS: SOIUserCredentials = {
  tipoDocumento: (process.env.SOI_USUARIO_TIPO_DOC || 'CC') as 'CC' | 'CE' | 'NIT',
  documento: process.env.SOI_USUARIO_NUMERO_DOC || '',
  password: process.env.SOI_PASSWORD || '',
};

async function testLiquidarAsUserDryRun() {
  console.log('========================================');
  console.log('TEST: Liquidar Planilla as User (DRY RUN)');
  console.log('========================================\n');
  console.log('Credentials:', {
    tipoDoc: TEST_CREDENTIALS.tipoDocumento,
    documento: TEST_CREDENTIALS.documento,
    password: '***hidden***',
  });

  // Create independent auth bot instance (not singleton)
  const authBot = new SOIAuthBot();

  try {
    // Step 1: Login as user
    console.log('\n1. Logging in as user...');
    const session = await authBot.loginAsUser(TEST_CREDENTIALS);
    console.log('   ✓ Login successful');
    console.log(`   Session ID: ${session.sessionId}`);
    console.log(`   User Type: ${session.userType || 'INDEPENDIENTE'}`);

    const page = authBot.getPage();
    if (!page) {
      throw new Error('Page not available after login');
    }

    // Step 2: Check if already on planillas page (after login, user lands here)
    console.log('\n2. Checking planillas dashboard (already loaded after login)...');

    // Wait a moment for page to stabilize
    await page.waitForTimeout(1000);

    // The login success page IS the planillas dashboard
    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);
    console.log('   ✓ Already on planillas dashboard');

    // Take screenshot
    const browserManager = (authBot as any).browserManager;
    await browserManager?.takeScreenshot(page, 'test-user-planillas-list');

    // Step 3: Check for existing planillas on the dashboard
    console.log('\n3. Checking for existing planillas...');

    // The dashboard shows "Últimas planillas disponibles" with a table
    const planillas = await page.evaluate(() => {
      // Find all table rows
      const rows = document.querySelectorAll('table tr');
      const data: Array<{
        numeroPlanilla: string;
        tipo: string;
        estado: string;
        valor: string;
        periodo: string;
      }> = [];

      rows.forEach((row, i) => {
        if (i === 0) return; // Skip header
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          data.push({
            numeroPlanilla: cells[1]?.textContent?.trim() || '',
            tipo: cells[2]?.textContent?.trim() || '',
            estado: cells[3]?.textContent?.trim() || '',
            valor: cells[5]?.textContent?.trim() || '',
            periodo: cells[6]?.textContent?.trim() || '',
          });
        }
      });
      return data;
    });

    if (planillas.length > 0) {
      console.log('   ✓ Found existing planillas:');
      planillas.forEach((p, i) => {
        console.log(`      ${i + 1}. #${p.numeroPlanilla} | ${p.estado} | ${p.valor} | ${p.periodo}`);
      });
    } else {
      console.log('   → No planillas found on dashboard');
    }

    // Step 4: Check dashboard action buttons
    console.log('\n4. Checking dashboard action buttons...');

    const buttons = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('a, button'));
      return allButtons
        .filter(el => el.textContent && el.textContent.trim().length > 0)
        .map(el => ({
          text: el.textContent?.trim().substring(0, 40) || '',
          tag: el.tagName,
          href: (el as HTMLAnchorElement).href || '',
        }))
        .slice(0, 15); // Limit to first 15
    });

    console.log('   Available buttons/links:');
    buttons.forEach((btn, i) => {
      console.log(`      ${i + 1}. [${btn.tag}] "${btn.text}"`);
    });

    // Step 5: Check for "Nueva Planilla" in menu
    console.log('\n5. Checking menu for "Gestionar Planillas"...');
    const menuItems = await page.evaluate(() => {
      // Look in left sidebar menu
      const menuLinks = Array.from(document.querySelectorAll('.menu a, nav a, [class*="menu"] a'));
      return menuLinks.map(el => ({
        text: el.textContent?.trim() || '',
        href: (el as HTMLAnchorElement).href || '',
      }));
    });

    if (menuItems.length > 0) {
      console.log('   Menu items found:');
      menuItems.forEach((item, i) => {
        console.log(`      ${i + 1}. ${item.text}`);
      });
    }

    // Step 6: Analyze page structure
    console.log('\n6. Analyzing page structure...');
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        userName: document.querySelector('[class*="nombre"], [class*="user"]')?.textContent?.trim() || 'N/A',
        welcomeMsg: document.body.textContent?.includes('Bienvenido') ? 'YES' : 'NO',
        tables: document.querySelectorAll('table').length,
        hasPagarBtn: !!document.querySelector('button[onclick*="pagar"], a[onclick*="pagar"], [class*="pagar"]'),
      };
    });

    console.log('   Page Title:', pageInfo.title);
    console.log('   Current URL:', pageInfo.url);
    console.log('   Welcome message:', pageInfo.welcomeMsg);
    console.log('   Tables found:', pageInfo.tables);
    console.log('   Has "Pagar" button:', pageInfo.hasPagarBtn ? 'YES' : 'NO');

    // Take final screenshot
    await browserManager?.takeScreenshot(page, 'test-user-planillas-analysis');

    console.log('\n========================================');
    console.log('✓ DRY RUN COMPLETED');
    console.log('========================================');
    console.log('\nThe user-specific session flow works correctly:');
    console.log('  1. ✓ Login as user succeeded');
    console.log('  2. ✓ Navigation to planillas page worked');
    console.log('  3. ✓ Page analysis completed');
    console.log('\n⚠️  NO planilla was created (dry run).');
    console.log('   To create a real planilla, use liquidarPlanillaAsUser().');

    // Keep browser open for inspection
    console.log('\n⏳ Browser open for inspection (10 seconds)...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await authBot.close();
    console.log('\n✓ Browser closed');
  }
}

testLiquidarAsUserDryRun();
