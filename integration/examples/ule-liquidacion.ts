/**
 * ULE Integration Example: PILA Liquidation
 *
 * Este archivo muestra cómo integrar el servicio RPA para liquidar
 * las cotizaciones PILA de un usuario.
 *
 * UBICACIÓN EN ULE: app/api/payments/liquidacion/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Calcular aportes PILA según IBC
 *
 * @param ibc - Ingreso Base de Cotización
 * @param dias - Días a cotizar (1-30)
 * @returns Cálculo de aportes
 */
function calcularAportesPILA(ibc: number, dias: number = 30) {
  const factor = dias / 30; // Factor de proporción

  return {
    salud: Math.round(ibc * 0.125 * factor), // 12.5%
    pension: Math.round(ibc * 0.16 * factor), // 16%
    arl: Math.round(ibc * 0.00522 * factor), // 0.522% (nivel riesgo I)
    total: Math.round(ibc * (0.125 + 0.16 + 0.00522) * factor),
  };
}

/**
 * POST /api/payments/liquidacion
 * Crea una liquidación PILA y envía al RPA
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, periodo, ingresoBase, ibc, dias = 30 } = body;

    // 1. Validaciones
    if (!userId || !periodo || !ibc) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verificar que usuario tenga perfil completo
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.perfilCompleto) {
      return NextResponse.json(
        { error: 'User profile not complete' },
        { status: 400 }
      );
    }

    // Verificar que usuario esté registrado en Enlace
    if (user.enlaceRegistroStatus !== 'COMPLETED' || !user.enlaceUserId) {
      return NextResponse.json(
        { error: 'User not registered in Enlace. Complete profile first.' },
        { status: 400 }
      );
    }

    // 2. Calcular aportes
    const aportes = calcularAportesPILA(ibc, dias);

    // 3. Crear orden de pago en BD de ULE
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        periodo,
        ingresoBase,
        ibc,
        dias,
        salud: aportes.salud,
        pension: aportes.pension,
        arl: aportes.arl,
        total: aportes.total,
        status: 'PENDING_LIQUIDACION',
        createdAt: new Date(),
      },
    });

    console.log('✅ Payment order created', {
      paymentId: payment.id,
      userId: user.id,
      total: payment.total,
    });

    // 4. Enviar al RPA para liquidar en Enlace
    try {
      const rpaResponse = await fetch(
        `${process.env.RPA_SERVICE_URL}/api/tasks/liquidacion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.RPA_API_KEY!,
          },
          body: JSON.stringify({
            uleUserId: user.id,
            paymentId: payment.id,
            pilaData: {
              periodo,
              ingresoBase,
              ibc,
              salud: aportes.salud,
              pension: aportes.pension,
              arl: aportes.arl,
              total: aportes.total,
            },
          }),
        }
      );

      if (!rpaResponse.ok) {
        const errorText = await rpaResponse.text();
        console.error('❌ RPA liquidation task failed', {
          paymentId: payment.id,
          status: rpaResponse.status,
          error: errorText,
        });

        // Actualizar estado del pago
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'LIQUIDACION_FAILED',
            errorMessage: errorText,
          },
        });

        return NextResponse.json(
          { error: 'Failed to create liquidation task' },
          { status: 500 }
        );
      }

      const { taskId } = await rpaResponse.json();
      console.log('✅ RPA liquidation task created', {
        paymentId: payment.id,
        taskId,
      });

      // Guardar taskId para tracking
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          liquidacionTaskId: taskId,
          status: 'LIQUIDACION_IN_PROGRESS',
        },
      });

      return NextResponse.json({
        success: true,
        payment: {
          id: payment.id,
          periodo: payment.periodo,
          total: payment.total,
          status: payment.status,
          taskId,
        },
      });
    } catch (error) {
      console.error('❌ Error calling RPA service', {
        paymentId: payment.id,
        error: error instanceof Error ? error.message : error,
      });

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'LIQUIDACION_FAILED',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      });

      return NextResponse.json(
        { error: 'Error calling RPA service' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('❌ Error creating liquidation', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/payments/liquidacion/:paymentId
 * Consulta el estado de una liquidación
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: params.paymentId },
      include: {
        user: {
          select: {
            id: true,
            nombre: true,
            numeroDocumento: true,
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Si hay taskId, consultar estado actual en RPA
    if (payment.liquidacionTaskId) {
      try {
        const taskResponse = await fetch(
          `${process.env.RPA_SERVICE_URL}/api/tasks/${payment.liquidacionTaskId}`,
          {
            headers: {
              'x-api-key': process.env.RPA_API_KEY!,
            },
          }
        );

        if (taskResponse.ok) {
          const { task } = await taskResponse.json();

          // Actualizar estado si cambió
          if (task.status === 'COMPLETED' && task.resultData) {
            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: 'LIQUIDACION_COMPLETED',
                numeroPlanilla: task.resultData.numeroPlanilla,
                fechaLimitePago: task.resultData.fechaLimite
                  ? new Date(task.resultData.fechaLimite)
                  : undefined,
              },
            });

            return NextResponse.json({
              payment: {
                ...payment,
                status: 'LIQUIDACION_COMPLETED',
                numeroPlanilla: task.resultData.numeroPlanilla,
                fechaLimitePago: task.resultData.fechaLimite,
              },
              task: {
                id: task.id,
                status: task.status,
                completedAt: task.completedAt,
              },
            });
          } else if (task.status === 'FAILED') {
            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: 'LIQUIDACION_FAILED',
                errorMessage: task.error,
              },
            });
          }
        }
      } catch (error) {
        console.error('Error fetching RPA task status', error);
        // Continuar con el estado que tenemos en BD
      }
    }

    return NextResponse.json({ payment });
  } catch (error) {
    console.error('Error fetching payment', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Webhook handler para recibir notificaciones del RPA
 * UBICACIÓN: app/api/webhooks/rpa/route.ts
 */
export async function handleRPAWebhook(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, taskId, uleUserId, type, status, resultData } = body;

    // Validar webhook secret
    const signature = req.headers.get('x-webhook-signature');
    if (signature !== process.env.RPA_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    console.log('📥 RPA Webhook received', { event, taskId, type, status });

    if (type === 'LIQUIDACION' && event === 'task.completed') {
      // Buscar payment por taskId
      const payment = await prisma.payment.findFirst({
        where: { liquidacionTaskId: taskId },
      });

      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: status === 'COMPLETED' ? 'LIQUIDACION_COMPLETED' : 'LIQUIDACION_FAILED',
            numeroPlanilla: resultData?.numeroPlanilla,
            fechaLimitePago: resultData?.fechaLimite
              ? new Date(resultData.fechaLimite)
              : undefined,
            errorMessage: status === 'FAILED' ? resultData?.error : null,
          },
        });

        console.log('✅ Payment updated from webhook', {
          paymentId: payment.id,
          status,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing RPA webhook', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
