export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
  status: string;
  llm_tone: Record<string, any>;
  contact_email: string | null;
  firebase_tenant_id: string | null;
}

export interface TenantWithRelations extends Tenant {
  outlets?: Outlet[];
  users?: User[];
}

export interface Outlet {
  id: string;
  tenant_id: string;
  name: string;
  waba_phone_number: string;
  waba_phone_number_id: string;
  waba_business_account_id: string;
  waba_access_token: string;
  created_at: Date;
  status: string;
}

export interface User {
  id: string;
  tenant_id: string;
  firebase_uid: string;
  email: string;
  role: string;
  created_at: Date;
}
