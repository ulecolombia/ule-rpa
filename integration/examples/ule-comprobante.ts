/**
 * ULE Integration Example: Comprobante Download
 *
 * Este archivo muestra cómo integrar el servicio RPA para descargar
 * comprobantes de pago PILA después de que el usuario pague.
 *
 * UBICACIÓN EN ULE: app/api/payments/comprobante/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/payments/comprobante
 * Solicita descarga del comprobante de pago
 *
 * IMPORTANTE: Solo llamar después de que el pago haya sido confirmado
 * por PSE/tarjeta y reportado en el banco.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { paymentId } = body;

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Missing paymentId' },
        { status: 400 }
      );
    }

    // 1. Buscar pago en BD
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
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

    // 2. Validar que el pago esté completado
    if (payment.status !== 'PAID') {
      return NextResponse.json(
        {
          error: 'Payment not completed',
          currentStatus: payment.status,
        },
        { status: 400 }
      );
    }

    // 3. Validar que tenga número de planilla
    if (!payment.numeroPlanilla) {
      return NextResponse.json(
        { error: 'Payment does not have planilla number' },
        { status: 400 }
      );
    }

    // 4. Verificar si ya se descargó el comprobante
    const existingComprobante = await prisma.comprobante.findFirst({
      where: { paymentId: payment.id },
    });

    if (existingComprobante) {
      return NextResponse.json({
        success: true,
        message: 'Comprobante already downloaded',
        comprobante: existingComprobante,
      });
    }

    // 5. Enviar al RPA para descargar
    try {
      const rpaResponse = await fetch(
        `${process.env.RPA_SERVICE_URL}/api/tasks/comprobante`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.RPA_API_KEY!,
          },
          body: JSON.stringify({
            uleUserId: payment.userId,
            numeroPlanilla: payment.numeroPlanilla,
            periodo: payment.periodo,
          }),
        }
      );

      if (!rpaResponse.ok) {
        const errorText = await rpaResponse.text();
        console.error('❌ RPA comprobante task failed', {
          paymentId: payment.id,
          status: rpaResponse.status,
          error: errorText,
        });

        return NextResponse.json(
          { error: 'Failed to create comprobante download task' },
          { status: 500 }
        );
      }

      const { taskId } = await rpaResponse.json();
      console.log('✅ RPA comprobante task created', {
        paymentId: payment.id,
        taskId,
      });

      // Guardar taskId para tracking
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          comprobanteTaskId: taskId,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Comprobante download task queued',
        taskId,
      });
    } catch (error) {
      console.error('❌ Error calling RPA service', {
        paymentId: payment.id,
        error: error instanceof Error ? error.message : error,
      });

      return NextResponse.json(
        { error: 'Error calling RPA service' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('❌ Error requesting comprobante', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/payments/comprobante/:paymentId
 * Consulta el estado de descarga del comprobante
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: params.paymentId },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Buscar comprobante en BD local
    const comprobante = await prisma.comprobante.findFirst({
      where: { paymentId: payment.id },
    });

    if (comprobante) {
      return NextResponse.json({
        success: true,
        comprobante: {
          id: comprobante.id,
          fileName: comprobante.fileName,
          fileUrl: comprobante.fileUrl,
          fileSize: comprobante.fileSize,
          createdAt: comprobante.createdAt,
        },
      });
    }

    // Si no existe localmente pero hay taskId, consultar estado en RPA
    if (payment.comprobanteTaskId) {
      try {
        const taskResponse = await fetch(
          `${process.env.RPA_SERVICE_URL}/api/tasks/${payment.comprobanteTaskId}`,
          {
            headers: {
              'x-api-key': process.env.RPA_API_KEY!,
            },
          }
        );

        if (taskResponse.ok) {
          const { task } = await taskResponse.json();

          return NextResponse.json({
            success: false,
            message: 'Comprobante download in progress',
            task: {
              id: task.id,
              status: task.status,
              error: task.error,
            },
          });
        }
      } catch (error) {
        console.error('Error fetching RPA task status', error);
      }
    }

    return NextResponse.json({
      success: false,
      message: 'Comprobante not available yet',
    });
  } catch (error) {
    console.error('Error fetching comprobante', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Flujo completo: Pago PSE → Descarga Automática
 *
 * UBICACIÓN: app/api/payments/pse/callback/route.ts
 */
export async function handlePSECallback(req: NextRequest) {
  try {
    const body = await req.json();
    const { transactionId, status, paymentId } = body;

    console.log('📥 PSE callback received', { transactionId, status, paymentId });

    // 1. Buscar pago
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // 2. Si pago fue exitoso, actualizar estado
    if (status === 'APPROVED') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          transactionId,
          paidAt: new Date(),
        },
      });

      console.log('✅ Payment confirmed', { paymentId, transactionId });

      // 3. AUTOMÁTICO: Solicitar descarga de comprobante
      // Esperar 2 minutos para que el pago se reporte en Enlace
      setTimeout(async () => {
        try {
          console.log('🔄 Auto-requesting comprobante download', { paymentId });

          const rpaResponse = await fetch(
            `${process.env.RPA_SERVICE_URL}/api/tasks/comprobante`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.RPA_API_KEY!,
              },
              body: JSON.stringify({
                uleUserId: payment.userId,
                numeroPlanilla: payment.numeroPlanilla,
                periodo: payment.periodo,
              }),
            }
          );

          if (rpaResponse.ok) {
            const { taskId } = await rpaResponse.json();
            await prisma.payment.update({
              where: { id: payment.id },
              data: { comprobanteTaskId: taskId },
            });
            console.log('✅ Comprobante download queued', { paymentId, taskId });
          } else {
            console.error('❌ Failed to queue comprobante download', {
              paymentId,
              status: rpaResponse.status,
            });
          }
        } catch (error) {
          console.error('❌ Error auto-requesting comprobante', {
            paymentId,
            error,
          });
        }
      }, 2 * 60 * 1000); // 2 minutos
    } else {
      // Pago rechazado
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          transactionId,
          errorMessage: 'Payment rejected by PSE',
        },
      });

      console.log('❌ Payment rejected', { paymentId, transactionId });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing PSE callback', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Webhook handler para recibir comprobante del RPA
 * UBICACIÓN: app/api/webhooks/rpa/route.ts
 */
export async function handleComprobanteWebhook(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, taskId, type, status, resultData } = body;

    // Validar signature
    const signature = req.headers.get('x-webhook-signature');
    if (signature !== process.env.RPA_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    console.log('📥 RPA Webhook (Comprobante) received', {
      event,
      taskId,
      type,
      status,
    });

    if (type === 'COMPROBANTE' && event === 'task.completed' && status === 'COMPLETED') {
      // Buscar payment por taskId
      const payment = await prisma.payment.findFirst({
        where: { comprobanteTaskId: taskId },
      });

      if (payment) {
        // Guardar comprobante en BD local
        await prisma.comprobante.create({
          data: {
            paymentId: payment.id,
            userId: payment.userId,
            fileName: resultData.fileName,
            fileUrl: resultData.fileUrl,
            fileSize: resultData.fileSize,
            filePath: resultData.filePath,
          },
        });

        console.log('✅ Comprobante saved from webhook', {
          paymentId: payment.id,
          fileName: resultData.fileName,
        });

        // Opcional: Enviar notificación al usuario
        // await sendEmailNotification(payment.userId, 'Comprobante disponible');
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing comprobante webhook', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
