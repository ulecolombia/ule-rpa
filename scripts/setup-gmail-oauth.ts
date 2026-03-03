/**
 * Script para configurar OAuth de Gmail
 *
 * Pasos previos:
 * 1. Ir a Google Cloud Console: https://console.cloud.google.com
 * 2. Crear un proyecto o seleccionar uno existente
 * 3. Habilitar Gmail API
 * 4. Crear credenciales OAuth 2.0 (tipo: Desktop app)
 * 5. Descargar el archivo JSON y guardarlo como: config/gmail-credentials.json
 * 6. Ejecutar este script: npx tsx scripts/setup-gmail-oauth.ts
 *
 * Este script:
 * 1. Lee las credenciales de config/gmail-credentials.json
 * 2. Genera una URL de autorización
 * 3. Espera que el usuario autorice y proporcione el código
 * 4. Guarda el token en config/gmail-token.json
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { google } from 'googleapis';

const CREDENTIALS_PATH = path.join(process.cwd(), 'config', 'gmail-credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'config', 'gmail-token.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   📧 CONFIGURACIÓN DE GMAIL OAUTH PARA ULE RPA            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Verificar que existe el archivo de credenciales
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log('❌ ERROR: No se encontró el archivo de credenciales.');
    console.log('');
    console.log('📋 Instrucciones:');
    console.log('1. Ve a https://console.cloud.google.com');
    console.log('2. Crea o selecciona un proyecto');
    console.log('3. Habilita la Gmail API');
    console.log('4. Ve a "Credenciales" → "Crear credenciales" → "ID de cliente OAuth"');
    console.log('5. Selecciona tipo "Aplicación de escritorio"');
    console.log('6. Descarga el archivo JSON');
    console.log('7. Guárdalo como: config/gmail-credentials.json');
    console.log('8. Ejecuta este script de nuevo');
    console.log('');
    process.exit(1);
  }

  // Verificar si ya existe un token
  if (fs.existsSync(TOKEN_PATH)) {
    console.log('✅ Ya existe un token de Gmail.');
    console.log('   Si deseas regenerarlo, elimina el archivo: config/gmail-token.json');

    // Verificar si el token es válido
    try {
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
      const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      oauth2Client.setCredentials(token);

      // Intentar una operación simple para verificar el token
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      await gmail.users.getProfile({ userId: 'me' });

      console.log('✅ Token válido y funcionando.');
      process.exit(0);
    } catch (error) {
      console.log('⚠️ El token existente parece inválido. Regenerando...');
      fs.unlinkSync(TOKEN_PATH);
    }
  }

  // Leer credenciales
  console.log('📁 Leyendo credenciales...');
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Generar URL de autorización
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('\n📋 PASO 1: Abre esta URL en tu navegador:\n');
  console.log(`   ${authUrl}`);
  console.log('\n📋 PASO 2: Inicia sesión con la cuenta: pagos.ule@gmail.com');
  console.log('📋 PASO 3: Autoriza la aplicación');
  console.log('📋 PASO 4: Copia el código de autorización\n');

  // Leer el código de autorización
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await new Promise<string>((resolve) => {
    rl.question('🔑 Ingresa el código de autorización: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (!code) {
    console.log('❌ No se proporcionó código de autorización.');
    process.exit(1);
  }

  // Intercambiar código por token
  console.log('\n⏳ Obteniendo tokens...');
  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Guardar token
    const configDir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

    console.log('✅ Token guardado exitosamente en:', TOKEN_PATH);

    // Verificar que funciona
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    console.log('\n📧 Configuración completada para:', profile.data.emailAddress);
    console.log('   Total de mensajes:', profile.data.messagesTotal);

    console.log('\n✅ Gmail OAuth configurado correctamente.');
    console.log('   El RPA ahora puede leer emails de activación de SOI.');
  } catch (error) {
    console.log('❌ Error al obtener el token:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch(console.error);
