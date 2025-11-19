import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface Customer {
  id: string;
  tenant_id: string;
  customer_phone: string;
  customer_name?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCustomerDto {
  customer_phone: string;
  customer_name?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface UpdateCustomerDto {
  customer_name?: string;
  email?: string;
  address?: string;
  notes?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly db: DatabaseService) {}

  async findByPhone(tenantId: string, phone: string): Promise<Customer | null> {
    const customer = await this.db.queryOne<Customer>(
      `SELECT * FROM customers
       WHERE tenant_id = $1 AND customer_phone = $2`,
      [tenantId, phone],
    );

    return customer;
  }

  async createOrUpdate(tenantId: string, data: CreateCustomerDto): Promise<Customer> {
    // Try to find existing customer
    const existing = await this.findByPhone(tenantId, data.customer_phone);

    if (existing) {
      // Update existing customer
      return await this.update(tenantId, data.customer_phone, data);
    }

    // Create new customer
    const customer = await this.db.queryOne<Customer>(
      `INSERT INTO customers (
        tenant_id,
        customer_phone,
        customer_name,
        email,
        address,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        tenantId,
        data.customer_phone,
        data.customer_name || null,
        data.email || null,
        data.address || null,
        data.notes || null,
      ],
    );

    if (!customer) {
      throw new Error('Failed to create customer');
    }

    return customer;
  }

  async update(tenantId: string, phone: string, data: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.db.queryOne<Customer>(
      `UPDATE customers
       SET
         customer_name = COALESCE($3, customer_name),
         email = COALESCE($4, email),
         address = COALESCE($5, address),
         notes = COALESCE($6, notes),
         updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND customer_phone = $2
       RETURNING *`,
      [
        tenantId,
        phone,
        data.customer_name,
        data.email,
        data.address,
        data.notes,
      ],
    );

    if (!customer) {
      throw new NotFoundException(`Customer with phone ${phone} not found`);
    }

    return customer;
  }

  async list(tenantId: string, limit: number = 100): Promise<Customer[]> {
    const result = await this.db.query<Customer>(
      `SELECT * FROM customers
       WHERE tenant_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [tenantId, limit],
    );

    return result.rows;
  }
}
