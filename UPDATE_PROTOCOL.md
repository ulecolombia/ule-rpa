# Update Protocol - Mantener Contexto Actualizado

## 🎯 Objetivo

Mantener **toda la documentación siempre actualizada** para que las sesiones de AI tengan contexto perfecto del estado actual del proyecto.

---

## 📅 Frecuencia de Actualización

### Opción 1: Al Completar Cada Fase ✅ RECOMENDADO
- Actualizar documentación **inmediatamente** después de completar una fase
- Ejemplo: Después de implementar "Fase 3: Worker Integration"

### Opción 2: Actualización Diaria (24 horas)
- Si no se completa una fase, actualizar cada 24 horas
- Documenta progreso incremental
- Ejemplo: "Trabajando en Fase 3, completado 60%"

---

## 📝 Checklist de Actualización

### Después de Completar una Fase:

#### 1. PROGRESS.md ⭐ OBLIGATORIO
```markdown
## ✅ FASE [N]: [Nombre de la Fase] - COMPLETADA

**Fecha Completada**: YYYY-MM-DD

### Commits Realizados:
1. **Commit [hash]**: [Mensaje]
2. **Commit [hash]**: [Mensaje]

### Componentes Implementados:
- ✅ [Componente 1]
- ✅ [Componente 2]

### Estadísticas:
- Archivos creados/modificados: X
- Líneas de código: +XXX
- Tests agregados: X

### Próxima Fase:
**FASE [N+1]: [Nombre]**
- [ ] Tarea 1
- [ ] Tarea 2
```

#### 2. CONTEXT.md ⭐ OBLIGATORIO
Actualizar secciones:
- **Current Project State** (línea 21): Nueva fase completada
- **Critical Files Map**: Agregar archivos nuevos
- **Statistics** (línea 59): Actualizar números
- **Git Commits** (línea 67): Agregar nuevos commits
- **Last Updated** (al final): Nueva fecha

#### 3. BOT_FLOWS.md (Si se modificaron bots)
- Actualizar diagramas de flujo
- Agregar nuevos bots
- Actualizar tiempos de ejecución

#### 4. SELECTORS_MAP.md (Si se agregaron selectores)
- Documentar nuevos selectores
- Actualizar Selector Update Log
- Marcar selectores como verificados/actualizados

#### 5. ARCHITECTURE.md (Si cambió arquitectura)
- Actualizar diagramas
- Documentar nuevos componentes
- Actualizar database schema si cambió

#### 6. IMPLEMENTATION_GUIDE.md (Si hay nuevos patrones)
- Agregar nuevos templates
- Documentar nuevos best practices
- Actualizar deployment checklist

#### 7. DECISION_LOG.md (Si se tomaron decisiones arquitectónicas)
- Agregar nuevo ADR con formato completo
- Explicar contexto, decisión, rationale, consecuencias

#### 8. RUNBOOK.md (Si hay nuevas operaciones o issues)
- Agregar nuevos common issues
- Actualizar maintenance tasks
- Documentar nuevos health checks

#### 9. DOMAIN.md (Si cambió lógica de negocio)
- Actualizar business rules
- Agregar nuevas validaciones
- Documentar nuevos términos

---

## 🤖 Plantilla de Actualización Diaria

Si no se completó una fase pero pasaron 24 horas, crear entrada en `DAILY_UPDATES.md`:

```markdown
## Update: YYYY-MM-DD

### Estado Actual:
- **Fase en Progreso**: FASE [N] - [Nombre]
- **Progreso Estimado**: X%
- **Commits Hoy**: X

### Trabajo Realizado Hoy:
1. [Descripción de trabajo 1]
2. [Descripción de trabajo 2]

### Archivos Modificados:
- `path/to/file1.ts` - [Qué se hizo]
- `path/to/file2.ts` - [Qué se hizo]

### Próximos Pasos (siguientes 24h):
- [ ] Tarea 1
- [ ] Tarea 2

### Bloqueadores:
- [Si hay bloqueadores, listarlos aquí]

### Notas:
- [Cualquier nota importante]
```

---

## 🔄 Proceso de Actualización (Paso a Paso)

### Cuando Completes una Fase:

```bash
# 1. Hacer commit final de código
git add .
git commit -m "feat: Complete Phase X - [Name]"
git push origin main

# 2. Ejecutar script de actualización
npm run update:docs

# 3. Revisar archivos actualizados
git status

# 4. Commit de documentación
git add PROGRESS.md CONTEXT.md [otros archivos modificados]
git commit -m "docs: Update documentation for Phase X completion"
git push origin main

# 5. Crear tag de versión
git tag -a phase-X-complete -m "Phase X: [Name] completed"
git push origin phase-X-complete
```

