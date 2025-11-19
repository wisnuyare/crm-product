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
import { CryptoService } from '../../crypto/crypto.service';

interface SanitizedOutlet
  extends Omit<
    Outlet,
    | 'waba_access_token'
  > {
  has_waba_access_token: boolean;
}

type OutletResponse = SanitizedOutlet | (SanitizedOutlet & { waba_access_token: string });

@Injectable()
export class OutletsService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => QuotaService))
    private readonly quotaService: QuotaService,
    private readonly cryptoService: CryptoService,
  ) {}

  async create(createOutletDto: CreateOutletDto): Promise<OutletResponse> {
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

    if (!createOutletDto.wabaAccessToken) {
      throw new BadRequestException('WABA access token is required');
    }

    // Encrypt WABA access token
    const encryptedToken = this.cryptoService.encrypt(createOutletDto.wabaAccessToken);

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
        encryptedToken,
      ],
    );

    return this.buildOutletResponse(outlet, false);
  }

  async findAll(tenantId: string): Promise<OutletResponse[]> {
    const outlets = await this.db.queryMany<Outlet>(
      'SELECT * FROM outlets WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return outlets.map((outlet) => this.buildOutletResponse(outlet, false));
  }

  async findByTenant(tenantId: string): Promise<OutletResponse[]> {
    const outlets = await this.db.queryMany<Outlet>(
      'SELECT * FROM outlets WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return outlets.map((outlet) => this.buildOutletResponse(outlet, false));
  }

  async findOne(id: string, tenantId: string, includeSecret = false): Promise<OutletResponse> {
    const outlet = await this.db.queryOne<Outlet>(
      'SELECT * FROM outlets WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );

    if (!outlet) {
      throw new NotFoundException(`Outlet with ID '${id}' not found`);
    }

    return this.buildOutletResponse(outlet, includeSecret);
  }

  async findByPhoneNumberId(phoneNumberId: string): Promise<OutletResponse> {
    const outlet = await this.db.queryOne<Outlet>(
      'SELECT * FROM outlets WHERE waba_phone_number_id = $1',
      [phoneNumberId],
    );

    if (!outlet) {
      throw new NotFoundException(`Outlet with phone number ID '${phoneNumberId}' not found`);
    }

    // Return with decrypted WABA access token for internal use
    return this.buildOutletResponse(outlet, true);
  }

  async update(id: string, updateOutletDto: UpdateOutletDto, tenantId: string): Promise<OutletResponse> {
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
      values.push(this.cryptoService.encrypt(updateOutletDto.wabaAccessToken));
    }

    if (updateOutletDto.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(updateOutletDto.status);
    }

    if (updates.length === 0) {
      return this.buildOutletResponse(existing, false);
    }

    values.push(id);

    const query = `
      UPDATE outlets
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const outlet = await this.db.queryOne<Outlet>(query, values);
    return this.buildOutletResponse(outlet, false);
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
  private buildOutletResponse(outlet: Outlet, includeSecret = false): OutletResponse {
    if (includeSecret) {
      return {
        id: outlet.id,
        tenant_id: outlet.tenant_id,
        name: outlet.name,
        waba_phone_number: outlet.waba_phone_number,
        waba_phone_number_id: outlet.waba_phone_number_id,
        waba_business_account_id: outlet.waba_business_account_id,
        created_at: outlet.created_at,
        status: outlet.status,
        has_waba_access_token: Boolean(outlet.waba_access_token),
        waba_access_token: this.cryptoService.decrypt(outlet.waba_access_token),
      };
    }

    return {
      id: outlet.id,
      tenant_id: outlet.tenant_id,
      name: outlet.name,
      waba_phone_number: outlet.waba_phone_number,
      waba_phone_number_id: outlet.waba_phone_number_id,
      waba_business_account_id: outlet.waba_business_account_id,
      created_at: outlet.created_at,
      status: outlet.status,
      has_waba_access_token: Boolean(outlet.waba_access_token),
    };
  }
}
