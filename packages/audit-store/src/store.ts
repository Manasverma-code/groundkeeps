import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import initSqlJs from 'sql.js';
import type { AuditEntry, PolicyEvaluation } from '@trust-layer/shared';

export interface AuditAppendRequest {
  agent_id: string;
  action: string;
  resource: string;
  policy_eval: PolicyEvaluation;
  payload_hash: string;
}

export interface AuditQuery {
  agent_id?: string;
  action?: string;
  resource?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

interface DbRow {
  audit_id: string;
  timestamp: string;
  agent_id: string;
  action: string;
  resource: string;
  policy_eval: string;
  payload_hash: string;
  prev_hash: string;
  hash: string;
}

export class AuditStore {
  private db: import('sql.js').Database;
  private dbPath: string;

  private constructor(db: import('sql.js').Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
    this.db.run('PRAGMA journal_mode = WAL');
    this.initSchema();
  }

  static async create(dbPath: string = ':memory:'): Promise<AuditStore> {
    const SQL = await initSqlJs();
    let db: import('sql.js').Database;

    if (dbPath === ':memory:') {
      db = new SQL.Database();
    } else if (existsSync(dbPath)) {
      const buffer = readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    return new AuditStore(db, dbPath);
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        audit_id    TEXT PRIMARY KEY,
        timestamp   TEXT NOT NULL,
        agent_id    TEXT NOT NULL,
        action      TEXT NOT NULL,
        resource    TEXT NOT NULL,
        policy_eval TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        prev_hash   TEXT NOT NULL,
        hash        TEXT NOT NULL
      )
    `);

    this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_agent   ON audit_log(agent_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_time    ON audit_log(timestamp)');
  }

  append(request: AuditAppendRequest): AuditEntry {
    const audit_id = randomUUID();
    const timestamp = new Date().toISOString();
    const prev_hash = this.getLatestHash();

    const entryBase: Omit<AuditEntry, 'hash'> = {
      audit_id,
      timestamp,
      agent_id: request.agent_id,
      action: request.action,
      resource: request.resource,
      policy_eval: request.policy_eval,
      payload_hash: request.payload_hash,
      prev_hash,
    };

    const hash = this.computeHash(entryBase);

    this.db.run(
      `INSERT INTO audit_log (audit_id, timestamp, agent_id, action, resource,
                              policy_eval, payload_hash, prev_hash, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [audit_id, timestamp, request.agent_id, request.action, request.resource,
       JSON.stringify(request.policy_eval), request.payload_hash, prev_hash, hash],
    );

    this.flush();

    return { ...entryBase, hash };
  }

  query(params: AuditQuery): AuditEntry[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.agent_id) {
      conditions.push('agent_id = ?');
      values.push(params.agent_id);
    }
    if (params.action) {
      conditions.push('action = ?');
      values.push(params.action);
    }
    if (params.resource) {
      conditions.push('resource = ?');
      values.push(params.resource);
    }
    if (params.since) {
      conditions.push('timestamp >= ?');
      values.push(params.since);
    }
    if (params.until) {
      conditions.push('timestamp <= ?');
      values.push(params.until);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(params.limit ?? 50, 1000);
    const offset = params.offset ?? 0;

    const query = `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    const results = this.db.exec(query, [...values, limit, offset]);

    return this.mapRows(results);
  }

  getByAuditId(audit_id: string): AuditEntry | null {
    const results = this.db.exec('SELECT * FROM audit_log WHERE audit_id = ?', [audit_id]);
    return this.mapRows(results)[0] ?? null;
  }

  count(params: Omit<AuditQuery, 'limit' | 'offset'>): number {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.agent_id) {
      conditions.push('agent_id = ?');
      values.push(params.agent_id);
    }
    if (params.action) {
      conditions.push('action = ?');
      values.push(params.action);
    }
    if (params.resource) {
      conditions.push('resource = ?');
      values.push(params.resource);
    }
    if (params.since) {
      conditions.push('timestamp >= ?');
      values.push(params.since);
    }
    if (params.until) {
      conditions.push('timestamp <= ?');
      values.push(params.until);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const results = this.db.exec(`SELECT COUNT(*) as count FROM audit_log ${where}`, values);
    if (results.length === 0 || results[0].values.length === 0) return 0;
    return results[0].values[0][0] as number;
  }

  verifyChain(): { valid: boolean; firstEntry: string | null; lastEntry: string | null; brokenAt: string | null } {
    const results = this.db.exec('SELECT * FROM audit_log ORDER BY ROWID ASC');
    const rows = this.mapRows(results);

    if (rows.length === 0) {
      return { valid: true, firstEntry: null, lastEntry: null, brokenAt: null };
    }

    if (rows[0].prev_hash !== '') {
      return { valid: false, firstEntry: rows[0].audit_id, lastEntry: null, brokenAt: rows[0].audit_id };
    }

    for (let i = 1; i < rows.length; i++) {
      if (rows[i].prev_hash !== rows[i - 1].hash) {
        return {
          valid: false,
          firstEntry: rows[0].audit_id,
          lastEntry: rows[rows.length - 1].audit_id,
          brokenAt: rows[i].audit_id,
        };
      }
    }

    return {
      valid: true,
      firstEntry: rows[0].audit_id,
      lastEntry: rows[rows.length - 1].audit_id,
      brokenAt: null,
    };
  }

  close(): void {
    this.flush();
    this.db.close();
  }

  private flush(): void {
    if (this.dbPath !== ':memory:') {
      const data = this.db.export();
      writeFileSync(this.dbPath, Buffer.from(data));
    }
  }

  private getLatestHash(): string {
    const results = this.db.exec('SELECT hash FROM audit_log ORDER BY ROWID DESC LIMIT 1');
    if (results.length === 0 || results[0].values.length === 0) return '';
    return results[0].values[0][0] as string;
  }

  private computeHash(entry: Omit<AuditEntry, 'hash'>): string {
    const data = `${entry.audit_id}|${entry.timestamp}|${entry.agent_id}|${entry.action}|${entry.resource}|${JSON.stringify(entry.policy_eval)}|${entry.payload_hash}|${entry.prev_hash}`;
    return createHash('sha256').update(data).digest('hex');
  }

  private mapRows(results: { columns: string[]; values: unknown[][] }[]): AuditEntry[] {
    if (results.length === 0) return [];
    const { columns, values } = results[0];
    return values.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return {
        audit_id: obj.audit_id as string,
        timestamp: obj.timestamp as string,
        agent_id: obj.agent_id as string,
        action: obj.action as string,
        resource: obj.resource as string,
        policy_eval: JSON.parse(obj.policy_eval as string) as PolicyEvaluation,
        payload_hash: obj.payload_hash as string,
        prev_hash: obj.prev_hash as string,
        hash: obj.hash as string,
      };
    });
  }
}
