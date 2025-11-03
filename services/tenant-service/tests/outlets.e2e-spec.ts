import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { FirebaseService } from '../src/firebase/firebase.service';
import { FirebaseAuthGuard } from '../src/firebase/firebase-auth.guard';
import { RolesGuard } from '../src/firebase/roles.guard';

describe('OutletsController (e2e)', () => {
  let app: INestApplication;
  let agent: any; // Declare agent as any

  const mockDatabaseService = {
    queryOne: jest.fn(),
    queryMany: jest.fn(),
    query: jest.fn(),
  };

  const mockFirebaseService = {
    verifyIdToken: jest.fn(),
  };

  const mockOutlet = {
    id: 'some-outlet-id',
    tenant_id: 'some-tenant-id',
    name: 'Test Outlet',
    waba_phone_number: '+1234567890',
    waba_phone_number_id: 'phone-id',
    waba_business_account_id: 'business-id',
    waba_access_token: 'access-token',
    created_at: new Date(),
    status: 'active',
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
    app.setGlobalPrefix('');
    await app.init();
    agent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  // Test cases will go here

  it('GET /outlets should return 401 Unauthorized when no token is provided', async () => {
    await agent
      .get('/outlets')
      .expect(401);
  });

  it('GET /outlets should return 401 Unauthorized when an invalid token is provided', async () => {
    mockFirebaseService.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

    await agent
      .set('Authorization', 'Bearer invalid-token')
      .get('/outlets')
      .expect(401);
  });

  it('POST /outlets should return 403 Forbidden for non-admin roles', async () => {
    const agentToken = {
      uid: 'agent-uid',
      email: 'agent@example.com',
      tenant_id: 'some-tenant-id',
      role: 'agent',
    };
    mockFirebaseService.verifyIdToken.mockResolvedValue(agentToken);

    await agent
      .post('/outlets')
      .set('Authorization', 'Bearer valid-agent-token')
      .send({
        tenantId: 'some-tenant-id',
        name: 'New Outlet',
        wabaPhoneNumber: '+1234567890',
        wabaPhoneNumberId: 'phone-id',
        wabaBusinessAccountId: 'business-id',
        wabaAccessToken: 'access-token',
      })
      .expect(403);
  });

  it('POST /outlets should succeed for admin roles', async () => {
    const adminToken = {
      uid: 'admin-uid',
      email: 'admin@example.com',
      tenant_id: 'some-tenant-id',
      role: 'admin',
    };
    mockFirebaseService.verifyIdToken.mockResolvedValue(adminToken);
    mockDatabaseService.queryOne.mockResolvedValueOnce(null); // For phone number check
    mockDatabaseService.queryOne.mockResolvedValueOnce({
      id: 'new-outlet-id',
      tenant_id: 'some-tenant-id',
      name: 'New Outlet',
      waba_phone_number: '+1234567890',
      waba_phone_number_id: 'phone-id',
      waba_business_account_id: 'business-id',
      waba_access_token: 'access-token',
      created_at: new Date(),
      status: 'active',
    }); // For outlet creation

    const newOutletData = {
      tenantId: 'some-tenant-id',
      name: 'New Outlet',
      wabaPhoneNumber: '+1234567890',
      wabaPhoneNumberId: 'phone-id',
      wabaBusinessAccountId: 'business-id',
      wabaAccessToken: 'access-token',
    };

    const response = await agent
      .post('/outlets')
      .set('Authorization', 'Bearer valid-admin-token')
      .send(newOutletData)
      .expect(201);

    expect(response.body).toEqual(expect.objectContaining({
      id: 'new-outlet-id',
      name: newOutletData.name,
      tenant_id: newOutletData.tenantId,
    }));
    expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO outlets'),
      expect.any(Array),
    );
  });

  it('POST /outlets should succeed for admin roles', async () => {
    const adminToken = {
      uid: 'admin-uid',
      email: 'admin@example.com',
      tenant_id: 'some-tenant-id',
      role: 'admin',
    };
    mockFirebaseService.verifyIdToken.mockResolvedValue(adminToken);
    mockDatabaseService.queryOne.mockResolvedValueOnce(null); // For phone number check
    mockDatabaseService.queryOne.mockResolvedValueOnce({
      id: 'new-outlet-id',
      tenant_id: 'some-tenant-id',
      name: 'New Outlet',
      waba_phone_number: '+1234567890',
      waba_phone_number_id: 'phone-id',
      waba_business_account_id: 'business-id',
      waba_access_token: 'access-token',
      created_at: new Date(),
      status: 'active',
    }); // For outlet creation

    const newOutletData = {
      tenantId: 'some-tenant-id',
      name: 'New Outlet',
      wabaPhoneNumber: '+1234567890',
      wabaPhoneNumberId: 'phone-id',
      wabaBusinessAccountId: 'business-id',
      wabaAccessToken: 'access-token',
    };

    const response = await agent
      .post('/outlets')
      .set('Authorization', 'Bearer valid-admin-token')
      .send(newOutletData)
      .expect(201);

    expect(response.body).toEqual(expect.objectContaining({
      id: 'new-outlet-id',
      name: newOutletData.name,
      tenant_id: newOutletData.tenantId,
    }));
    expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO outlets'),
      expect.any(Array),
    );
  });

  it('GET /outlets should succeed for admin roles', async () => {
    const adminToken = {
      uid: 'admin-uid',
      email: 'admin@example.com',
      tenant_id: 'some-tenant-id',
      role: 'admin',
    };
    mockFirebaseService.verifyIdToken.mockResolvedValue(adminToken);
    mockDatabaseService.queryMany.mockResolvedValue([mockOutlet]);

    const response = await agent
      .get('/outlets')
      .set('Authorization', 'Bearer valid-admin-token')
      .expect(200);

    expect(response.body).toEqual([expect.objectContaining({
      id: mockOutlet.id,
      name: mockOutlet.name,
    })]);
    expect(mockDatabaseService.queryMany).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
    );
  });

  it('GET /outlets should succeed for agent roles', async () => {
    const agentToken = {
      uid: 'agent-uid',
      email: 'agent@example.com',
      tenant_id: 'some-tenant-id',
      role: 'agent',
    };
    mockFirebaseService.verifyIdToken.mockResolvedValue(agentToken);
    mockDatabaseService.queryMany.mockResolvedValue([mockOutlet]);

    const response = await agent
      .get('/outlets')
      .set('Authorization', 'Bearer valid-agent-token')
      .expect(200);

    expect(response.body).toEqual([expect.objectContaining({
      id: mockOutlet.id,
      name: mockOutlet.name,
    })]);
    expect(mockDatabaseService.queryMany).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
    );
  });
