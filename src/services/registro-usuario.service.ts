/**
 * Servicio de Registro de Usuario
 *
 * Orquesta el registro de usuarios en operadores de PILA.
 * Implementa fallback automático: SOI -> Mi Planilla
 *
 * Flujo:
 * 1. Intenta registrar en SOI
 * 2. Si SOI retorna error APO-06002 ("ya existe"), registra en Mi Planilla
 * 3. Guarda el operador asignado en la base de datos
 */

import { PrismaClient, OperadorPila } from '@prisma/client';
import { crearCuentaSOI } from '../bots/soi/registro.bot';
import { SOIUserRegistration } from '../types/soi.types';
import { registrarUsuarioMiPlanilla } from '../bots/miplanilla';
import { MiPlanillaRegistro, ULE_MIPLANILLA_CONFIG } from '../types/miplanilla.types';
import { encryptPassword } from '../utils/crypto';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Códigos de error de SOI que indican que el usuario ya existe
const SOI_USER_EXISTS_ERRORS = [
  'APO-06002',
  'ya existe',
  'already exists',
  'aportante a registrar ya existe',
];

export interface RegistroUsuarioRequest {
  // ID del usuario en ULE (referencia)
  uleUserId: string;

  // Datos de identificación
  tipoDocumento: string;
  documento: string;

  // Datos personales
  primerNombre: string;
  segundoNombre?: string;
  primerApellido: string;
  segundoApellido?: string;

  // Ubicación
  departamento: string;
  municipio: string;
  direccion: string;
  ciudad: string;

  // Contacto
  email?: string;
  celular: string;
  telefonoFijo?: string;

  // Datos de seguridad social
  ingresosMensuales: number; // IBC
  epsCodigo: string;
  afpCodigo: string;
}

export interface RegistroUsuarioResult {
  success: boolean;
  operador: OperadorPila;
  accountCreated: boolean;

  // Credenciales (si se creó cuenta nueva)
  usuario?: string;
  password?: string; // En texto plano para mostrar al usuario una vez

  // Info adicional
  message: string;
  error?: string;

  // Flag para saber si fue fallback
  fallbackToMiPlanilla?: boolean;
}

/**
 * Registra un usuario en el operador de PILA apropiado
 * Implementa fallback automático de SOI a Mi Planilla
 */
export async function registrarUsuario(
  request: RegistroUsuarioRequest
): Promise<RegistroUsuarioResult> {
  logger.info('Starting user registration process', {
    uleUserId: request.uleUserId,
    documento: request.documento,
  });

  // Verificar si el usuario ya está registrado en nuestra BD
  const existingUser = await prisma.enlaceUser.findUnique({
    where: { uleUserId: request.uleUserId },
  });

  if (existingUser?.soiAccountStatus === 'ACTIVE') {
    logger.info('User already has active SOI account', {
      documento: request.documento,
      operador: existingUser.operador,
    });

    return {
      success: true,
      operador: existingUser.operador,
      accountCreated: false,
      message: `Usuario ya tiene cuenta activa en ${existingUser.operador}`,
    };
  }

  // === PASO 1: Intentar registrar en SOI ===
  logger.info('Attempting SOI registration', { documento: request.documento });

  const soiData: SOIUserRegistration = {
    tipoDocumento: request.tipoDocumento as any,
    documento: request.documento,
    nombres: `${request.primerNombre} ${request.segundoNombre || ''}`.trim(),
    apellidos: `${request.primerApellido} ${request.segundoApellido || ''}`.trim(),
    departamento: request.departamento,
    municipio: request.municipio,
    celularUsuario: request.celular,
    emailUsuario: request.email,
  };

  const soiResult = await crearCuentaSOI(soiData);

  // Verificar si SOI fue exitoso
  if (soiResult.success && soiResult.accountCreated) {
    logger.info('SOI registration successful', { documento: request.documento });

    // Guardar en BD con operador SOI
    await saveUserToDatabase(request, 'SOI', soiResult.generatedPassword);

    return {
      success: true,
      operador: 'SOI',
      accountCreated: true,
      usuario: request.email || request.documento,
      password: soiResult.generatedPassword,
      message: 'Usuario registrado exitosamente en SOI',
    };
  }

  // === PASO 2: Verificar si es error de "usuario ya existe" ===
  const isUserExistsError = SOI_USER_EXISTS_ERRORS.some(
    (errorCode) =>
      soiResult.message?.toLowerCase().includes(errorCode.toLowerCase()) ||
      soiResult.error?.toLowerCase().includes(errorCode.toLowerCase())
  );

  if (!isUserExistsError) {
    // Error diferente, no es candidato para fallback
    logger.error('SOI registration failed with unexpected error', {
      documento: request.documento,
      error: soiResult.error || soiResult.message,
    });

    return {
      success: false,
      operador: 'SOI',
      accountCreated: false,
      message: soiResult.message,
      error: soiResult.error,
    };
  }

  // === PASO 3: Fallback a Mi Planilla ===
  logger.info('SOI user exists error detected, falling back to Mi Planilla', {
    documento: request.documento,
    soiError: soiResult.message,
  });

  const miPlanillaData: MiPlanillaRegistro = {
    tipoDocumento: request.tipoDocumento as any,
    documento: request.documento,
    primerNombre: request.primerNombre,
    segundoNombre: request.segundoNombre,
    primerApellido: request.primerApellido,
    segundoApellido: request.segundoApellido,
    email: request.email || ULE_MIPLANILLA_CONFIG.email,
    celular: request.celular,
    telefonoFijo: request.telefonoFijo,
    direccion: request.direccion,
    ciudad: request.ciudad,
    ingresosMensuales: request.ingresosMensuales,
    epsCodigo: request.epsCodigo,
    afpCodigo: request.afpCodigo,
    actividadEconomica: ULE_MIPLANILLA_CONFIG.actividadEconomica,
  };

  const miPlanillaResult = await registrarUsuarioMiPlanilla(miPlanillaData);

  if (miPlanillaResult.success && miPlanillaResult.accountCreated) {
    logger.info('Mi Planilla registration successful (fallback)', {
      documento: request.documento,
      usuario: miPlanillaResult.usuario,
    });

    // Guardar en BD con operador MI_PLANILLA
    await saveUserToDatabase(
      request,
      'MI_PLANILLA',
      miPlanillaResult.generatedPassword,
      miPlanillaResult.usuario
    );

    return {
      success: true,
      operador: 'MI_PLANILLA',
      accountCreated: true,
      usuario: miPlanillaResult.usuario,
      password: miPlanillaResult.generatedPassword,
      message: 'Usuario registrado exitosamente en Mi Planilla (SOI no disponible)',
      fallbackToMiPlanilla: true,
    };
  }

  // Ambos fallaron
  logger.error('Both SOI and Mi Planilla registration failed', {
    documento: request.documento,
    soiError: soiResult.error,
    miPlanillaError: miPlanillaResult.error,
  });

  return {
    success: false,
    operador: 'SOI', // Default
    accountCreated: false,
    message: 'No se pudo registrar el usuario en ningún operador',
    error: `SOI: ${soiResult.error || soiResult.message}. Mi Planilla: ${miPlanillaResult.error || miPlanillaResult.message}`,
  };
}

