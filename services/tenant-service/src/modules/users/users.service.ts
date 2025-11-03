import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { User } from '../../types/tenant.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check if Firebase UID already exists
    const existingFirebaseUid = await this.db.queryOne<User>(
      'SELECT id FROM users WHERE firebase_uid = $1',
      [createUserDto.firebaseUid],
    );

    if (existingFirebaseUid) {
      throw new ConflictException(
        `User with Firebase UID '${createUserDto.firebaseUid}' already exists`,
      );
    }

    // Check if email already exists for this tenant
    const existingEmail = await this.db.queryOne<User>(
      'SELECT id FROM users WHERE tenant_id = $1 AND email = $2',
      [createUserDto.tenantId, createUserDto.email],
    );

    if (existingEmail) {
      throw new ConflictException(
        `User with email '${createUserDto.email}' already exists for this tenant`,
      );
    }

    // Insert user
    const user = await this.db.queryOne<User>(
      `INSERT INTO users (tenant_id, firebase_uid, email, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [createUserDto.tenantId, createUserDto.firebaseUid, createUserDto.email, createUserDto.role],
    );

    return user;
  }

  async findAll(tenantId: string): Promise<User[]> {
    const users = await this.db.queryMany<User>(
      'SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return users;
  }

  async findByTenant(tenantId: string): Promise<User[]> {
    const users = await this.db.queryMany<User>(
      'SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return users;
  }

  async findOne(id: string, tenantId: string): Promise<User> {
    const user = await this.db.queryOne<User>(
      'SELECT * FROM users WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    return user;
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User> {
    const user = await this.db.queryOne<User>('SELECT * FROM users WHERE firebase_uid = $1', [
      firebaseUid,
    ]);

    if (!user) {
      throw new NotFoundException(`User with Firebase UID '${firebaseUid}' not found`);
    }

    return user;
  }

  async updateRole(id: string, role: string, tenantId: string): Promise<User> {
    const user = await this.db.queryOne<User>(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    const updated = await this.db.queryOne<User>(
      'UPDATE users SET role = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
      [role, id, tenantId],
    );

    return updated;
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const user = await this.db.queryOne<User>(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    await this.db.query('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  }
}
