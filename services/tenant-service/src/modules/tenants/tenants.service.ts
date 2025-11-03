import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Tenant, TenantWithRelations } from '../../types/tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

import { UpdateLlmConfigDto } from './dto/update-llm-config.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly db: DatabaseService) {}

  async create(createTenantDto: CreateTenantDto): Promise<Tenant> {
    // Check if slug already exists
    const existing = await this.db.queryOne<Tenant>(
      'SELECT id FROM tenants WHERE slug = $1',
      [createTenantDto.slug],
    );

    if (existing) {
      throw new ConflictException(`Tenant with slug '${createTenantDto.slug}' already exists`);
    }

    // Insert tenant
    const tenant = await this.db.queryOne<Tenant>(
      `INSERT INTO tenants (name, slug, contact_email, llm_tone, firebase_tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        createTenantDto.name,
        createTenantDto.slug,
        createTenantDto.contactEmail || null,
        JSON.stringify(createTenantDto.llmTone || { tone: 'professional' }),
        createTenantDto.firebaseTenantId || null,
      ],
    );

    return tenant;
  }

  async findAll(tenantId: string): Promise<TenantWithRelations[]> {
    const query = `
      SELECT
        t.*,
        COALESCE(
          (SELECT JSON_AGG(o.*) FROM outlets o WHERE o.tenant_id = t.id),
          '[]'::json
        ) as outlets,
        COALESCE(
          (SELECT JSON_AGG(u.*) FROM users u WHERE u.tenant_id = t.id),
          '[]'::json
        ) as users
      FROM tenants t
      WHERE t.id = $1
      ORDER BY t.created_at DESC
    `;

    const tenants = await this.db.queryMany<TenantWithRelations>(query, [tenantId]);
    return tenants;
  }

  async findOne(id: string, tenantId: string): Promise<TenantWithRelations> {
    const query = `
      SELECT
        t.*,
        COALESCE(
          (SELECT JSON_AGG(o.*) FROM outlets o WHERE o.tenant_id = t.id),
          '[]'::json
        ) as outlets,
        COALESCE(
          (SELECT JSON_AGG(u.*) FROM users u WHERE u.tenant_id = t.id),
          '[]'::json
        ) as users
      FROM tenants t
      WHERE t.id = $1 AND t.id = $2
    `;

    const tenant = await this.db.queryOne<TenantWithRelations>(query, [id, tenantId]);

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${id}' not found`);
    }

    return tenant;
  }

  async findBySlug(slug: string): Promise<TenantWithRelations> {
    const query = `
      SELECT
        t.*,
        COALESCE(
          (SELECT JSON_AGG(o.*) FROM outlets o WHERE o.tenant_id = t.id),
          '[]'::json
        ) as outlets,
        COALESCE(
          (SELECT JSON_AGG(u.*) FROM users u WHERE u.tenant_id = t.id),
          '[]'::json
        ) as users
      FROM tenants t
      WHERE t.slug = $1
    `;

    const tenant = await this.db.queryOne<TenantWithRelations>(query, [slug]);

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug '${slug}' not found`);
    }

    return tenant;
  }

  async update(id: string, updateTenantDto: UpdateTenantDto, tenantId: string): Promise<Tenant> {
    // Check if tenant exists and belongs to current tenant
    const existing = await this.db.queryOne<Tenant>(
      'SELECT * FROM tenants WHERE id = $1 AND id = $2',
      [id, tenantId],
    );

    if (!existing) {
      throw new NotFoundException(`Tenant with ID '${id}' not found`);
    }

    // Check slug conflict if slug is being updated
    if (updateTenantDto.slug && updateTenantDto.slug !== existing.slug) {
      const slugExists = await this.db.queryOne<Tenant>(
        'SELECT id FROM tenants WHERE slug = $1 AND id != $2',
        [updateTenantDto.slug, id],
      );

      if (slugExists) {
        throw new ConflictException(`Tenant with slug '${updateTenantDto.slug}' already exists`);
      }
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updateTenantDto.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(updateTenantDto.name);
    }

    if (updateTenantDto.slug !== undefined) {
      updates.push(`slug = $${paramCount++}`);
      values.push(updateTenantDto.slug);
    }

    if (updateTenantDto.contactEmail !== undefined) {
      updates.push(`contact_email = $${paramCount++}`);
      values.push(updateTenantDto.contactEmail);
    }

    if (updateTenantDto.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(updateTenantDto.status);
    }

    if (updateTenantDto.llmTone !== undefined) {
      updates.push(`llm_tone = $${paramCount++}`);
      values.push(JSON.stringify(updateTenantDto.llmTone));
    }

    if (updateTenantDto.firebaseTenantId !== undefined) {
      updates.push(`firebase_tenant_id = $${paramCount++}`);
      values.push(updateTenantDto.firebaseTenantId);
    }

    if (updates.length === 0) {
      return existing;
    }

    // Add updated_at
    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE tenants
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND id = $${paramCount + 1}
      RETURNING *
    `;

    values.push(tenantId);
    const tenant = await this.db.queryOne<Tenant>(query, values);
    return tenant;
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const tenant = await this.db.queryOne<Tenant>(
      'SELECT id FROM tenants WHERE id = $1 AND id = $2',
      [id, tenantId],
    );

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${id}' not found`);
    }

    await this.db.query('DELETE FROM tenants WHERE id = $1 AND id = $2', [id, tenantId]);
  }

  async updateLlmConfig(id: string, llmConfigDto: UpdateLlmConfigDto, tenantId: string): Promise<Tenant> {
    const tenant = await this.db.queryOne<Tenant>(
      'SELECT id FROM tenants WHERE id = $1 AND id = $2',
      [id, tenantId],
    );

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${id}' not found`);
    }

    const updated = await this.db.queryOne<Tenant>(
      `UPDATE tenants
       SET llm_tone = $1, updated_at = NOW()
       WHERE id = $2 AND id = $3
       RETURNING *`,
      [JSON.stringify(llmConfigDto), id, tenantId],
    );

    return updated;
  }
}
