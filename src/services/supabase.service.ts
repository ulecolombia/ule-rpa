/**
 * Supabase Service for ULE RPA
 *
 * Maneja la conexión a Supabase para:
 * - Guardar/leer credenciales de usuarios SOI
 * - Registrar logs de activación
 * - Sincronizar estado de cuentas
 *
 * La tabla principal es `usuarios_soi` que contiene:
 * - user_id: ID del usuario en ULE
 * - soi_usuario: Usuario de SOI (número de documento)
 * - soi_password: Contraseña de SOI (encriptada)
 * - verificado: Si las credenciales han sido verificadas
 * - ultima_verificacion: Timestamp de última verificación
 * - intentos_fallidos: Contador de intentos fallidos
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'supabase-service' });

// Tipos para las tablas de Supabase
export interface UsuarioSOI {
  id: string;
  user_id: string;
  soi_usuario: string;
  soi_password: string;
  verificado: boolean;
  ultima_verificacion: string | null;
  intentos_fallidos: number;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  tipo_documento: string;
  numero_documento: string;
  telefono: string | null;
  created_at: string;
}

export interface CreateUsuarioSOIData {
  user_id: string;
  soi_usuario: string;
  soi_password: string;
  verificado?: boolean;
}

export interface UpdateUsuarioSOIData {
  soi_password?: string;
  verificado?: boolean;
  ultima_verificacion?: string;
  intentos_fallidos?: number;
}

/**
 * Servicio de Supabase para el RPA
 */
class SupabaseService {
  private client: SupabaseClient | null = null;
  private initialized = false;

  /**
   * Inicializa la conexión a Supabase
   */
  initialize(): boolean {
    if (this.initialized && this.client) {
      return true;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      logger.error('Supabase credentials not configured', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey,
      });
      return false;
    }