### Actualización Diaria (si no completaste fase):

```bash
# 1. Revisar qué se hizo hoy
git log --since="24 hours ago" --oneline

# 2. Crear entrada en DAILY_UPDATES.md
# (Usar plantilla arriba)

# 3. Actualizar CONTEXT.md si es necesario
# Solo sección "Current Work" o "In Progress"

# 4. Commit
git add DAILY_UPDATES.md CONTEXT.md
git commit -m "docs: Daily update YYYY-MM-DD"
git push origin main
```

---

## 📊 Script de Actualización Automática

### Crear archivo: `scripts/update-docs.js`

```javascript
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
  // Commits desde ayer
  const commits = execSync('git log --since="24 hours ago" --oneline')
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);

  // Archivos modificados
  const files = execSync('git diff --name-only HEAD~1 HEAD')
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);

  // Stats de código
  const stats = execSync('git diff --stat HEAD~1 HEAD')
    .toString()
    .trim();

  return { commits, files, stats };
}

function generateDailyUpdate() {
  const date = new Date().toISOString().split('T')[0];
  const { commits, files, stats } = getGitStats();

  const update = `
## Update: ${date}

### Commits Hoy: ${commits.length}
${commits.map(c => `- ${c}`).join('\n')}

### Archivos Modificados: ${files.length}
${files.map(f => `- \`${f}\``).join('\n')}

### Stats:
\`\`\`
${stats}
\`\`\`

### Próximos Pasos:
- [ ] [Agregar manualmente]

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

  // Prepend new update (más reciente primero)
  const updatedContent = content.replace(
    '---\n\n',
    `---\n\n${update}`
  );

  fs.writeFileSync(dailyUpdatesPath, updatedContent);

  console.log(`✅ Daily update created for ${date}`);
  console.log(`📝 Edit DAILY_UPDATES.md to add manual notes`);
}

function updateContextFile() {
  const contextPath = path.join(__dirname, '../CONTEXT.md');
  const content = fs.readFileSync(contextPath, 'utf8');

  // Update "Last Updated" line
  const today = new Date().toISOString().split('T')[0];
  const updatedContent = content.replace(
    /\*\*Last Updated\*\*: \d{4}-\d{2}-\d{2}/,
    `**Last Updated**: ${today}`
  );

  fs.writeFileSync(contextPath, updatedContent);
  console.log('✅ CONTEXT.md updated with new date');
}

function generatePhaseCompletion() {
  console.log('📋 Phase Completion Checklist:');
  console.log('');
  console.log('1. Update PROGRESS.md with phase details');
  console.log('2. Update CONTEXT.md sections:');
  console.log('   - Current Project State');
  console.log('   - Critical Files Map');
  console.log('   - Statistics');
  console.log('   - Git Commits');
  console.log('3. Update BOT_FLOWS.md (if bots changed)');
  console.log('4. Update SELECTORS_MAP.md (if selectors added)');
  console.log('5. Update ARCHITECTURE.md (if architecture changed)');
  console.log('6. Update DECISION_LOG.md (if ADRs needed)');
  console.log('7. Update RUNBOOK.md (if new operations)');
  console.log('');
  console.log('✅ After updates, run:');
  console.log('   git add .');
  console.log('   git commit -m "docs: Update for Phase X completion"');
  console.log('   git tag -a phase-X-complete -m "Phase X completed"');
  console.log('   git push origin main --tags');
}

// Main
if (mode === 'daily') {
  generateDailyUpdate();
  updateContextFile();
} else if (mode === 'phase-complete') {
  generatePhaseCompletion();
  updateContextFile();
} else {
  console.error('Usage: node scripts/update-docs.js [daily|phase-complete]');
  process.exit(1);
}
```

### Agregar a package.json:

```json
{
  "scripts": {
    "update:daily": "node scripts/update-docs.js daily",
    "update:phase": "node scripts/update-docs.js phase-complete"
  }
}
```

---

## 🚀 Uso del Sistema de Actualización

### Opción 1: Actualización Manual (Recomendada)

**Al completar fase**:
```bash
# 1. Revisar checklist
cat UPDATE_PROTOCOL.md

# 2. Actualizar archivos manualmente según checklist
# - PROGRESS.md
# - CONTEXT.md
# - Otros según lo que cambió

# 3. Commit
git add .
git commit -m "docs: Update documentation for Phase X completion"
git push origin main
```

**Actualización diaria**:
```bash
# 1. Generar update automático
npm run update:daily

# 2. Editar DAILY_UPDATES.md para agregar notas manuales

# 3. Commit
git add DAILY_UPDATES.md CONTEXT.md
git commit -m "docs: Daily update $(date +%Y-%m-%d)"
git push origin main
```

