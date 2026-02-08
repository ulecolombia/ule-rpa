/**
 * ULE - Wompi Webhook Handler
 *
 * UBICACIÓN EN TU PROYECTO ULE:
 * app/api/payments/wompi/webhook/route.ts
 *
 * Este archivo recibe webhooks de Wompi cuando un pago es confirmado
 * y llama automáticamente al RPA Service para liquidar PILA.
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

/**
 * Verificar firma de Wompi para seguridad
 * IMPORTANTE: Implementar en producción
 */
function verifyWompiSignature(
  payload: any,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  const stringToSign = JSON.stringify(payload);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(stringToSign)
    .digest('hex');

  return signature === expectedSignature;
}

/**
 * POST /api/payments/wompi/webhook
 * Webhook llamado por Wompi cuando hay un evento de transacción
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Obtener y verificar firma de Wompi
    const signature = headers().get('x-event-signature');
    const body = await req.json();

    // TODO: Descomentar en producción
    // const isValid = verifyWompiSignature(
    //   body,
    //   signature,
    //   process.env.WOMPI_SECRET_KEY!
    // );
    // if (!isValid) {
    //   console.error('Invalid Wompi signature');
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    // }

    console.log('Wompi webhook received', {
      event: body.event,
      timestamp: body.timestamp,
    });

    const { data } = body;

    // 2. Verificar que es un pago exitoso
    if (data.transaction.status !== 'APPROVED') {
      console.log('Payment not approved', {
        status: data.transaction.status,
        reference: data.transaction.reference,
      });
      return NextResponse.json({
        message: 'Payment not approved',
        status: data.transaction.status,
      });
    }

    // 3. Obtener referencia del pago
    const reference = data.transaction.reference;

    // Buscar pago en tu DB
    const payment = await prisma.payment.findUnique({
      where: { reference },
      include: {
        user: true,
      },
    });

    if (!payment) {
      console.error('Payment not found in database', { reference });
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // 4. Verificar que el pago no fue ya confirmado (idempotencia)
    if (payment.status === 'CONFIRMED') {
      console.log('Payment already confirmed', { paymentId: payment.id });
      return NextResponse.json({
        message: 'Payment already confirmed',
        paymentId: payment.id,
      });
    }

    // 5. Marcar pago como confirmado
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        wompiTransactionId: data.transaction.id,
      },
    });

    console.log('Payment confirmed in database', {
      paymentId: payment.id,
      userId: payment.userId,
      amount: payment.amount,
    });

    // 6. Extraer datos de PILA del pago
    const pilaData = payment.pilaData as any; // JSON guardado previamente

    // 7. Llamar al RPA para liquidar
    try {
      console.log('Calling RPA Service to create liquidation task', {
        paymentId: payment.id,
        userId: payment.userId,
      });

      const rpaResponse = await fetch(
        `${process.env.RPA_SERVICE_URL}/api/webhooks/payment-confirmed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.RPA_API_KEY!,
          },
          body: JSON.stringify({
            paymentId: payment.id,
            userId: payment.userId,
            amount: payment.amount,
            pilaData: {
              periodo: pilaData.periodo,
              ingresoBase: pilaData.ingresoBase,
              ibc: pilaData.ibc,
              diasCotizados: pilaData.diasCotizados || 30,
              salud: pilaData.salud,
              pension: pilaData.pension,
              arl: pilaData.arl,
              nivelRiesgoARL: pilaData.nivelRiesgoARL || 'I',
              total: payment.amount,
            },
          }),
        }
      );

      if (!rpaResponse.ok) {
        const errorText = await rpaResponse.text();
        console.error('RPA liquidation task failed', {
          status: rpaResponse.status,
          error: errorText,
          paymentId: payment.id,
        });

        // No lanzar error - el pago está confirmado
        // Solo loguear para revisar después
      } else {
        const { taskId } = await rpaResponse.json();
        console.log('RPA liquidation task created successfully', {
          taskId,
          paymentId: payment.id,
          userId: payment.userId,
        });

        // Guardar taskId en payment
        await prisma.payment.update({
          where: { id: payment.id },
          data: { rpaTaskId: taskId },
        });
      }
    } catch (error) {
      console.error('Error calling RPA service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        paymentId: payment.id,
      });
      // No lanzar error - el pago está confirmado
      // El RPA se puede intentar manualmente después
    }

    return NextResponse.json({
      success: true,
      paymentId: payment.id,
      message: 'Payment confirmed and RPA task created',
    });
  } catch (error) {
    console.error('Webhook processing error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/payments/wompi/webhook
 * Endpoint de verificación (Wompi puede llamar GET para verificar)
 */
export async function GET() {
  return NextResponse.json({
    message: 'Wompi webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
}