    try {
      this.client = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      this.initialized = true;
      logger.info('Supabase client initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Supabase client', { error });
      return false;
    }
  }

  /**
   * Obtiene el cliente de Supabase
   */
  getClient(): SupabaseClient {
    if (!this.client) {
      this.initialize();
    }
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }
    return this.client;
  }

  // ============================================================================
  // USUARIOS SOI - CRUD Operations
  // ============================================================================

  /**
   * Busca un usuario SOI por user_id (ID de usuario ULE)
   */
  async getUsuarioSOIByUserId(userId: string): Promise<UsuarioSOI | null> {
    const client = this.getClient();

    const { data, error } = await client
      .from('usuarios_soi')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      logger.error('Error fetching usuario SOI', { userId, error });
      throw error;
    }

    return data;
  }

  /**
   * Busca un usuario SOI por número de documento
   */
  async getUsuarioSOIByDocumento(documento: string): Promise<UsuarioSOI | null> {
    const client = this.getClient();

    const { data, error } = await client
      .from('usuarios_soi')
      .select('*')
      .eq('soi_usuario', documento)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Error fetching usuario SOI by documento', { documento, error });
      throw error;
    }

    return data;
  }

  /**
   * Crea un nuevo registro de usuario SOI
   */
  async createUsuarioSOI(data: CreateUsuarioSOIData): Promise<UsuarioSOI> {
    const client = this.getClient();

    const { data: created, error } = await client
      .from('usuarios_soi')
      .insert({
        user_id: data.user_id,
        soi_usuario: data.soi_usuario,
        soi_password: data.soi_password,
        verificado: data.verificado ?? false,
        intentos_fallidos: 0,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating usuario SOI', { data, error });
      throw error;
    }

    logger.info('Usuario SOI created', { userId: data.user_id, documento: data.soi_usuario });
    return created;
  }

  /**
   * Actualiza un registro de usuario SOI
   */
  async updateUsuarioSOI(userId: string, data: UpdateUsuarioSOIData): Promise<UsuarioSOI> {
    const client = this.getClient();

    const updateData: Record<string, unknown> = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error } = await client
      .from('usuarios_soi')
      .update(updateData)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating usuario SOI', { userId, data, error });
      throw error;
    }

    logger.info('Usuario SOI updated', { userId, changes: Object.keys(data) });
    return updated;
  }

  /**
   * Guarda las credenciales SOI para un usuario
   * Si ya existe, actualiza; si no, crea nuevo
   */
  async saveSOICredentials(
    userId: string,
    documento: string,
    password: string,
    verificado = false
  ): Promise<UsuarioSOI> {
    const existing = await this.getUsuarioSOIByUserId(userId);

    if (existing) {
      return this.updateUsuarioSOI(userId, {
        soi_password: password,
        verificado,
        ultima_verificacion: verificado ? new Date().toISOString() : undefined,
        intentos_fallidos: 0,
      });
    }

    return this.createUsuarioSOI({
      user_id: userId,
      soi_usuario: documento,
      soi_password: password,
      verificado,
    });
  }

  /**
   * Marca las credenciales como verificadas
   */
  async markCredentialsVerified(userId: string): Promise<void> {
    await this.updateUsuarioSOI(userId, {
      verificado: true,
      ultima_verificacion: new Date().toISOString(),
      intentos_fallidos: 0,
    });
  }

  /**
   * Incrementa el contador de intentos fallidos
   */
  async incrementFailedAttempts(userId: string): Promise<number> {
    const existing = await this.getUsuarioSOIByUserId(userId);
    if (!existing) {
      throw new Error(`Usuario SOI not found: ${userId}`);
    }

    const newCount = existing.intentos_fallidos + 1;
    await this.updateUsuarioSOI(userId, {
      intentos_fallidos: newCount,
      verificado: false,
    });

    return newCount;
  }

  // ============================================================================
  // USERS - Lookup Operations
  // ============================================================================

  /**
   * Busca un usuario ULE por número de documento
   */
  async getUserByDocumento(documento: string): Promise<User | null> {
    const client = this.getClient();

    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('numero_documento', documento)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Error fetching user by documento', { documento, error });
      throw error;
    }

    return data;
  }

  /**
   * Busca un usuario ULE por ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const client = this.getClient();

    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Error fetching user by ID', { userId, error });
      throw error;
    }

    return data;
  }

  /**
   * Busca usuarios que no tienen cuenta SOI registrada
   */
  async getUsersWithoutSOI(): Promise<User[]> {
    const client = this.getClient();

    const { data, error } = await client
      .from('users')
      .select(`
        *,
        usuarios_soi!left(id)
      `)
      .is('usuarios_soi.id', null);

    if (error) {
      logger.error('Error fetching users without SOI', { error });
      throw error;
    }

    return data || [];
  }

  /**
   * Busca usuarios SOI pendientes de verificación
   */
  async getUnverifiedSOIUsers(): Promise<UsuarioSOI[]> {
    const client = this.getClient();

    const { data, error } = await client
      .from('usuarios_soi')
      .select('*')
      .eq('verificado', false)
      .lt('intentos_fallidos', 3);

    if (error) {
      logger.error('Error fetching unverified SOI users', { error });
      throw error;
    }

    return data || [];
  }

  // ============================================================================
  // LOGS - Registro de activaciones
  // ============================================================================

  /**
   * Registra un log de activación de cuenta SOI
   */
  async logActivation(
    userId: string,
    documento: string,
    success: boolean,
    message: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const client = this.getClient();

    try {
      await client.from('rpa_logs').insert({
        tipo: 'SOI_ACTIVATION',
        user_id: userId,
        documento,
        success,
        message,
        details: details ? JSON.stringify(details) : null,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      // Log table might not exist, just log the error
      logger.warn('Could not write to rpa_logs table', { error });
    }
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  /**
   * Verifica la conexión a Supabase
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient();
      const { error } = await client.from('usuarios_soi').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  }
}

// Singleton instance
const supabaseService = new SupabaseService();

/**
 * Obtiene la instancia del servicio de Supabase
 */
export function getSupabaseService(): SupabaseService {
  return supabaseService;
}

export default supabaseService;