/**
 * Guarda o actualiza el usuario en la base de datos
 */
async function saveUserToDatabase(
  request: RegistroUsuarioRequest,
  operador: OperadorPila,
  password?: string,
  miPlanillaUser?: string
): Promise<void> {
  let encryptedData: string | null = null;
  let iv: string | null = null;

  if (password) {
    const encrypted = encryptPassword(password);
    encryptedData = encrypted.encrypted;
    iv = encrypted.iv;
  }

  const updateData: any = {
    operador,
    soiAccountStatus: 'ACTIVE',
  };

  if (operador === 'SOI') {
    updateData.soiPassword = encryptedData;
    updateData.soiPasswordIV = iv;
    updateData.soiLinkedAt = new Date();
  } else if (operador === 'MI_PLANILLA') {
    updateData.miplanillaUser = miPlanillaUser;
    updateData.miplanillaPassword = encryptedData;
    updateData.miplanillaPasswordIV = iv;
    updateData.miplanillaLinkedAt = new Date();
  }

  await prisma.enlaceUser.upsert({
    where: { uleUserId: request.uleUserId },
    create: {
      uleUserId: request.uleUserId,
      tipoDocumento: request.tipoDocumento,
      numeroDocumento: request.documento,
      nombre: `${request.primerNombre} ${request.segundoNombre || ''}`.trim(),
      apellidos: `${request.primerApellido} ${request.segundoApellido || ''}`.trim(),
      departamento: request.departamento,
      municipio: request.municipio,
      email: request.email,
      celular: request.celular,
      eps: request.epsCodigo,
      pension: request.afpCodigo,
      ...updateData,
    },
    update: updateData,
  });

  logger.info('User saved to database', {
    uleUserId: request.uleUserId,
    operador,
  });
}

/**
 * Verifica en qué operador está registrado un usuario
 */
export async function getOperadorUsuario(uleUserId: string): Promise<OperadorPila | null> {
  const user = await prisma.enlaceUser.findUnique({
    where: { uleUserId },
    select: { operador: true, soiAccountStatus: true },
  });

  if (!user || user.soiAccountStatus !== 'ACTIVE') {
    return null;
  }

  return user.operador;
}

/**
 * Obtiene las credenciales del usuario para el operador asignado
 */
export async function getCredencialesUsuario(uleUserId: string): Promise<{
  operador: OperadorPila;
  usuario: string;
  passwordEncriptado: string;
  passwordIV: string;
} | null> {
  const user = await prisma.enlaceUser.findUnique({
    where: { uleUserId },
  });

  if (!user || user.soiAccountStatus !== 'ACTIVE') {
    return null;
  }

  if (user.operador === 'SOI') {
    if (!user.soiPassword || !user.soiPasswordIV) {
      return null;
    }
    return {
      operador: 'SOI',
      usuario: user.email || user.numeroDocumento,
      passwordEncriptado: user.soiPassword,
      passwordIV: user.soiPasswordIV,
    };
  }

  if (user.operador === 'MI_PLANILLA') {
    if (!user.miplanillaPassword || !user.miplanillaPasswordIV || !user.miplanillaUser) {
      return null;
    }
    return {
      operador: 'MI_PLANILLA',
      usuario: user.miplanillaUser,
      passwordEncriptado: user.miplanillaPassword,
      passwordIV: user.miplanillaPasswordIV,
    };
  }

  return null;
}

export default {
  registrarUsuario,
  getOperadorUsuario,
  getCredencialesUsuario,
};
