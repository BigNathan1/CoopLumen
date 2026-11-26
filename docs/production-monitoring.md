# Production Monitoring & Observability

**Purpose:** Monitor CoopLumen in production for availability, performance, and security  
**Audience:** DevOps, SRE, on-call team  
**Prerequisites:** Backend running; logs accessible; optional: monitoring service (Datadog, New Relic, etc.)

---

## Overview

Production monitoring for CoopLumen covers:

1. **Application health** — Is the API running and responsive?
2. **Stellar connectivity** — Can we reach Horizon for transactions?
3. **Database health** — Is PostgreSQL responding?
4. **Error tracking** — Are there application errors?
5. **Performance** — Are request latencies normal?

This guide provides:
- Built-in health check endpoint
- Structured logging for critical events
- Monitoring setup (logging-based; no external service required)
- Alerting guidelines (manual or integrated with your monitoring tool)

---

## Health Check Endpoint

### Endpoint: GET `/api/v1/health`

**Response on success (HTTP 200):**

```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2026-05-20T10:30:00Z",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "stellar": "ok"
  }
}
```

**Response on degradation (HTTP 200 with degraded status):**

```json
{
  "status": "degraded",
  "version": "0.1.0",
  "timestamp": "2026-05-20T10:30:00Z",
  "checks": {
    "database": "ok",
    "redis": "unavailable",
    "stellar": "timeout"
  }
}
```

**Response on critical failure (HTTP 503):**

```json
{
  "status": "critical",
  "version": "0.1.0",
  "timestamp": "2026-05-20T10:30:00Z",
  "checks": {
    "database": "failed",
    "redis": "unavailable",
    "stellar": "unavailable"
  }
}
```

### Health Check Details

| Check       | What It Tests                                      | Timeout | Impact if Down              |
| ----------- | -------------------------------------------------- | ------- | --------------------------- |
| **database** | PostgreSQL connectivity; can connect and execute | 5s      | Critical — app cannot work   |
| **redis**   | Redis connectivity (if configured); cache status | 2s      | Degraded — rate limiting weak |
| **stellar** | Stellar RPC (Horizon) connectivity; can reach    | 3s      | Degraded — user ops blocked  |

### Monitoring the Health Check

#### Manual Polling (CLI)

```bash
# Check health once
curl -s http://localhost:4000/api/v1/health | jq .

# Poll every 10 seconds
watch -n 10 'curl -s http://localhost:4000/api/v1/health | jq .status'

# Alert if status != "ok"
while true; do
  status=$(curl -s http://localhost:4000/api/v1/health | jq -r '.status')
  if [[ "$status" != "ok" ]]; then
    echo "⚠️ Health check failed: $status"
    # Send alert
  fi
  sleep 30
done
```

#### Automated Monitoring (Docker/Kubernetes)

**Docker health check:**

```dockerfile
# In backend/Dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/api/v1/health || exit 1
```

**Kubernetes readiness/liveness probes:**

```yaml
# In Kubernetes manifest
spec:
  containers:
  - name: backend
    livenessProbe:
      httpGet:
        path: /api/v1/health
        port: 4000
      initialDelaySeconds: 10
      periodSeconds: 30
    readinessProbe:
      httpGet:
        path: /api/v1/health
        port: 4000
      initialDelaySeconds: 5
      periodSeconds: 10
```

#### Monitoring Service Integration (Datadog, New Relic, etc.)

```javascript
// Example: Datadog monitoring
const DatadogHttpClient = require('datadog-http-client');

const client = new DatadogHttpClient('https://cooplumen.org/api/v1/health');

setInterval(async () => {
  try {
    const response = await client.request('/');
    const data = JSON.parse(response.body);

    // Send metrics to Datadog
    statsd.gauge('cooplumen.health.status', data.status === 'ok' ? 1 : 0);
    statsd.gauge('cooplumen.health.database', data.checks.database === 'ok' ? 1 : 0);
    statsd.gauge('cooplumen.health.stellar', data.checks.stellar === 'ok' ? 1 : 0);
  } catch (error) {
    console.error('Health check failed:', error);
    statsd.gauge('cooplumen.health.reachable', 0);
  }
}, 30000); // Every 30 seconds
```

---

## Structured Logging

### Log Levels

