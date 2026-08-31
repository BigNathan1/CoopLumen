# PostgreSQL Infrastructure Hardening

## Overview

This document summarizes the PostgreSQL infrastructure hardening updates implemented for CoopLumen backend production readiness.

## Changes Implemented

### 1. PostgreSQL Connection Pool Configuration

**File**: `backend/src/db/index.ts`

- Updated pool configuration to use environment variables:
  - `PGPOOL_MAX`: Maximum connections in pool (default: 10)
  - `PGPOOL_IDLE_TIMEOUT`: Idle timeout in milliseconds (default: 30000)
  - `PGPOOL_CONNECTION_TIMEOUT`: Connection timeout in milliseconds (default: 2000)
- Added enhanced logging showing pool configuration on startup
- Maintains backward compatibility with safe defaults

### 2. Foreign Key Constraint Validation and Fixes

**Migration**: `backend/src/db/migrations/019_fix_loan_foreign_key.sql`

- Fixed `loans.community_id` foreign key to use explicit `ON DELETE CASCADE`
- Previously defaulted to `RESTRICT`, preventing community deletion with loans
- Migration is idempotent and safe for existing databases

**Validation Script**: `scripts/validate-fk.sh` / `scripts/validate-fk.bat`

- Validates all foreign key constraints have explicit ON DELETE behaviors
- Reports warnings for constraints using default NO ACTION/RESTRICT
- Provides performance recommendations for missing indexes

### 3. Documentation Updates

**File**: `docs/database.md`

- Updated foreign key summary table with complete ON DELETE behaviors
- Added design rationale section explaining CASCADE vs SET NULL decisions
- Added connection pooling guidelines and backup procedures

### 4. PgBouncer Configuration

**File**: `docker-compose.yml`

- Enhanced PgBouncer configuration with additional parameters:
  - `PGBOUNCER_MAX_DB_CONNECTIONS`: Maximum backend connections (50)
  - `PGBOUNCER_MIN_POOL_SIZE`: Minimum pool size (5)
- Updated backend service to connect through PgBouncer (port 6432)
- Added direct connection fallback as `DATABASE_DIRECT_URL`
- Added comprehensive comments explaining configuration options

### 5. Backup Script Enhancement

**File**: `scripts/backup-db.sh`

- Already implemented with production-ready features:
  - PostgreSQL custom format (`-Fc`) for efficient compression
  - Automatic retention policy (keeps 10 most recent backups)
  - Environment variable support with `.env` file loading
  - Timestamped backup filenames
  - Error handling with strict mode (`set -Eeuo pipefail`)

## Environment Variables

### New Variables

```bash
# PostgreSQL Pool Configuration
PGPOOL_MAX=10                    # Maximum number of connections in pool
PGPOOL_IDLE_TIMEOUT=30000       # Idle connection timeout in milliseconds (30s)
PGPOOL_CONNECTION_TIMEOUT=2000  # Connection timeout in milliseconds (2s)
```

### Updated Variables in docker-compose.yml

```yaml
# Backend service environment
DATABASE_URL: postgresql://cooplumen:cooplumen@pgbouncer:6432/cooplumen # Through PgBouncer
DATABASE_DIRECT_URL: postgresql://cooplumen:cooplumen@db:5432/cooplumen # Direct fallback
PGPOOL_MAX: ${PGPOOL_MAX:-10}
PGPOOL_IDLE_TIMEOUT: ${PGPOOL_IDLE_TIMEOUT:-30000}
PGPOOL_CONNECTION_TIMEOUT: ${PGPOOL_CONNECTION_TIMEOUT:-2000}
```

## Validation Checklist

### PostgreSQL Pool Configuration

- [x] Pool initializes with environment variables
- [x] Safe defaults provided when variables not set
- [x] Enhanced logging shows configuration on startup
- [x] No breaking API changes

### Foreign Key Constraints

- [x] All foreign keys have explicit ON DELETE behaviors
- [x] `loans.community_id` fixed to use `ON DELETE CASCADE`
- [x] Documentation updated with complete foreign key summary
- [x] Validation script available for verification

### PgBouncer

- [x] Configured with production-ready settings
- [x] Backend connects through PgBouncer
- [x] Health checks implemented
- [x] Proper restart policies
- [x] Network isolation maintained

### Backup Script

- [x] Uses PostgreSQL custom format (`-Fc`)
- [x] Automatic retention policy (10 backups)
- [x] Error handling and exit codes
- [x] Environment variable support
- [x] No password exposure in logs

### Documentation

- [x] ON DELETE behaviors documented
- [x] Design rationale explained
- [x] Connection pooling guidelines
- [x] Backup and restore procedures

### Migration Safety

- [x] All migrations remain idempotent
- [x] No destructive operations
- [x] Existing data preserved
- [x] Backward compatibility maintained

## Usage Instructions

### 1. Validate Foreign Key Constraints

```bash
# Using bash (Linux/macOS/WSL)
./scripts/validate-fk.sh

# Using batch (Windows)
scripts\validate-fk.bat
```

### 2. Run Database Backups

```bash
./scripts/backup-db.sh
# Optional: specify output directory
./scripts/backup-db.sh /path/to/backups
```

### 3. Start Infrastructure with Docker Compose

```bash
docker-compose up -d
```

### 4. View Pool Configuration

Check backend logs to see pool initialization:

```
Database pool initialised { maxConnections: 10, idleTimeoutMs: 30000, connectionTimeoutMs: 2000, environment: 'development' }
```

## Production Considerations

### Connection Pool Sizing

Adjust pool settings based on workload:

```bash
# High-traffic production
PGPOOL_MAX=50
PGPOOL_IDLE_TIMEOUT=60000  # 60 seconds
PGPOOL_CONNECTION_TIMEOUT=5000  # 5 seconds

# PgBouncer (adjust in docker-compose.yml)
PGBOUNCER_MAX_CLIENT_CONN=200
PGBOUNCER_DEFAULT_POOL_SIZE=50
PGBOUNCER_MAX_DB_CONNECTIONS=100
```

### Backup Scheduling

Schedule regular backups in production:

```bash
# Daily backup via cron
0 2 * * * /path/to/cooplumen/scripts/backup-db.sh /backup/storage
```

### Monitoring

Monitor connection pool metrics:

- Active connections vs pool size
- Connection wait times
- Idle timeout frequency
- PgBouncer queue depth

## Troubleshooting

### Connection Issues

1. **Cannot connect through PgBouncer**: Use `DATABASE_DIRECT_URL` as fallback
2. **Pool exhaustion**: Increase `PGPOOL_MAX` or adjust application concurrency
3. **Timeout errors**: Increase `PGPOOL_CONNECTION_TIMEOUT`

### Migration Issues

1. **Foreign key validation warnings**: Run validation script to identify issues
2. **Migration conflicts**: Ensure migrations are applied in filename order
3. **Data integrity concerns**: Always test migrations in staging first

### Backup Issues

1. **Permission denied**: Ensure write access to backup directory
2. **Database not found**: Verify `DATABASE_URL` points to correct database
3. **Insufficient disk space**: Monitor backup directory size
