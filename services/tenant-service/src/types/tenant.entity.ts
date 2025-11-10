import { ApiProperty } from '@nestjs/swagger';

export class Tenant {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty()
  status: string;

  @ApiProperty()
  llm_tone: Record<string, any>;

  @ApiProperty({ nullable: true })
  contact_email: string | null;

  @ApiProperty({ nullable: true })
  firebase_tenant_id: string | null;
}

export class Outlet {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenant_id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  waba_phone_number: string;

  @ApiProperty()
  waba_phone_number_id: string;

  @ApiProperty()
  waba_business_account_id: string;

  @ApiProperty({ required: false, writeOnly: true })
  waba_access_token?: string;

  @ApiProperty()
  has_waba_access_token: boolean;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  status: string;
}

export class User {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenant_id: string;

  @ApiProperty()
  firebase_uid: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  created_at: Date;
}

export class TenantWithRelations extends Tenant {
  @ApiProperty({ type: () => [Outlet] })
  outlets?: Outlet[];

  @ApiProperty({ type: () => [User] })
  users?: User[];
}