| Level   | When to Use                                   | Example                                      |
| ------- | --------------------------------------------- | -------------------------------------------- |
| ERROR   | Operational failures; something broke         | Database connection lost; TX submission failed |
| WARN    | Unexpected but recoverable; watch for patterns | Rate limit exceeded; Horizon timeout          |
| INFO    | Normal operational events                     | Server started; user logged in               |
| DEBUG   | Detailed diagnostic info (dev only)           | SQL query executed; cache hit/miss            |

### Critical Events to Log

#### Application Startup

```
[INFO] CoopLumen API running on port 4000
[INFO] Database connected
[INFO] Redis connected (or: Redis unavailable; using in-process cache)
[INFO] Stellar network: mainnet
[INFO] Health check: all systems operational
```

#### Authentication & Authorization

```
[WARN] Rejected an operator request from a non-admin address
  address: GXXXXXX...
  path: /api/v1/tokens

[WARN] Admin addresses: ADMIN_ADDRESSES is unset; every operator route will reject with 403
```

#### Stellar Integration

```
[ERROR] Failed to submit transaction to Stellar
  error: Insufficient account balance
  account: GXXXXXX...
  amount: 100.00 XLM

[WARN] Horizon request failed (will retry)
  endpoint: https://horizon.stellar.org/accounts/GXXXXXX...
  status: 429
  retry_after: 2s
```

#### Database Issues

```
[ERROR] Database query failed
  query: SELECT * FROM communities WHERE id = $1
  error: Connection timeout after 2000ms

[WARN] Database pool running low
  active_connections: 9/10
  idle_connections: 1/10
```

#### Configuration Issues

```
[ERROR] Missing required environment variable: AUTH_SESSION_SECRET
[ERROR] Invalid STELLAR_NETWORK: "staging" (must be "testnet" or "mainnet")
[WARN] ADMIN_ADDRESSES is empty; operator routes will be blocked
```

### Logging Implementation

The backend uses Winston for structured logging:

```typescript
import { logger } from './utils/logger';

// Structured logging with context
logger.info('User logged in', {
  address: userAddress,
  communityId: communityId,
  timestamp: new Date().toISOString(),
});

logger.error('Transaction submission failed', {
  error: err.message,
  account: senderPublicKey,
  amount: transactionAmount,
  retries: 3,
});

logger.warn('Rate limit approaching', {
  endpoint: req.path,
  ip: req.ip,
  requests_per_minute: 95,
  limit: 100,
});
```

### Log Retention & Accessibility

**Development (Docker):**

```bash
# View logs in real-time
docker-compose logs -f backend

# View last 100 lines
docker-compose logs --tail 100 backend

# Save logs to file
docker-compose logs backend > backend.log
```

**Production (Kubernetes/VM):**

```bash
# Tail application logs
kubectl logs -f deployment/cooplumen-backend

# Stream to file for analysis
kubectl logs deployment/cooplumen-backend | tee backend-$(date +%s).log

# Archive logs daily
0 2 * * * docker exec cooplumen-backend sh -c 'cat /var/log/app.log' > /backup/logs/app-$(date +\%Y-\%m-\%d).log
```

---

## Metrics to Monitor

### Application Metrics

| Metric                           | Target          | Alert If...         |
| -------------------------------- | --------------- | ------------------- |
| **API availability**             | 99.9%+          | < 99.5% (over 1h)   |
| **Request latency (p99)**        | < 500ms         | > 1000ms (over 5m)  |
| **Error rate**                   | < 0.1%          | > 1% (over 5m)      |
| **Active connections**           | Varies          | > 90% of max pool   |
| **Memory usage**                 | Varies          | > 90% of limit      |

### Stellar-Specific Metrics

| Metric                           | Target          | Alert If...         |
| -------------------------------- | --------------- | ------------------- |
| **Horizon connectivity**         | 99%+            | Cannot reach API    |
| **Transaction success rate**     | > 98%           | < 95% (over 10m)    |
| **Average submission latency**   | < 3 seconds     | > 10 seconds (over 5m) |
| **Failed submissions**           | 0 per minute    | > 1 per minute      |

### Database Metrics

| Metric                           | Target          | Alert If...         |
| -------------------------------- | --------------- | ------------------- |
| **Connection pool utilization**  | 50–80%          | > 90% sustained     |
| **Query latency (p99)**          | < 100ms         | > 500ms (over 5m)   |
| **Failed connections**           | 0 per minute    | > 1 per minute      |
| **Slow queries**                 | Rare            | > 5 per minute      |

