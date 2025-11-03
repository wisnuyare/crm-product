import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Outlet } from '../../types/tenant.entity';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { QuotaService } from '../quota/quota.service';

@Injectable()
export class OutletsService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => QuotaService))
    private readonly quotaService: QuotaService,
  ) {}

  async create(createOutletDto: CreateOutletDto): Promise<Outlet> {
    // ✅ Check quota limit before creating outlet
    try {
      await this.quotaService.checkOutletLimit(createOutletDto.tenantId);
    } catch (error) {
      // QuotaService will throw ForbiddenException if limit reached
      throw error;
    }

    // Check if phone number already exists
    const existing = await this.db.queryOne<Outlet>(
      'SELECT id FROM outlets WHERE waba_phone_number = $1',
      [createOutletDto.wabaPhoneNumber],
    );

    if (existing) {
      throw new ConflictException(
        `Outlet with phone number '${createOutletDto.wabaPhoneNumber}' already exists`,
      );
    }

    // Insert outlet
    const outlet = await this.db.queryOne<Outlet>(
      `INSERT INTO outlets (
        tenant_id, name, waba_phone_number, waba_phone_number_id,
        waba_business_account_id, waba_access_token
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        createOutletDto.tenantId,
        createOutletDto.name,
        createOutletDto.wabaPhoneNumber,
        createOutletDto.wabaPhoneNumberId,
        createOutletDto.wabaBusinessAccountId,
        createOutletDto.wabaAccessToken,
      ],
    );

    return outlet;
  }

  async findAll(tenantId: string): Promise<Outlet[]> {
    const outlets = await this.db.queryMany<Outlet>(
      'SELECT * FROM outlets WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return outlets;
  }

  async findByTenant(tenantId: string): Promise<Outlet[]> {
    const outlets = await this.db.queryMany<Outlet>(
      'SELECT * FROM outlets WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return outlets;
  }

  async findOne(id: string, tenantId: string): Promise<Outlet> {
    const outlet = await this.db.queryOne<Outlet>(
      'SELECT * FROM outlets WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );

    if (!outlet) {
      throw new NotFoundException(`Outlet with ID '${id}' not found`);
    }

    return outlet;
  }

  async update(id: string, updateOutletDto: UpdateOutletDto, tenantId: string): Promise<Outlet> {
    // Check if outlet exists and belongs to tenant
    const existing = await this.db.queryOne<Outlet>(
      'SELECT * FROM outlets WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );

    if (!existing) {
      throw new NotFoundException(`Outlet with ID '${id}' not found`);
    }

    // Check phone number conflict if being updated
    if (
      updateOutletDto.wabaPhoneNumber &&
      updateOutletDto.wabaPhoneNumber !== existing.waba_phone_number
    ) {
      const phoneExists = await this.db.queryOne<Outlet>(
        'SELECT id FROM outlets WHERE waba_phone_number = $1 AND id != $2',
        [updateOutletDto.wabaPhoneNumber, id],
      );

      if (phoneExists) {
        throw new ConflictException(
          `Outlet with phone number '${updateOutletDto.wabaPhoneNumber}' already exists`,
        );
      }
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updateOutletDto.tenantId !== undefined) {
      updates.push(`tenant_id = $${paramCount++}`);
      values.push(updateOutletDto.tenantId);
    }

    if (updateOutletDto.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(updateOutletDto.name);
    }

    if (updateOutletDto.wabaPhoneNumber !== undefined) {
      updates.push(`waba_phone_number = $${paramCount++}`);
      values.push(updateOutletDto.wabaPhoneNumber);
    }

    if (updateOutletDto.wabaPhoneNumberId !== undefined) {
      updates.push(`waba_phone_number_id = $${paramCount++}`);
      values.push(updateOutletDto.wabaPhoneNumberId);
    }

    if (updateOutletDto.wabaBusinessAccountId !== undefined) {
      updates.push(`waba_business_account_id = $${paramCount++}`);
      values.push(updateOutletDto.wabaBusinessAccountId);
    }

    if (updateOutletDto.wabaAccessToken !== undefined) {
      updates.push(`waba_access_token = $${paramCount++}`);
      values.push(updateOutletDto.wabaAccessToken);
    }

    if (updateOutletDto.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(updateOutletDto.status);
    }

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);

    const query = `
      UPDATE outlets
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const outlet = await this.db.queryOne<Outlet>(query, values);
    return outlet;
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const outlet = await this.db.queryOne<Outlet>(
      'SELECT id FROM outlets WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );

    if (!outlet) {
      throw new NotFoundException(`Outlet with ID '${id}' not found`);
    }

    await this.db.query('DELETE FROM outlets WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  }
}
