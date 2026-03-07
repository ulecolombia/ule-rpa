/**
 * Script rápido para verificar planillas actuales en SOI
 */
import { getSOIAuthBot } from '../src/bots/soi/auth.bot';
import dotenv from 'dotenv';

dotenv.config();

async function verificar() {
  console.log('Verificando planillas en SOI para CC 1018482146...\n');
  
  const authBot = getSOIAuthBot();
  
  try {
    const result = await authBot.loginAsUser({
      tipoDocumento: 'CC',
      documento: '1018482146', 
      password: process.env.SOI_PASSWORD || 'Ulecolombia123*',
    });
    
    if (!result.isAuthenticated) {
      console.log('❌ Login falló');
      return;
    }
    
    console.log(`✅ Login OK: ${result.userName}\n`);
    
    const page = authBot.getPage();
    if (!page) return;
    
    await page.waitForTimeout(2000);
    
    // Extraer info de planillas
    const info = await page.evaluate(() => {
      const tabla = document.querySelector('table');
      const filas = tabla?.querySelectorAll('tr') || [];
      const planillas: any[] = [];
      
      filas.forEach((fila, i) => {
        if (i === 0) return; // Skip header
        const celdas = fila.querySelectorAll('td');
        if (celdas.length >= 5) {
          planillas.push({
            numero: celdas[1]?.textContent?.trim(),
            tipo: celdas[2]?.textContent?.trim(),
            estado: celdas[3]?.textContent?.trim(),
            valor: celdas[5]?.textContent?.trim(),
            periodo: celdas[6]?.textContent?.trim(),
          });
        }
      });
      
      const bodyText = document.body.innerText;
      const sinPlanillas = bodyText.includes('no tienes planillas') || 
                          bodyText.includes('No hay planillas');
      
      return { planillas, sinPlanillas, textoVisible: bodyText.slice(0, 1000) };
    });
    
    if (info.sinPlanillas || info.planillas.length === 0) {
      console.log('📭 No hay planillas pendientes en esta cuenta');
    } else {
      console.log('📋 Planillas encontradas:');
      info.planillas.forEach(p => {
        console.log(`   - #${p.numero} | ${p.estado} | ${p.valor} | ${p.periodo}`);
      });
    }
    
    // Screenshot
    await page.screenshot({ 
      path: './screenshots/verificacion-planillas-soi.png', 
      fullPage: true 
    });
    console.log('\n📸 Screenshot guardado: screenshots/verificacion-planillas-soi.png');
    
    await authBot.close();
    
  } catch (e) {
    console.error('Error:', e);
    await authBot.close();
  }
}

verificar();
