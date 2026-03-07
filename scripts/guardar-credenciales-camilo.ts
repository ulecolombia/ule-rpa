// En scripts/guardar-credenciales-camilo.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encryptPassword } from '../src/utils/crypto';

const prisma = new PrismaClient();

async function main() {
  const { encrypted, iv } = encryptPassword('Pruebaule123*');

  const user = await prisma.enlaceUser.upsert({
    where: { numeroDocumento: '1047478670' },
    update: {
      soiPassword: encrypted,
      soiPasswordIV: iv,
      soiAccountStatus: 'ACTIVE',
      operador: 'SOI',
      enlaceStatus: 'REGISTERED',
    },
    create: {
      id: 'test-camilo-001',
      uleUserId: 'test-ule-camilo-001',
      tipoDocumento: 'CC',
      numeroDocumento: '1047478670',
      nombre: 'Camilo Andres Maturana Mejia',
      operador: 'SOI',
      soiAccountStatus: 'ACTIVE',
      soiPassword: encrypted,
      soiPasswordIV: iv,
      enlaceStatus: 'REGISTERED',
    },
  });

  console.log('✅ Usuario guardado:', user.id, user.soiAccountStatus);
}

main().finally(() => prisma.$disconnect());
