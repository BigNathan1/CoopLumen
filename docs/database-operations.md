# Running PostgreSQL

How the backend connects to PostgreSQL, and how to validate, back up and tune
the database. The schema itself is described in [database.md](database.md).

## Connections

The backend connects through PgBouncer, which pools connections in front of
PostgreSQL. In `docker-compose.yml`:

```yaml
DATABASE_URL: postgresql://cooplumen:cooplumen@pgbouncer:6432/cooplumen # through PgBouncer
DATABASE_DIRECT_URL: postgresql://cooplumen:cooplumen@db:5432/cooplumen # direct, bypassing PgBouncer
```

Use `DATABASE_DIRECT_URL` when PgBouncer is unavailable, and for operations
PgBouncer's transaction pooling does not support.

The backend's own pool (`backend/src/db/index.ts`) is configured with:

| Variable                    | Default | Meaning                                       |
| --------------------------- | ------- | --------------------------------------------- |
| `PGPOOL_MAX`                | `10`    | Maximum connections in the pool               |
| `PGPOOL_IDLE_TIMEOUT`       | `30000` | Milliseconds before an idle connection closes |
| `PGPOOL_CONNECTION_TIMEOUT` | `2000`  | Milliseconds to wait for a connection         |

The pool logs its settings on startup:

```
Database pool initialised { maxConnections: 10, idleTimeoutMs: 30000, connectionTimeoutMs: 2000, environment: 'development' }
```

## Foreign keys

Every foreign key declares its `ON DELETE` behaviour explicitly; the reasoning
for each is in [database.md](database.md). To check a database:

```bash
./scripts/db/validate-fk.sh         # Linux, macOS, WSL
scripts\db\validate-fk.bat          # Windows
```

The script warns about constraints left on the default `NO ACTION`/`RESTRICT`
and about foreign keys without a supporting index.

## Backups

```bash
./scripts/db/backup-db.sh                    # into the default directory
./scripts/db/backup-db.sh /path/to/backups   # into a chosen directory
```

Backups use PostgreSQL's custom format (`-Fc`), are named by timestamp, and the
ten most recent are kept. The script reads `DATABASE_URL` from the environment
or `backend/.env` and never prints the password. Schedule it in production, for
example daily at 02:00:

```bash
0 2 * * * /path/to/cooplumen/scripts/db/backup-db.sh /backup/storage
```

## Upgrading a local database from PostgreSQL 16 to 18

The Compose stack runs PostgreSQL 18. A major version cannot open a data
directory written by an older one, so the stack keeps 18's data in a new
volume, `pg18_data`, and leaves the old `pg_data` volume untouched. Moving
existing data across is a dump and restore. On a fresh checkout there is
nothing to move.

1. Before pulling the upgrade, with the old stack still running, dump
   everything:

   ```bash
   docker compose exec -T db pg_dumpall -U cooplumen > cooplumen-pg16.sql
   ```

   If you have already pulled it, check out the previous commit, start only
   the database (`docker compose up -d db`), dump, then return to `main`.

2. Start PostgreSQL 18; it initialises the empty `pg18_data` volume:

   ```bash
   docker compose up -d db
   ```

3. Restore the dump into it:

   ```bash
   docker compose exec -T db psql -U cooplumen -d postgres < cooplumen-pg16.sql
   ```

4. Start the rest of the stack and check the data. Once satisfied, remove the
   old volume (`docker volume ls` shows its full name, such as
   `cooplumen_pg_data`):

   ```bash
   docker volume rm cooplumen_pg_data
   ```

Production databases are not part of the Compose stack; upgrade them with the
hosting provider's major-version upgrade, after a backup.

## Sizing for production

Raise the pool and PgBouncer limits together with traffic:

```bash
PGPOOL_MAX=50
PGPOOL_IDLE_TIMEOUT=60000
PGPOOL_CONNECTION_TIMEOUT=5000

# PgBouncer, set in docker-compose.yml
PGBOUNCER_MAX_CLIENT_CONN=200
PGBOUNCER_DEFAULT_POOL_SIZE=50
PGBOUNCER_MAX_DB_CONNECTIONS=100
```

Watch active connections against pool size, connection wait times, idle
timeouts and PgBouncer queue depth.

## Troubleshooting

| Symptom                          | What to do                                                |
| -------------------------------- | --------------------------------------------------------- |
| Cannot connect through PgBouncer | Connect with `DATABASE_DIRECT_URL`                        |
| Pool exhausted                   | Raise `PGPOOL_MAX` or reduce concurrency                  |
| Connection timeouts              | Raise `PGPOOL_CONNECTION_TIMEOUT`                         |
| Foreign key warnings             | Run `validate-fk.sh` and fix the reported constraints     |
| Migrations conflict              | Migrations apply in filename order; test them on staging  |
| Backup: permission denied        | Give the backup user write access to the target directory |
| Backup: database not found       | Check `DATABASE_URL` points at the right database         |
| Backup: disk full                | Monitor the backup directory; retention keeps ten files   |
