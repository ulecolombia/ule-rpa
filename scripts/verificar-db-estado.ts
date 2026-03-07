/**
 * Script: Verificar Estado de la Base de Datos
 *
 * Muestra en consola de forma legible:
 * - Todos los EnlaceUser con sus estados
 * - PilaPlanillas de las últimas 72h
 * - Tasks de las últimas 24h
 * - Resumen de estadísticas
 *
 * Uso: npx tsx scripts/verificar-db-estado.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function formatPassword(password: string | null): string {
  return password ? colorize('exists', 'green') : colorize('null', 'red');
}

function formatStatus(status: string): string {
  switch (status) {
    case 'REGISTERED':
    case 'ACTIVE':
    case 'COMPLETED':
    case 'PAGADA':
      return colorize(status, 'green');
    case 'PENDING':
    case 'PENDING_CREATION':
    case 'PENDIENTE':
    case 'PROCESSING':
      return colorize(status, 'yellow');
    case 'REQUIRES_MANUAL_REVIEW':
    case 'ERROR':
    case 'FAILED':
    case 'RECHAZADA':
      return colorize(status, 'red');
    default:
      return status;
  }
}

function formatDate(date: Date | null): string {
  if (!date) return '-';
  return date.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount);
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log(colorize('  VERIFICACION DE ESTADO DE BASE DE DATOS - ULE RPA', 'bright'));
  console.log(colorize(`  Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, 'dim'));
  console.log('='.repeat(80) + '\n');

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. ENLACE USERS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(colorize('\n1. ENLACE USERS (Todos los usuarios registrados)', 'cyan'));
  console.log('-'.repeat(80));

  const users = await prisma.enlaceUser.findMany({
    orderBy: { createdAt: 'desc' },
  });

  if (users.length === 0) {
    console.log(colorize('  No hay usuarios registrados', 'dim'));
  } else {
    console.log(`  Total: ${colorize(String(users.length), 'bright')} usuarios\n`);

    // Header
    console.log(
      '  ' +
      'Documento'.padEnd(15) +
      'Operador'.padEnd(14) +
      'EnlaceStatus'.padEnd(26) +
      'SOI Status'.padEnd(20) +
      'SOI Pass'.padEnd(10) +
      'MiPlan Pass'
    );
    console.log('  ' + '-'.repeat(95));

    for (const user of users) {
      console.log(
        '  ' +
        user.numeroDocumento.padEnd(15) +
        (user.operador || 'N/A').padEnd(14) +
        formatStatus(user.enlaceStatus).padEnd(35) +
        formatStatus(user.soiAccountStatus).padEnd(29) +
        formatPassword(user.soiPassword).padEnd(19) +
        formatPassword(user.miplanillaPassword)
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. PILA PLANILLAS (últimas 72h)
  // ═══════════════════════════════════════════════════════════════════════════
  const hours72Ago = new Date(Date.now() - 72 * 60 * 60 * 1000);

  console.log(colorize('\n\n2. PILA PLANILLAS (últimas 72 horas)', 'cyan'));
  console.log('-'.repeat(80));

  const planillas = await prisma.pilaPlanilla.findMany({
    where: {
      createdAt: { gte: hours72Ago },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      enlaceUser: {
        select: { numeroDocumento: true },
      },
    },
  });

  if (planillas.length === 0) {
    console.log(colorize('  No hay planillas en las últimas 72 horas', 'dim'));
  } else {
    console.log(`  Total: ${colorize(String(planillas.length), 'bright')} planillas\n`);

    // Header
    console.log(
      '  ' +
      'Num. Planilla'.padEnd(16) +
      'Periodo'.padEnd(10) +
      'Estado'.padEnd(16) +
      'Total'.padEnd(15) +
      'Documento'.padEnd(15) +
      'Creada'
    );
    console.log('  ' + '-'.repeat(85));

    for (const planilla of planillas) {
      console.log(
        '  ' +
        planilla.numeroPlanilla.padEnd(16) +
        planilla.periodo.padEnd(10) +
        formatStatus(planilla.estadoPago).padEnd(25) +
        formatMoney(planilla.total).padEnd(15) +
        (planilla.enlaceUser?.numeroDocumento || planilla.uleUserId).padEnd(15) +
        formatDate(planilla.createdAt)
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. TASKS (últimas 24h)
  // ═══════════════════════════════════════════════════════════════════════════
  const hours24Ago = new Date(Date.now() - 24 * 60 * 60 * 1000);

  console.log(colorize('\n\n3. TASKS (últimas 24 horas)', 'cyan'));
  console.log('-'.repeat(80));

  const tasks = await prisma.task.findMany({
    where: {
      createdAt: { gte: hours24Ago },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (tasks.length === 0) {
    console.log(colorize('  No hay tareas en las últimas 24 horas', 'dim'));
  } else {
    console.log(`  Total: ${colorize(String(tasks.length), 'bright')} tareas\n`);

    // Header
    console.log(
      '  ' +
      'Tipo'.padEnd(25) +
      'Status'.padEnd(16) +
      'ULE User ID'.padEnd(20) +
      'Creada'.padEnd(20) +
      'Error'
    );
    console.log('  ' + '-'.repeat(95));

    for (const task of tasks) {
      const errorShort = task.error
        ? (task.error.length > 30 ? task.error.substring(0, 30) + '...' : task.error)
        : '-';

      console.log(
        '  ' +
        task.type.padEnd(25) +
        formatStatus(task.status).padEnd(25) +
        (task.uleUserId || '-').substring(0, 18).padEnd(20) +
        formatDate(task.createdAt).padEnd(20) +
        (task.error ? colorize(errorShort, 'red') : '-')
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. RESUMEN
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(colorize('\n\n4. RESUMEN DE ESTADISTICAS', 'cyan'));
  console.log('-'.repeat(80));

  // Conteos de usuarios por estado
  const userStats = {
    total: users.length,
    registered: users.filter(u => u.enlaceStatus === 'REGISTERED').length,
    pending: users.filter(u => u.enlaceStatus === 'PENDING').length,
    registering: users.filter(u => u.enlaceStatus === 'REGISTERING').length,
    manualReview: users.filter(u => u.enlaceStatus === 'REQUIRES_MANUAL_REVIEW').length,
    error: users.filter(u => u.enlaceStatus === 'ERROR').length,
  };

  const soiStats = {
    active: users.filter(u => u.soiAccountStatus === 'ACTIVE').length,
    pendingCreation: users.filter(u => u.soiAccountStatus === 'PENDING_CREATION').length,
    notLinked: users.filter(u => u.soiAccountStatus === 'NOT_LINKED').length,
    credentialsError: users.filter(u => u.soiAccountStatus === 'CREDENTIALS_ERROR').length,
  };

  const operatorStats = {
    soi: users.filter(u => u.operador === 'SOI').length,
    miPlanilla: users.filter(u => u.operador === 'MI_PLANILLA').length,
  };

  const planillaStats = {
    total: planillas.length,
    pendiente: planillas.filter(p => p.estadoPago === 'PENDIENTE').length,
    pagada: planillas.filter(p => p.estadoPago === 'PAGADA').length,
    enProceso: planillas.filter(p => p.estadoPago === 'EN_PROCESO').length,
    rechazada: planillas.filter(p => p.estadoPago === 'RECHAZADA').length,
  };

  const taskStats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'COMPLETED').length,
    failed: tasks.filter(t => t.status === 'FAILED').length,
    pending: tasks.filter(t => t.status === 'PENDING').length,
    processing: tasks.filter(t => t.status === 'PROCESSING').length,
  };

  console.log(`
  ${colorize('USUARIOS', 'bright')}
  ├── Total:                    ${userStats.total}
  ├── REGISTERED:               ${colorize(String(userStats.registered), 'green')}
  ├── PENDING:                  ${colorize(String(userStats.pending), 'yellow')}
  ├── REGISTERING:              ${colorize(String(userStats.registering), 'yellow')}
  ├── REQUIRES_MANUAL_REVIEW:   ${colorize(String(userStats.manualReview), 'red')}
  └── ERROR:                    ${colorize(String(userStats.error), 'red')}

  ${colorize('SOI ACCOUNT STATUS', 'bright')}
  ├── ACTIVE:                   ${colorize(String(soiStats.active), 'green')}
  ├── PENDING_CREATION:         ${colorize(String(soiStats.pendingCreation), 'yellow')}
  ├── NOT_LINKED:               ${soiStats.notLinked}
  └── CREDENTIALS_ERROR:        ${colorize(String(soiStats.credentialsError), 'red')}

  ${colorize('OPERADOR', 'bright')}
  ├── SOI:                      ${operatorStats.soi}
  └── MI_PLANILLA:              ${operatorStats.miPlanilla}

  ${colorize('PLANILLAS (72h)', 'bright')}
  ├── Total:                    ${planillaStats.total}
  ├── PENDIENTE:                ${colorize(String(planillaStats.pendiente), 'yellow')}
  ├── PAGADA:                   ${colorize(String(planillaStats.pagada), 'green')}
  ├── EN_PROCESO:               ${colorize(String(planillaStats.enProceso), 'yellow')}
  └── RECHAZADA:                ${colorize(String(planillaStats.rechazada), 'red')}

  ${colorize('TASKS (24h)', 'bright')}
  ├── Total:                    ${taskStats.total}
  ├── COMPLETED:                ${colorize(String(taskStats.completed), 'green')}
  ├── FAILED:                   ${colorize(String(taskStats.failed), 'red')}
  ├── PENDING:                  ${colorize(String(taskStats.pending), 'yellow')}
  └── PROCESSING:               ${colorize(String(taskStats.processing), 'yellow')}
`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. ALERTAS
  // ═══════════════════════════════════════════════════════════════════════════
  const alerts: string[] = [];

  if (userStats.manualReview > 0) {
    alerts.push(`${userStats.manualReview} usuario(s) requieren revisión manual`);
  }
  if (soiStats.pendingCreation > 0) {
    alerts.push(`${soiStats.pendingCreation} cuenta(s) SOI pendientes de activación`);
  }
  if (taskStats.failed > 0) {
    alerts.push(`${taskStats.failed} tarea(s) fallidas en las últimas 24h`);
  }
  if (planillaStats.pendiente > 5) {
    alerts.push(`${planillaStats.pendiente} planillas pendientes de pago`);
  }

  if (alerts.length > 0) {
    console.log(colorize('  ALERTAS:', 'red'));
    for (const alert of alerts) {
      console.log(colorize(`  ⚠️  ${alert}`, 'yellow'));
    }
  } else {
    console.log(colorize('  ✅ Sin alertas - Todo en orden', 'green'));
  }

  console.log('\n' + '='.repeat(80) + '\n');

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Error:', error);
  prisma.$disconnect();
  process.exit(1);
});