### Governance Contract Metrics

| Metric                           | Target          | Alert If...         |
| -------------------------------- | --------------- | ------------------- |
| **Proposal creation failures**   | 0 per minute    | > 1 per minute      |
| **Vote submission failures**     | 0 per minute    | > 1 per minute      |
| **Contract invocation latency**  | < 2 seconds     | > 5 seconds         |

---

## Alerting Guidelines

### Alert Policy

**Critical (Page on-call immediately):**
- Application crashed or not responding
- Database unavailable
- Stellar RPC unreachable
- High error rate (> 5% over 5 minutes)

**High (Investigate within 1 hour):**
- Memory usage > 85%
- Database connection pool exhausted
- Significant latency increase (2x baseline)
- Sustained elevated error rate (1–5%)

**Medium (Investigate within business hours):**
- Rate limiting actively blocking requests
- Cache misses causing increased DB load
- Non-critical dependency timeouts

**Low (Log and review in incident retrospective):**
- Deprecation warnings
- Non-critical configuration issues
- Performance optimization opportunities

### Manual Alert Setup (Bash Script)

```bash
#!/bin/bash
# monitor.sh — Simple health check script

ENDPOINT="http://localhost:4000/api/v1/health"
SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
ALERT_THRESHOLD=3  # Alert after 3 consecutive failures

consecutive_failures=0

while true; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$ENDPOINT")
  
  if [[ "$status" != "200" ]]; then
    ((consecutive_failures++))
    echo "❌ Health check failed (HTTP $status) — $consecutive_failures consecutive failures"
    
    if [[ $consecutive_failures -ge $ALERT_THRESHOLD ]]; then
      # Send alert to Slack
      curl -X POST "$SLACK_WEBHOOK" \
        -H 'Content-Type: application/json' \
        -d "{
          \"text\": \"🚨 CoopLumen API is down\",
          \"attachments\": [{
            \"color\": \"danger\",
            \"text\": \"Health check failed: HTTP $status\n$consecutive_failures consecutive failures\",
            \"ts\": $(date +%s)
          }]
        }"
      
      # Reset counter after alerting
      consecutive_failures=0
    fi
  else
    if [[ $consecutive_failures -gt 0 ]]; then
      echo "✅ Health check recovered"
      # Send recovery alert
      curl -X POST "$SLACK_WEBHOOK" \
        -H 'Content-Type: application/json' \
        -d "{
          \"text\": \"✅ CoopLumen API recovered\",
          \"attachments\": [{
            \"color\": \"good\",
            \"text\": \"Service is back online\",
            \"ts\": $(date +%s)
          }]
        }"
    fi
    consecutive_failures=0
  fi
  
  sleep 30  # Check every 30 seconds
done
```

**Run as systemd service:**

```ini
# /etc/systemd/system/cooplumen-monitor.service
[Unit]
Description=CoopLumen Health Monitor
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/monitor.sh
Restart=on-failure
User=cooplumen

[Install]
WantedBy=multi-user.target
```

---

## Incident Response

### When Alerts Fire

1. **Acknowledge** — Log into incident management tool; claim alert
2. **Assess** — Check health endpoint, logs, and metrics
3. **Triage** — Determine severity and impact
4. **Communicate** — Notify stakeholders if user-facing
5. **Remediate** — Apply fix or workaround
6. **Document** — Record incident and resolution

### Common Scenarios

#### Scenario: API Not Responding

```bash
# 1. Check if container is running
docker ps | grep cooplumen-backend

# 2. Check logs for crash
docker logs cooplumen-backend | tail -50

# 3. Check system resources
docker stats cooplumen-backend

# 4. Restart if needed
docker-compose restart backend

# 5. Verify recovery
curl http://localhost:4000/api/v1/health
```

#### Scenario: Stellar Connectivity Lost

```bash
# 1. Check if Horizon is reachable
curl -I https://horizon.stellar.org/

# 2. Check if network is configured correctly
echo $STELLAR_NETWORK  # Should be "mainnet" or "testnet"
echo $STELLAR_HORIZON_URL

# 3. Check if DNS resolves
nslookup horizon.stellar.org

# 4. If network changed unexpectedly:
#    - Update STELLAR_HORIZON_URL environment variable
#    - Restart backend
docker-compose restart backend
```

