#!/usr/bin/env node

/**
 * Script para generar actualización de documentación
 * Uso: node scripts/update-docs.js [phase-complete|daily]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mode = process.argv[2] || 'daily';

function getGitStats() {
  try {
    // Commits desde ayer
    const commits = execSync('git log --since="24 hours ago" --oneline', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    // Archivos modificados
    const files = execSync('git diff --name-only HEAD~1 HEAD 2>/dev/null || echo ""', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    // Stats de código
    const stats = execSync('git diff --stat HEAD~1 HEAD 2>/dev/null || echo "No changes"', { encoding: 'utf8' })
      .trim();

    return { commits, files, stats };
  } catch (error) {
    return { commits: [], files: [], stats: 'Unable to get git stats' };
  }
}

function generateDailyUpdate() {
  const date = new Date().toISOString().split('T')[0];
  const { commits, files, stats } = getGitStats();

  const update = `
## Update: ${date}

### Commits Hoy: ${commits.length}
${commits.length > 0 ? commits.map(c => `- ${c}`).join('\n') : '- No commits today'}

### Archivos Modificados: ${files.length}
${files.length > 0 ? files.map(f => `- \`${f}\``).join('\n') : '- No files modified'}

### Stats:
\`\`\`
${stats}
\`\`\`

### Trabajo Realizado Hoy:
1. [Agregar manualmente - describe qué se hizo]

### Próximos Pasos (siguientes 24h):
- [ ] [Agregar manualmente]

### Bloqueadores:
- [Si hay bloqueadores, agregar aquí]

---

`;

  // Append to DAILY_UPDATES.md
  const dailyUpdatesPath = path.join(__dirname, '../DAILY_UPDATES.md');

  let content = '';
  if (fs.existsSync(dailyUpdatesPath)) {
    content = fs.readFileSync(dailyUpdatesPath, 'utf8');
  } else {
    content = '# Daily Updates\n\nLog de actualizaciones diarias del proyecto.\n\n---\n\n';
  }

  // Check if update for today already exists
  if (content.includes(`## Update: ${date}`)) {
    console.log(`⚠️  Update for ${date} already exists in DAILY_UPDATES.md`);
    console.log(`📝 Edit the file manually to update today's entry`);
    return;
  }

  // Prepend new update (más reciente primero)
  const updatedContent = content.replace(
    '---\n\n',
    `---\n\n${update}`
  );

  fs.writeFileSync(dailyUpdatesPath, updatedContent);

  console.log('✅ Daily update created for', date);
  console.log('📝 Edit DAILY_UPDATES.md to add manual notes:');
  console.log('   - Trabajo Realizado Hoy');
  console.log('   - Próximos Pasos');
  console.log('   - Bloqueadores');
}

function updateContextFile() {
  const contextPath = path.join(__dirname, '../CONTEXT.md');

  if (!fs.existsSync(contextPath)) {
    console.log('⚠️  CONTEXT.md not found');
    return;
  }

  const content = fs.readFileSync(contextPath, 'utf8');

  // Update "Last Updated" line
  const today = new Date().toISOString().split('T')[0];
  const updatedContent = content.replace(
    /\*\*Last Updated\*\*: \d{4}-\d{2}-\d{2}/g,
    `**Last Updated**: ${today}`
  );

  fs.writeFileSync(contextPath, updatedContent);
  console.log('✅ CONTEXT.md updated with new date:', today);
}

function generatePhaseCompletion() {
  console.log('');
  console.log('📋 Phase Completion Checklist:');
  console.log('━'.repeat(60));
  console.log('');
  console.log('1. ✏️  Update PROGRESS.md with phase details:');
  console.log('   - Fecha completada');
  console.log('   - Commits realizados');
  console.log('   - Componentes implementados');
  console.log('   - Estadísticas');
  console.log('');
  console.log('2. ✏️  Update CONTEXT.md sections:');
  console.log('   - Current Project State (línea 21)');
  console.log('   - Critical Files Map');
  console.log('   - Statistics (línea 59)');
  console.log('   - Git Commits (línea 67)');
  console.log('   - Last Updated (automático)');
  console.log('');
  console.log('3. ✏️  Update BOT_FLOWS.md (if bots changed)');
  console.log('   - Nuevos diagramas de flujo');
  console.log('   - Tiempos de ejecución actualizados');
  console.log('');
  console.log('4. ✏️  Update SELECTORS_MAP.md (if selectors added)');
  console.log('   - Documentar nuevos selectores');
  console.log('   - Actualizar Selector Update Log');
  console.log('');
  console.log('5. ✏️  Update ARCHITECTURE.md (if architecture changed)');
  console.log('   - Diagramas actualizados');
  console.log('   - Database schema actualizado');
  console.log('');
  console.log('6. ✏️  Update DECISION_LOG.md (if ADRs needed)');
  console.log('   - Agregar nuevo ADR con formato completo');
  console.log('');
  console.log('7. ✏️  Update RUNBOOK.md (if new operations)');
  console.log('   - Common issues nuevos');
  console.log('   - Maintenance tasks actualizadas');
  console.log('');
  console.log('━'.repeat(60));
  console.log('');
  console.log('✅ After manual updates, run:');
  console.log('');
  console.log('   git add .');
  console.log('   git commit -m "docs: Update documentation for Phase X completion"');
  console.log('   git tag -a phase-X-complete -m "Phase X: [Name] completed"');
  console.log('   git push origin main --tags');
  console.log('');
}

function showUsage() {
  console.log('');
  console.log('📚 Documentation Update Tool');
  console.log('━'.repeat(60));
  console.log('');
  console.log('Usage:');
  console.log('  npm run update:daily         Generate daily update');
  console.log('  npm run update:phase         Show phase completion checklist');
  console.log('');
  console.log('Examples:');
  console.log('  npm run update:daily         # Create entry in DAILY_UPDATES.md');
  console.log('  npm run update:phase         # Show what to update after phase');
  console.log('');
}

// Main
console.log('');
console.log('🔄 ULE RPA Documentation Updater');
console.log('━'.repeat(60));

if (mode === 'daily') {
  console.log('Mode: Daily Update');
  console.log('');
  generateDailyUpdate();
  updateContextFile();
  console.log('');
  console.log('📝 Next steps:');
  console.log('   1. Edit DAILY_UPDATES.md to add manual details');
  console.log('   2. Commit: git add DAILY_UPDATES.md CONTEXT.md');
  console.log('   3. Push: git commit -m "docs: Daily update" && git push');
  console.log('');
} else if (mode === 'phase-complete') {
  console.log('Mode: Phase Completion');
  generatePhaseCompletion();
  updateContextFile();
} else {
  showUsage();
  process.exit(1);
}
