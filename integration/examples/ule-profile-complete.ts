/**
 * ULE Integration Example: Profile Completion
 *
 * Este archivo muestra cómo integrar el servicio RPA cuando un usuario
 * completa su perfil de onboarding en ULE.
 *
 * UBICACIÓN EN ULE: app/api/user/profile/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/user/profile
 * Guarda o actualiza el perfil completo del usuario
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      tipoDocumento,
      numeroDocumento,
      nombre,
      email,
      telefono,
      direccion,
      ciudad,
      entidadSalud,
      entidadPension,
      arl,
    } = body;

    // 1. Validaciones básicas
    if (!userId || !numeroDocumento || !nombre) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 2. Guardar perfil en BD de ULE
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        tipoDocumento,
        numeroDocumento,
        nombre,
        email,
        telefono,
        direccion,
        ciudad,
        entidadSalud,
        entidadPension,
        arl,
        perfilCompleto: true,
        perfilCompletadoEn: new Date(),
      },
    });

    console.log('✅ User profile saved', { userId: user.id, nombre: user.nombre });

    // 3. NUEVO: Activar RPA para registrar en Enlace Operativo
    try {
      const rpaResponse = await fetch(
        `${process.env.RPA_SERVICE_URL}/api/tasks/registro`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.RPA_API_KEY!,
          },
          body: JSON.stringify({
            uleUserId: user.id,
            userData: {
              tipoDocumento: user.tipoDocumento,
              numeroDocumento: user.numeroDocumento,
              nombre: user.nombre,
              email: user.email,
              telefono: user.telefono,
              eps: user.entidadSalud,
              pension: user.entidadPension,
              arl: user.arl,
            },
          }),
        }
      );

      if (!rpaResponse.ok) {
        const errorText = await rpaResponse.text();
        console.error('❌ RPA registration task failed', {
          userId: user.id,
          status: rpaResponse.status,
          error: errorText,
        });

        // IMPORTANTE: No lanzar error aquí
        // El perfil se guardó exitosamente
        // El RPA puede reintentar después o el usuario puede intentar manualmente
      } else {
        const { taskId } = await rpaResponse.json();
        console.log('✅ RPA registration task created', {
          userId: user.id,
          taskId,
        });

        // Opcional: Guardar taskId en tu BD para tracking
        await prisma.user.update({
          where: { id: user.id },
          data: {
            enlaceRegistroTaskId: taskId,
            enlaceRegistroStatus: 'PENDING',
          },
        });
      }
    } catch (error) {
      console.error('❌ Error calling RPA service', {
        userId: user.id,
        error: error instanceof Error ? error.message : error,
      });

      // IMPORTANTE: No lanzar error
      // Continuar con el flujo normal
      // El usuario puede intentar registrarse manualmente más tarde
    }

    // 4. Retornar respuesta exitosa
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        nombre: user.nombre,
        perfilCompleto: user.perfilCompleto,
      },
    });
  } catch (error) {
    console.error('❌ Error saving user profile', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/user/profile/:userId
 * Obtiene el perfil del usuario incluyendo estado de registro en Enlace
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        nombre: true,
        email: true,
        tipoDocumento: true,
        numeroDocumento: true,
        perfilCompleto: true,
        enlaceRegistroTaskId: true,
        enlaceRegistroStatus: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Si hay una tarea de registro, consultar su estado actual
    let registroStatus = user.enlaceRegistroStatus;
    if (user.enlaceRegistroTaskId) {
      try {
        const taskResponse = await fetch(
          `${process.env.RPA_SERVICE_URL}/api/tasks/${user.enlaceRegistroTaskId}`,
          {
            headers: {
              'x-api-key': process.env.RPA_API_KEY!,
            },
          }
        );

        if (taskResponse.ok) {
          const { task } = await taskResponse.json();
          registroStatus = task.status;

          // Actualizar estado en BD si cambió
          if (task.status !== user.enlaceRegistroStatus) {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                enlaceRegistroStatus: task.status,
                enlaceUserId:
                  task.status === 'COMPLETED'
                    ? task.resultData?.enlaceUserId
                    : undefined,
              },
            });
          }
        }
      } catch (error) {
        console.error('Error fetching RPA task status', error);
        // Continuar con el estado que tenemos en BD
      }
    }

    return NextResponse.json({
      user: {
        ...user,
        enlaceRegistroStatus: registroStatus,
      },
    });
  } catch (error) {
    console.error('Error fetching user profile', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
