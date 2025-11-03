import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest'; // Import as namespace
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { FirebaseService } from '../src/firebase/firebase.service';
import { FirebaseAuthGuard } from '../src/firebase/firebase-auth.guard';
import { RolesGuard } from '../src/firebase/roles.guard';

describe('TenantsController (e2e)', () => {
  let app: INestApplication;
  let agent: any; // Declare agent as any

  const mockDatabaseService = {
    queryOne: jest.fn((query: string, params: any[]) => {
      if (query.includes('FROM tenants t WHERE t.slug = $1')) {
        return Promise.resolve(mockTenant);
      }
      return Promise.resolve(null); // Or throw an error for unexpected queries
    }),
    queryMany: jest.fn(),
    query: jest.fn(),
  };

  const mockFirebaseService = {
    verifyIdToken: jest.fn(),
  };

  const mockTenant = {
    id: 'some-uuid',
    name: 'Test Tenant',
    slug: 'test-slug',
    created_at: new Date(),
    updated_at: new Date(),
    status: 'active',
    llm_tone: { tone: 'friendly' },
    contact_email: 'test@example.com',
    firebase_tenant_id: null,
    outlets: [],
    users: [],
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(FirebaseService)
      .useValue(mockFirebaseService)
      .overrideGuard(FirebaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(''); // Remove global prefix for testing
    await app.init();
    agent = request.agent(app.getHttpServer()); // Initialize agent
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /tenants/slug/:slug should allow access without a token', async () => {
    const mockTenant = {
      id: 'some-uuid',
      name: 'Test Tenant',
      slug: 'test-slug',
      created_at: new Date(),
      updated_at: new Date(),
      status: 'active',
      llm_tone: { tone: 'friendly' },
      contact_email: 'test@example.com',
      firebase_tenant_id: null,
      outlets: [],
      users: [],
    };
    mockDatabaseService.queryOne.mockResolvedValue(mockTenant);

    const response = await agent
      .get('/tenants/slug/test-slug')
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      id: mockTenant.id,
      name: mockTenant.name,
      slug: mockTenant.slug,
    }));
    expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      ['test-slug'],
    );
  });

  it('GET /tenants should return 401 Unauthorized when no token is provided', async () => {
    await agent
      .get('/tenants')
      .expect(401);
  });

  it('GET /tenants should return 401 Unauthorized when an invalid token is provided', async () => {
    mockFirebaseService.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

    await agent
      .set('Authorization', 'Bearer invalid-token')
      .get('/tenants')
      .expect(401);
  });

  it('POST /tenants should return 403 Forbidden for non-admin roles', async () => {
    const agentToken = {
      uid: 'agent-uid',
      email: 'agent@example.com',
      tenant_id: 'some-tenant-id',
      role: 'agent',
    };
    mockFirebaseService.verifyIdToken.mockResolvedValue(agentToken);

    await agent
      .post('/tenants')
      .set('Authorization', 'Bearer valid-agent-token')
      .send({
        name: 'New Tenant',
        slug: 'new-tenant',
        contactEmail: 'new@example.com',
      })
      .expect(403);
  });

  it('POST /tenants should succeed for admin roles', async () => {
    const adminToken = {
      uid: 'admin-uid',
      email: 'admin@example.com',
      tenant_id: 'some-tenant-id',
      role: 'admin',
    };
    mockFirebaseService.verifyIdToken.mockResolvedValue(adminToken);
    mockDatabaseService.queryOne.mockResolvedValueOnce(null); // For slug check
    mockDatabaseService.queryOne.mockResolvedValueOnce({
      id: 'new-tenant-id',
      name: 'New Tenant',
      slug: 'new-tenant',
      created_at: new Date(),
      updated_at: new Date(),
      status: 'active',
      llm_tone: { tone: 'friendly' },
      contact_email: 'new@example.com',
      firebase_tenant_id: null,
    }); // For tenant creation

    const newTenantData = {
      name: 'New Tenant',
      slug: 'new-tenant',
      contactEmail: 'new@example.com',
    };

    const response = await agent
      .post('/tenants')
      .set('Authorization', 'Bearer valid-admin-token')
      .send(newTenantData)
      .expect(201);

    expect(response.body).toEqual(expect.objectContaining({
      id: 'new-tenant-id',
      name: newTenantData.name,
      slug: newTenantData.slug,
    }));
    expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tenants'),
      expect.any(Array),
    );
  });

  it('GET /tenants should succeed for admin roles', async () => {
    const adminToken = {
      uid: 'admin-uid',
      email: 'admin@example.com',
      tenant_id: 'some-tenant-id',
      role: 'admin',
    };
    mockFirebaseService.verifyIdToken.mockResolvedValue(adminToken);
    mockDatabaseService.queryMany.mockResolvedValue([mockTenant]);

    const response = await agent
      .get('/tenants')
      .set('Authorization', 'Bearer valid-admin-token')
      .expect(200);

    expect(response.body).toEqual([expect.objectContaining({
      id: mockTenant.id,
      name: mockTenant.name,
    })]);
    expect(mockDatabaseService.queryMany).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
    );
  });

  it('GET /tenants should succeed for agent roles', async () => {
    const agentToken = {
      uid: 'agent-uid',
      email: 'agent@example.com',
      tenant_id: 'some-tenant-id',
      role: 'agent',
    };
    mockFirebaseService.verifyIdToken.mockResolvedValue(agentToken);
    mockDatabaseService.queryMany.mockResolvedValue([mockTenant]);

    const response = await agent
      .get('/tenants')
      .set('Authorization', 'Bearer valid-agent-token')
      .expect(200);

    expect(response.body).toEqual([expect.objectContaining({
      id: mockTenant.id,
      name: mockTenant.name,
    })]);
    expect(mockDatabaseService.queryMany).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
    );
  });
});