### Opción 2: Automatización con GitHub Actions (Opcional)

Crear `.github/workflows/daily-reminder.yml`:

```yaml
name: Daily Documentation Reminder

on:
  schedule:
    # Runs at 6 PM COT (Colombia Time = UTC-5) every day
    - cron: '0 23 * * *'  # 11 PM UTC = 6 PM COT
  workflow_dispatch:  # Manual trigger

jobs:
  reminder:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Check for updates in last 24h
        id: check
        run: |
          COMMITS=$(git log --since="24 hours ago" --oneline | wc -l)
          echo "commits=$COMMITS" >> $GITHUB_OUTPUT

      - name: Create Issue if no update
        if: steps.check.outputs.commits > 0
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: '📝 Daily Documentation Update Reminder',
              body: `
              ## Recordatorio de Actualización Diaria

              Se detectaron ${process.env.COMMITS} commits en las últimas 24 horas.

              Por favor actualiza la documentación:

              \`\`\`bash
              npm run update:daily
              \`\`\`

              O revisa el checklist en [UPDATE_PROTOCOL.md](UPDATE_PROTOCOL.md)
              `,
              labels: ['documentation', 'reminder']
            })
```

---

## 📋 Template Completo de Actualización de Fase

### PROGRESS.md

```markdown
## ✅ FASE [N]: [Nombre] - COMPLETADA

**Fecha Inicio**: YYYY-MM-DD
**Fecha Completada**: YYYY-MM-DD
**Duración**: X días

### Commits Realizados:
1. **Commit [hash]**: [Mensaje del commit]
2. **Commit [hash]**: [Mensaje del commit]

---

### Componentes Implementados:

#### 1. [Componente 1]
**Archivo**: `path/to/file.ts` (XXX líneas)

**Funcionalidades**:
- ✅ [Feature 1]
- ✅ [Feature 2]

**Métodos/Funciones**:
- `functionName()` - Descripción

#### 2. [Componente 2]
...

---

### Estadísticas:

```
Total archivos modificados: XX
Líneas de código agregadas: +XXXX
Líneas eliminadas: -XXX
Tests agregados: X
Documentación: XXX líneas
```

---

### Cobertura de Funcionalidad:

**[Categoría 1]**: ✅ 100%
- Feature A
- Feature B

**[Categoría 2]**: ✅ 100%
- Feature C

---

### Tareas Completadas:
- [x] Tarea 1
- [x] Tarea 2
- [x] Testing
- [x] Documentación

---

### Próxima Fase:

**FASE [N+1]: [Nombre de Siguiente Fase]**

**Objetivos**:
1. Objetivo 1
2. Objetivo 2

**Tareas**:
- [ ] Tarea 1
- [ ] Tarea 2

**Estimación**: X días

---
```

---

## ✅ Checklist de Verificación

Antes de hacer commit de actualización, verificar:

- [ ] **PROGRESS.md** actualizado con fase completada
- [ ] **CONTEXT.md** - "Current Project State" actualizado
- [ ] **CONTEXT.md** - "Statistics" actualizados
- [ ] **CONTEXT.md** - "Git Commits" agregados
- [ ] **CONTEXT.md** - "Last Updated" con fecha de hoy
- [ ] **BOT_FLOWS.md** actualizado (si aplica)
- [ ] **SELECTORS_MAP.md** actualizado (si aplica)
- [ ] **ARCHITECTURE.md** actualizado (si aplica)
- [ ] **DECISION_LOG.md** - Nuevo ADR (si aplica)
- [ ] **RUNBOOK.md** actualizado (si aplica)
- [ ] **IMPLEMENTATION_GUIDE.md** actualizado (si aplica)
- [ ] **DAILY_UPDATES.md** tiene entrada de hoy (si daily update)
- [ ] Todos los archivos committed y pushed a GitHub
- [ ] Tag creado para fase completada (si phase complete)

---

## 🎯 Regla de Oro

**NUNCA dejar documentación desactualizada por más de 24 horas**

Si trabajaste en el proyecto hoy:
- ✅ Actualización de fase (si completaste fase)
- ✅ Daily update (si no completaste fase)

Esto garantiza que **cualquier sesión de AI futura** tendrá contexto perfecto del estado actual.

---

## 📞 Comando Rápido

```bash
# Daily update (automático)
npm run update:daily

# Phase completion (checklist)
npm run update:phase

# Verificar qué cambió hoy
git log --since="24 hours ago" --stat
```

---

**Última Actualización**: 2026-02-08
**Mantenido por**: AI Sessions + Luis
