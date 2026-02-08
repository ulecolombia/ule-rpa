# ULE RPA Service - Operations Runbook

Complete guide for operating, monitoring, troubleshooting, and maintaining the ULE RPA Service in production.

---

## Table of Contents
1. [System Health Monitoring](#system-health-monitoring)
2. [Common Issues & Solutions](#common-issues--solutions)
3. [Emergency Procedures](#emergency-procedures)
4. [Maintenance Tasks](#maintenance-tasks)
5. [Performance Tuning](#performance-tuning)
6. [Backup & Recovery](#backup--recovery)
7. [Security Incidents](#security-incidents)
8. [Runbook Checklists](#runbook-checklists)

---

## System Health Monitoring

### Health Check Endpoint

```bash
# Check overall system health
curl http://localhost:3000/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2026-02-08T10:00:00Z",
  "services": {
    "redis": "ok",
    "database": "ok",
    "browser": "ok",
    "queue": "ok"
  }
}
```

### Key Metrics to Monitor

#### 1. Queue Metrics
```bash
# Check queue depth
redis-cli LLEN bull:enlace-operations:wait

# Check active jobs
redis-cli LLEN bull:enlace-operations:active

# Check failed jobs
redis-cli LLEN bull:enlace-operations:failed
```

**Thresholds**:
- ⚠️ Warning: > 50 jobs waiting
- 🔴 Critical: > 200 jobs waiting

**Actions**:
- Add more workers
- Check if bots are stuck
- Review error logs

#### 2. Bot Execution Time

**Expected Times**:
| Bot | Normal | Warning | Critical |
|-----|--------|---------|----------|
| Auth (first) | 15-20s | > 30s | > 60s |
| Search | 5-8s | > 15s | > 30s |
| Registration | 15-20s | > 40s | > 90s |
| Liquidation | 20-30s | > 60s | > 120s |
| Comprobante | 10-15s | > 70s | > 120s |

**Monitor via logs**:
```bash
# Check execution times
grep "duration" logs/worker.log | tail -20

# Calculate average
grep "duration" logs/worker.log | awk '{sum+=$5; count++} END {print sum/count}'
```

#### 3. Error Rate

```bash
# Count errors in last hour
grep "ERROR" logs/worker.log | grep "$(date -u +%Y-%m-%d\ %H)" | wc -l

# Error rate by bot type
grep "ERROR" logs/worker.log | grep -o '"botType":"[^"]*"' | sort | uniq -c
```

**Thresholds**:
- ✅ Normal: < 5% error rate
- ⚠️ Warning: 5-15% error rate
- 🔴 Critical: > 15% error rate

#### 4. Session Health

```bash
# Check session age
grep "Session age" logs/worker.log | tail -1

# Check re-authentication frequency
grep "Re-authenticating" logs/worker.log | grep "$(date +%Y-%m-%d)" | wc -l
```

**Expected**:
- Re-auth every ~30 minutes
- If re-auth more frequent → Session instability

#### 5. Resource Usage

```bash
# Memory usage
ps aux | grep node | awk '{sum+=$6} END {print sum/1024 " MB"}'

# CPU usage
top -b -n 1 | grep node

# Disk usage (screenshots)
du -sh screenshots/

# Disk usage (downloads)
du -sh uploads/comprobantes/
```

**Thresholds**:
- Memory: < 2GB per worker (warning > 3GB)
- CPU: < 80% sustained (warning > 90%)
- Disk: < 10GB for screenshots (cleanup if > 20GB)

### Logging

**Log Locations**:
- API logs: `logs/api.log`
- Worker logs: `logs/worker.log`
- Error logs: `logs/error.log`
- Combined: `logs/combined.log`

**Log Rotation**:
```bash
# Rotate logs daily, keep 30 days
logrotate /etc/logrotate.d/ule-rpa
```

**Useful Log Queries**:

```bash
# Recent errors
tail -f logs/error.log

# Specific bot type
grep '"botType":"registro"' logs/worker.log

# Failed jobs
grep "Job failed" logs/worker.log

# Authentication issues
grep "Authentication" logs/worker.log

# reCAPTCHA detections
grep "reCAPTCHA" logs/worker.log
```

---

## Common Issues & Solutions

### Issue 1: "Element not found" Errors

**Symptoms**:
```
ERROR: Element not found: #submit-button
Screenshot: registro-error-no-button.png
```

**Possible Causes**:
1. Enlace UI changed
2. Page not fully loaded
3. Selector is wrong

**Diagnosis**:
```bash
# 1. Check screenshot
open screenshots/registro-error-no-button.png

# 2. Check if selector exists in code
grep "submit-button" src/bots/utils/selectors.ts

# 3. Test manually
# Set headless: false in browser.ts
# Run bot and inspect page
```

**Solutions**:

1. **Update selector**:
   ```typescript
   // In selectors.ts
   SUBMIT_BUTTON: '#new-submit-button-id', // Updated 2026-02-08
   ```

2. **Add delay before element**:
   ```typescript
   // In bot code
   await sleep(2000); // Wait for page load
   await waitForSelector(page, SELECTOR, 10000);
   ```

3. **Add fallback selector**:
   ```typescript
   const selectors = [PRIMARY, SECONDARY, FALLBACK];
   for (const selector of selectors) {
     if (await elementExists(page, selector)) {
       await click(page, selector);
       break;
     }
   }
   ```

**Prevention**:
- Run weekly manual tests
- Monitor screenshot changes
- Use multiple fallback selectors

---

### Issue 2: reCAPTCHA Timeout

**Symptoms**:
```
ERROR: reCAPTCHA not solved within 2 minutes
Screenshot: login-recaptcha-timeout.png
```

**Possible Causes**:
1. No one monitoring to solve CAPTCHA
2. CAPTCHA too difficult
3. Network latency causing slow load

**Diagnosis**:
```bash
# Check if reCAPTCHA frequency increased
grep "reCAPTCHA detected" logs/worker.log | grep "$(date +%Y-%m-%d)" | wc -l
```

**Solutions**:

1. **Immediate**: Restart worker
   ```bash
   pm2 restart ule-rpa-worker
   # Will trigger new login attempt
   ```

2. **Increase timeout** (if needed):
   ```typescript
   // In auth.bot.ts
   const RECAPTCHA_TIMEOUT = 180000; // 3 minutes instead of 2
   ```

3. **Set up monitoring alert**:
   ```bash
   # Alert when reCAPTCHA detected
   # So someone can solve it immediately
   ```

4. **Investigate alternatives**:
   - Check if Enlace has API key auth
   - Request operator account with less strict security

**Prevention**:
- Maintain long session (re-auth less frequently)
- Use realistic user agent and viewport
- Monitor for CAPTCHA frequency increase

---

### Issue 3: Session Expired Mid-Operation

**Symptoms**:
```
ERROR: Session expired during registration
Navigation to login page detected
```

**Possible Causes**:
1. Session timeout (> 30 min)
2. Enlace forced logout
3. Multiple workers using same session

**Diagnosis**:
```bash
# Check session age at error
grep "Session age" logs/worker.log | tail -5

# Check if multiple workers
ps aux | grep "npm run worker" | wc -l
```

**Solutions**:

1. **Immediate**: Let bot retry (should auto re-authenticate)
   ```typescript
   // Already implemented in ensureAuthenticated()
   if (!this.isSessionValid()) {
     await this.login();
   }
   ```

2. **If retry fails**: Restart worker
   ```bash
   pm2 restart ule-rpa-worker
   ```

3. **For multiple workers**: Use separate browser instances
   ```typescript
   // Future enhancement: Browser pool
   class BrowserPool {
     async getBrowser(workerId: string): Promise<Browser> {
       // Separate browser per worker
     }
   }
   ```

**Prevention**:
- Monitor session age
- Implement session refresh before expiry
- Use single worker per Enlace account

---

### Issue 4: Download Not Found

**Symptoms**:
```
ERROR: Downloaded file not found
Path: ./uploads/comprobantes/comprobante-xxx.pdf
```

**Possible Causes**:
1. Download failed silently
2. File saved to different location
3. Permissions issue

**Diagnosis**:
```bash
# Check download directory
ls -la uploads/comprobantes/

# Check recent files
ls -lt uploads/comprobantes/ | head -10

# Check permissions
ls -ld uploads/comprobantes/
# Should be drwxr-xr-x

# Check Puppeteer download path
grep "downloadPath" src/bots/utils/browser.ts
```

**Solutions**:

1. **Immediate**: Check if file exists elsewhere
   ```bash
   find . -name "*comprobante*" -type f -mmin -5
   # Find comprobante files modified in last 5 min
   ```

2. **Fix permissions**:
   ```bash
   chmod 755 uploads/comprobantes/
   ```

3. **Verify Puppeteer config**:
   ```typescript
   // In browser.ts
   const browser = await puppeteer.launch({
     // ...
   });

   const page = await browser.newPage();

   // Set download behavior
   const client = await page.target().createCDPSession();
   await client.send('Page.setDownloadBehavior', {
     behavior: 'allow',
     downloadPath: path.resolve('./uploads/comprobantes'),
   });
   ```

4. **Add download verification**:
   ```typescript
   // Wait longer for download
   await sleep(5000); // 5 seconds

   // Check file exists before returning
   if (!fs.existsSync(filePath)) {
     throw new BotError('Download failed: file not created');
   }
   ```

**Prevention**:
- Test downloads regularly
- Monitor download directory size
- Implement file cleanup (delete old files)

---

### Issue 5: Database Connection Lost

**Symptoms**:
```
ERROR: Can't reach database server at localhost:5432
```

**Possible Causes**:
1. PostgreSQL service down
2. Too many connections
3. Network issue

**Diagnosis**:
```bash
# Check PostgreSQL status
systemctl status postgresql

# Check connections
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Check max connections
psql -U postgres -c "SHOW max_connections;"

# Check connection errors
grep "database" logs/error.log | tail -20
```

**Solutions**:

1. **If PostgreSQL down**: Restart
   ```bash
   sudo systemctl restart postgresql
   ```

2. **If too many connections**: Increase limit or close idle
   ```bash
   # Edit postgresql.conf
   max_connections = 200  # Default is 100

   # Restart
   sudo systemctl restart postgresql
   ```

3. **Check Prisma connection pool**:
   ```typescript
   // In prisma/schema.prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
     // Add connection limit
     connection_limit = 10
   }
   ```

4. **Implement connection retry**:
   ```typescript
   import { PrismaClient } from '@prisma/client';

   const prisma = new PrismaClient({
     // Retry on connection errors
     errorFormat: 'minimal',
   });

   // Retry logic
   async function connectWithRetry(maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         await prisma.$connect();
         return;
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         await sleep(5000);
       }
     }
   }
   ```

**Prevention**:
- Monitor database connections
- Close connections properly
- Use connection pooling

---

### Issue 6: Redis Connection Lost

**Symptoms**:
```
ERROR: ECONNREFUSED 127.0.0.1:6379
Queue operations failing
```

**Diagnosis**:
```bash
# Check Redis status
systemctl status redis

# Test connection
redis-cli ping
# Should return: PONG

# Check Redis logs
tail -f /var/log/redis/redis-server.log
```

**Solutions**:

1. **Restart Redis**:
   ```bash
   sudo systemctl restart redis
   ```

2. **Check memory**:
   ```bash
   redis-cli INFO memory | grep used_memory_human
   ```

   If high:
   ```bash
   # Clear old jobs
   redis-cli FLUSHDB
   # WARNING: This deletes all jobs in queue!
   ```

3. **Update BullMQ config** for reconnection:
   ```typescript
   const queue = new Queue('enlace-operations', {
     connection: {
       host: 'localhost',
       port: 6379,
       retryStrategy: (times) => {
         // Reconnect with exponential backoff
         return Math.min(times * 1000, 30000);
       },
     },
   });
   ```

**Prevention**:
- Monitor Redis memory
- Clean old jobs regularly
- Set up Redis persistence (AOF + RDB)

---

## Emergency Procedures

### Emergency 1: All Jobs Failing

**Situation**: 100% job failure rate suddenly

**Immediate Actions**:

1. **Stop accepting new jobs**:
   ```bash
   # Pause queue
   node -e "const {Queue} = require('bullmq'); const q = new Queue('enlace-operations'); q.pause();"
   ```

2. **Check recent changes**:
   ```bash
   git log -5 --oneline
   # Was there a recent deployment?
   ```

3. **Check Enlace status**:
   ```bash
   curl -I https://suaporte.com.co
   # Is Enlace down?
   ```

4. **Review error logs**:
   ```bash
   tail -100 logs/error.log
   ```

5. **If Enlace UI changed**:
   - Take screenshot of login page
   - Compare with previous screenshots
   - Update selectors urgently

6. **If code bug**:
   ```bash
   # Rollback to last working version
   git revert HEAD
   npm run build
   pm2 restart all
   ```

7. **Resume queue** once fixed:
   ```bash
   node -e "const {Queue} = require('bullmq'); const q = new Queue('enlace-operations'); q.resume();"
   ```

---

### Emergency 2: reCAPTCHA on Every Login

**Situation**: reCAPTCHA appears on every authentication attempt

**Possible Causes**:
- Enlace detected bot activity
- IP flagged for suspicious activity
- Too many login attempts

**Immediate Actions**:

1. **Stop workers** to reduce login attempts:
   ```bash
   pm2 stop ule-rpa-worker
   ```

2. **Wait 1 hour** (cool-down period)

3. **Change approach**:
   - Use different IP (VPN or different server)
   - Contact Enlace support for operator API key
   - Reduce login frequency (longer sessions)

4. **Restart with stealth improvements**:
   ```typescript
   // Add more realistic headers
   await page.setExtraHTTPHeaders({
     'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
     'Accept': 'text/html,application/xhtml+xml',
     'Accept-Encoding': 'gzip, deflate, br',
     'Cache-Control': 'max-age=0',
   });
   ```

---

### Emergency 3: Data Corruption (Wrong User Data)

**Situation**: Bot registered or liquidated for wrong user

**Immediate Actions**:

1. **STOP ALL WORKERS IMMEDIATELY**:
   ```bash
   pm2 stop all
   ```

2. **Identify affected jobs**:
   ```bash
   grep "ERROR\|WARNING" logs/worker.log | grep "$(date +%Y-%m-%d)"
   ```

3. **Check database for incorrect data**:
   ```sql
   SELECT * FROM enlace_users
   WHERE created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;
   ```

4. **Contact Enlace** to correct data manually

5. **Root cause analysis**:
   - Review code changes
   - Check if validation bypassed
   - Review logs for data flow

6. **Implement fixes**:
   - Add more validation
   - Add verification step
   - Add data sanity checks

7. **Deploy fix and test thoroughly**

8. **Resume operations** only after verification

---

## Maintenance Tasks

### Daily Tasks

**1. Review Error Logs**:
```bash
# Check errors from last 24 hours
grep "ERROR" logs/worker.log | grep "$(date +%Y-%m-%d)" | less
```

**2. Check Queue Health**:
```bash
# Jobs waiting
redis-cli LLEN bull:enlace-operations:wait

# Jobs failed
redis-cli LLEN bull:enlace-operations:failed
```

**3. Monitor Disk Space**:
```bash
df -h
du -sh screenshots/
du -sh uploads/
```

### Weekly Tasks

**1. Cleanup Old Screenshots**:
```bash
# Delete screenshots older than 7 days
find screenshots/ -type f -mtime +7 -delete
```

**2. Cleanup Old Comprobantes**:
```bash
# Archive comprobantes older than 30 days
find uploads/comprobantes/ -type f -mtime +30 -exec mv {} uploads/archive/ \;
```

**3. Review Performance Metrics**:
```bash
# Average execution time per bot
grep "duration" logs/worker.log | grep "$(date +%Y-%m-%d)" | \
  awk '{sum+=$5; count++} END {print "Avg:", sum/count "ms"}'
```

**4. Test Critical Flows**:
```bash
# Manual test of each bot
npm run test:auth
npm run test:search
npm run test:registro
```

**5. Update Selectors if Needed**:
- Run bots in headless: false
- Visually inspect Enlace pages
- Update selectors.ts if changes detected

### Monthly Tasks

**1. Update Dependencies**:
```bash
npm outdated
npm update
npm audit
npm audit fix
```

**2. Review and Optimize Database**:
```sql
-- Vacuum database
VACUUM ANALYZE;

-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Archive old job logs
DELETE FROM job_logs WHERE created_at < NOW() - INTERVAL '90 days';
```

**3. Backup Database**:
```bash
pg_dump -U postgres ule_rpa > backups/ule_rpa_$(date +%Y%m%d).sql
```

**4. Review Security**:
```bash
# Check for exposed secrets
git secrets --scan

# Review environment variables
cat .env.production

# Update passwords if needed
```

**5. Performance Review**:
- Analyze execution time trends
- Identify bottlenecks
- Plan optimizations

---

## Performance Tuning

### Optimize Bot Execution Time

**1. Reduce Delays**:
```typescript
// Profile delays
const start = Date.now();
await sleep(2000);
console.log('Sleep took:', Date.now() - start);

// Use minimum necessary
await sleep(1000); // Instead of 2000
```

**2. Parallel Operations**:
```typescript
// ❌ Sequential (slow)
await fillField1();
await fillField2();
await fillField3();

// ✅ Parallel (fast)
await Promise.all([
  fillField1(),
  fillField2(),
  fillField3(),
]);
```

**3. Optimize Selectors**:
```typescript
// ❌ Slow: Complex XPath
'//div[@class="form"]//input[@type="text"][1]'

// ✅ Fast: Simple ID
'#username-input'
```

**4. Reduce Screenshots in Production**:
```typescript
// Only screenshot on errors in prod
if (process.env.NODE_ENV === 'development' || error) {
  await browserManager.takeScreenshot(page, context);
}
```

### Scale Workers

**1. Add More Workers**:
```bash
# Check current workers
pm2 list

# Add worker
pm2 start npm --name "ule-rpa-worker-2" -- run worker

# Or use cluster mode
pm2 start npm --name "ule-rpa-workers" -i 3 -- run worker
```

**2. Configure Concurrency**:
```typescript
const worker = new Worker('enlace-operations', processJob, {
  concurrency: 3, // Process 3 jobs in parallel per worker
});
```

**3. Optimize Queue Settings**:
```typescript
const queue = new Queue('enlace-operations', {
  limiter: {
    max: 20,        // Max 20 jobs
    duration: 60000 // Per minute (increased from 10)
  },
});
```

---

## Backup & Recovery

### Database Backup

**Automated Daily Backup**:
```bash
# Cron job (runs daily at 2 AM)
0 2 * * * pg_dump -U postgres ule_rpa > /backups/ule_rpa_$(date +\%Y\%m\%d).sql
```

**Manual Backup**:
```bash
pg_dump -U postgres ule_rpa > ule_rpa_backup.sql
```

**Restore**:
```bash
# Drop existing database
dropdb ule_rpa

# Create new database
createdb ule_rpa

# Restore from backup
psql -U postgres ule_rpa < ule_rpa_backup.sql
```

### Redis Backup

**Enable Persistence**:
```bash
# In redis.conf
save 900 1      # Save after 900 sec if at least 1 key changed
save 300 10     # Save after 300 sec if at least 10 keys changed
save 60 10000   # Save after 60 sec if at least 10000 keys changed

appendonly yes  # Enable AOF (Append Only File)
```

**Manual Backup**:
```bash
redis-cli SAVE
cp /var/lib/redis/dump.rdb /backups/redis_$(date +%Y%m%d).rdb
```

### Code Backup

**Git Backup**:
```bash
# Push to remote
git push origin main

# Create release tag
git tag -a v1.0.0 -m "Production release"
git push origin v1.0.0
```

---

## Security Incidents

### Incident 1: Credentials Exposed

**Actions**:
1. **Immediately rotate credentials**
2. **Revoke exposed keys**
3. **Check logs for unauthorized access**
4. **Update .env and secrets manager**
5. **Review git history** (ensure no secrets committed)

### Incident 2: Unauthorized Access Detected

**Actions**:
1. **Block IP addresses**
2. **Review access logs**
3. **Rotate all credentials**
4. **Enable 2FA if available**
5. **Audit recent actions**

---

## Runbook Checklists

### Weekly Health Check ✅

- [ ] Review error logs
- [ ] Check queue depth (< 50 jobs waiting)
- [ ] Check error rate (< 5%)
- [ ] Test authentication flow
- [ ] Test search bot
- [ ] Test registration bot
- [ ] Cleanup old screenshots
- [ ] Check disk space (< 80%)
- [ ] Review performance metrics

### Monthly Maintenance ✅

- [ ] All weekly tasks
- [ ] Update dependencies
- [ ] Database vacuum
- [ ] Database backup
- [ ] Security audit
- [ ] Performance review
- [ ] Update documentation if needed
- [ ] Review and update selectors
- [ ] Test all critical flows manually

### Incident Response ✅

- [ ] Identify and log incident
- [ ] Stop workers if critical
- [ ] Investigate root cause
- [ ] Implement fix
- [ ] Test thoroughly
- [ ] Deploy fix
- [ ] Monitor closely
- [ ] Document incident
- [ ] Update runbook

---

**Last Updated**: 2026-02-08
**On-Call Contact**: [Insert contact info]
**Escalation Path**: [Insert escalation process]