#### Scenario: Database Connection Failures

```bash
# 1. Test database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# 2. Check if database is running
docker ps | grep postgres

# 3. Check if connection pool is exhausted
# (In logs, look for "FATAL: remaining connection slots reserved" errors)

# 4. If pool exhausted:
#    - Reduce PGPOOL_MAX if misconfigured
#    - Add more connection pool capacity (horizontal scale)
#    - Restart backend
docker-compose restart backend
```

#### Scenario: High Error Rate

```bash
# 1. Check error logs
docker logs cooplumen-backend | grep ERROR | tail -20

# 2. Identify error pattern
#    - User input validation errors? (likely client bug)
#    - Database errors? (connection or query issue)
#    - Stellar errors? (network or transaction issue)

# 3. Fix root cause
#    - Deploy fix if code issue
#    - Scale up if resource constrained
#    - Wait for dependency recovery if external

# 4. Verify recovery
docker logs cooplumen-backend | tail -10  # Check logs are clean
curl http://localhost:4000/api/v1/health  # Health check green
```

---

## Monitoring Tools & Integrations

### Option 1: Datadog

Datadog provides APM, metrics, and alerting:

```bash
# Install Datadog agent
curl https://s3.amazonaws.com/dd-agent/scripts/install_agent.sh | bash -s -- --api-key $DD_API_KEY

# Tag application
docker run -e DD_TRACE_ENABLED=true \
  -e DD_SERVICE=cooplumen-backend \
  -e DD_ENV=production \
  cooplumen-backend:latest
```

### Option 2: New Relic

New Relic provides application monitoring:

```bash
# Install New Relic APM agent
npm install newrelic

# Add to backend/index.ts (first line)
require('newrelic');

# Configure with license key
export NEW_RELIC_LICENSE_KEY="xxxxx"
```

### Option 3: Prometheus + Grafana

Open-source metrics and visualization:

```bash
# Add Prometheus client to backend
npm install prom-client

# Expose metrics endpoint (GET /metrics)
# Configure Prometheus to scrape http://localhost:4000/metrics
# Visualize in Grafana
```

### Option 4: ELK Stack (Elasticsearch, Logstash, Kibana)

Open-source log aggregation:

```bash
# Stream backend logs to Logstash
docker-compose logs -f backend | nc logstash.internal 5000

# Query logs in Kibana
# Create dashboards for critical events
```

---

## Runbooks

### Runbook: High CPU Usage

**Symptoms:** Application running slow; CPU 90%+

**Investigation:**

```bash
# 1. Identify hot functions
docker exec cooplumen-backend node --prof index.js
node --prof-process isolate-*.log > profile.txt

# 2. Check memory leaks
docker stats --no-stream cooplumen-backend

# 3. Review recent changes
git log --oneline -n 20
```

**Resolution:**
- Optimize hot code path
- Scale horizontally (add more instances)
- Increase CPU allocation (vertical scale)

### Runbook: Memory Leak

**Symptoms:** Memory usage grows over time; never released

**Investigation:**

```bash
# 1. Enable heap snapshots
# 2. Compare snapshots over time
# 3. Identify unreleased objects

# Take heap snapshot
kill -USR2 <backend-pid>  # Sends signal to Node.js

# Analyze in Chrome DevTools
# chrome://inspect -> nodejs process
```

**Resolution:**
- Fix memory leak in code (dangling references)
- Restart service periodically as workaround
- Implement pooling for frequently allocated objects

### Runbook: High Database Connection Count

**Symptoms:** "Too many connections" errors; app crashes

**Investigation:**

```bash
# 1. Count active connections
docker exec postgres psql -U cooplumen -d cooplumen \
  -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# 2. Identify long-running queries
docker exec postgres psql -U cooplumen -d cooplumen \
  -c "SELECT pid, now() - query_start, query FROM pg_stat_activity WHERE state != 'idle';"
```

**Resolution:**
- Increase PGPOOL_MAX (if connections legitimately needed)
- Optimize slow queries
- Implement connection pooling (e.g., PgBouncer)
- Scale horizontally

---

## References

- [Winston Logging (Node.js)](https://github.com/winstonjs/winston)
- [Datadog Documentation](https://docs.datadoghq.com/)
- [Prometheus Monitoring](https://prometheus.io/)
- [ELK Stack](https://www.elastic.co/what-is/elk-stack)
