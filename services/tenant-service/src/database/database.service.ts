import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.pool = new Pool({
      connectionString: this.configService.get('DATABASE_URL'),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Test connection
    try {
      const client = await this.pool.connect();
      this.logger.log('✅ Database connected successfully');
      client.release();
    } catch (error) {
      this.logger.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('Database pool closed');
  }

  /**
   * Execute a query with optional tenant context
   */
  async query<T = any>(
    text: string,
    params?: any[],
    tenantId?: string,
  ): Promise<QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      // Set tenant context if provided (for RLS)
      if (tenantId) {
        await client.query(`SET app.current_tenant_id = '${tenantId}'`);
      }

      const result = await client.query<T>(text, params);
      return result;
    } catch (error) {
      this.logger.error('Query error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a single query and return first row or null
   */
  async queryOne<T = any>(
    text: string,
    params?: any[],
    tenantId?: string,
  ): Promise<T | null> {
    const result = await this.query<T>(text, params, tenantId);
    return result.rows[0] || null;
  }

  /**
   * Execute a query and return all rows
   */
  async queryMany<T = any>(text: string, params?: any[], tenantId?: string): Promise<T[]> {
    const result = await this.query<T>(text, params, tenantId);
    return result.rows;
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    tenantId?: string,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Set tenant context if provided
      if (tenantId) {
        await client.query(`SET app.current_tenant_id = '${tenantId}'`);
      }

      const result = await callback(client);

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Transaction error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Insert a record and return the inserted row
   */
  async insert<T = any>(
    table: string,
    data: Record<string, any>,
    tenantId?: string,
  ): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const query = `
      INSERT INTO ${table} (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    return this.queryOne<T>(query, values, tenantId);
  }

  /**
   * Update a record by ID and return the updated row
   */
  async update<T = any>(
    table: string,
    id: string,
    data: Record<string, any>,
    tenantId?: string,
  ): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');

    const query = `
      UPDATE ${table}
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    return this.queryOne<T>(query, [id, ...values], tenantId);
  }

  /**
   * Delete a record by ID
   */
  async delete(table: string, id: string, tenantId?: string): Promise<void> {
    const query = `DELETE FROM ${table} WHERE id = $1`;
    await this.query(query, [id], tenantId);
  }

  /**
   * Find one record by criteria
   */
  async findOne<T = any>(
    table: string,
    where: Record<string, any>,
    tenantId?: string,
  ): Promise<T | null> {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');

    const query = `SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`;
    return this.queryOne<T>(query, values, tenantId);
  }

  /**
   * Find many records by criteria
   */
  async findMany<T = any>(
    table: string,
    where: Record<string, any> = {},
    orderBy?: string,
    tenantId?: string,
  ): Promise<T[]> {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys.length
      ? 'WHERE ' + keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ')
      : '';
    const orderClause = orderBy ? `ORDER BY ${orderBy}` : '';

    const query = `SELECT * FROM ${table} ${whereClause} ${orderClause}`;
    return this.queryMany<T>(query, values, tenantId);
  }

  /**
   * Count records
   */
  async count(table: string, where: Record<string, any> = {}, tenantId?: string): Promise<number> {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys.length
      ? 'WHERE ' + keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ')
      : '';

    const query = `SELECT COUNT(*) as count FROM ${table} ${whereClause}`;
    const result = await this.queryOne<{ count: string }>(query, values, tenantId);
    return parseInt(result?.count || '0', 10);
  }

  /**
   * Check if record exists
   */
  async exists(table: string, where: Record<string, any>, tenantId?: string): Promise<boolean> {
    const count = await this.count(table, where, tenantId);
    return count > 0;
  }
}
