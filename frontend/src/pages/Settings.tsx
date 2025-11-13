import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

type OutletRecord = {
  id: string;
  name: string;
  waba_phone_number: string;
  waba_phone_number_id: string;
  waba_business_account_id: string;
  has_waba_access_token?: boolean;
};

type TenantMeta = {
  name: string;
  slug: string;
  contactEmail?: string;
  updatedAt?: string;
};

type QuotaStatus = {
  subscription: {
    tier: string;
    outletLimit: number;
    messageQuota: number;
  };
  usage: {
    outlets: number;
    messages: number;
  };
};

const Settings = () => {
  const { tenantId } = useAuth();
  const [outletName, setOutletName] = useState('');
  const [wabaPhoneNumber, setWabaPhoneNumber] = useState('');
  const [wabaPhoneNumberId, setWabaPhoneNumberId] = useState('');
  const [wabaBusinessAccountId, setWabaBusinessAccountId] = useState('');
  const [wabaAccessToken, setWabaAccessToken] = useState('');
  const [llmInstructions, setLlmInstructions] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [tenantMeta, setTenantMeta] = useState<TenantMeta>({ name: '', slug: '' });
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [outlets, setOutlets] = useState<OutletRecord[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string | null>(null);
  const [hasExistingToken, setHasExistingToken] = useState(false);

  const hydrateOutletForm = (outlet?: OutletRecord | null) => {
    setOutletName(outlet?.name ?? '');
    setWabaPhoneNumber(outlet?.waba_phone_number ?? '');
    setWabaPhoneNumberId(outlet?.waba_phone_number_id ?? '');
    setWabaBusinessAccountId(outlet?.waba_business_account_id ?? '');
    setWabaAccessToken('');
    setHasExistingToken(Boolean(outlet?.has_waba_access_token));
  };

  const extractInstructions = (llmTone: any): string => {
    if (!llmTone) {
      return '';
    }

    if (typeof llmTone === 'string') {
      try {
        const parsed = JSON.parse(llmTone);
        return parsed.instructions || parsed.tone || '';
      } catch {
        return llmTone;
      }
    }

    if (llmTone.instructions) {
      return llmTone.instructions;
    }

    if (llmTone.tone) {
      return llmTone.tone;
    }

    return '';
  };

  const loadSettings = async () => {
    if (!tenantId) return;

    setIsLoading(true);
    try {
      const [tenantResponse, outletResponse, quotaResponse] = await Promise.all([
        api.tenant.getTenant(tenantId),
        api.tenant.listOutlets(),
        api.tenant.getQuotaStatus(),
      ]);

      setTenantMeta({
        name: tenantResponse.name,
        slug: tenantResponse.slug,
        contactEmail: tenantResponse.contact_email,
        updatedAt: tenantResponse.updated_at,
      });

      setQuotaStatus({
        subscription: {
          tier: quotaResponse.subscription.tier,
          outletLimit: quotaResponse.subscription.outletLimit,
          messageQuota: quotaResponse.subscription.messageQuota,
        },
        usage: {
          outlets: quotaResponse.usage.outlets,
          messages: quotaResponse.usage.messages,
        },
      });

      setOutlets(outletResponse);

      if (outletResponse.length > 0) {
        const firstOutlet = outletResponse[0];
        setSelectedOutletId(firstOutlet.id);
        hydrateOutletForm(firstOutlet);
      } else {
        setSelectedOutletId(null);
        hydrateOutletForm(null);
      }

      setLlmInstructions(extractInstructions(tenantResponse.llm_tone));
    } catch (error: any) {
      console.error('Failed to load tenant settings:', error);
      setStatus(`Error: ${error.message || 'Failed to load settings'}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      loadSettings();
    }
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId) {
      setStatus('Error: User not authenticated');
      return;
    }

    setStatus('Saving...');
    try {

      // 1. Save LLM instructions
      await api.tenant.updateLlmInstructions(tenantId, llmInstructions);

      const isCreatingNewOutlet = !selectedOutletId;
      const trimmedToken = wabaAccessToken.trim();

      if (isCreatingNewOutlet && !trimmedToken) {
        setStatus('Error: WABA access token is required to create a new outlet.');
        return;
      }

      const outletPayload: Record<string, any> = {
        tenantId,
        name: outletName || 'My WhatsApp Outlet',
        wabaPhoneNumber,
        wabaPhoneNumberId,
        wabaBusinessAccountId,
        status: 'active',
      };

      if (isCreatingNewOutlet || trimmedToken) {
        outletPayload.wabaAccessToken = trimmedToken;
      }

      if (selectedOutletId) {
        await api.tenant.updateOutlet(selectedOutletId, outletPayload);
      } else {
        const created = await api.tenant.createOutlet(outletPayload);
        setSelectedOutletId(created.id);
      }

      await loadSettings();

      setWabaAccessToken('');
      if (trimmedToken) {
        setHasExistingToken(true);
      }
      setStatus('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unable to save settings'}`);
    }
  };

  const handleOutletSelection = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === '__new') {
      setSelectedOutletId(null);
      hydrateOutletForm(null);
      return;
    }

    const outlet = outlets.find((o) => o.id === value);
    setSelectedOutletId(value);
    hydrateOutletForm(outlet);
  };

  const formatTier = (tier?: string) => {
    if (!tier) return '—';
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  };

  const isSaving = status === 'Saving...';
  const outletUsage = quotaStatus
    ? `${quotaStatus.usage.outlets}/${quotaStatus.subscription.outletLimit}`
    : '—';
  const messageUsage = quotaStatus
    ? `${quotaStatus.usage.messages.toLocaleString()}/${quotaStatus.subscription.messageQuota.toLocaleString()}`
    : '—';

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Tenant</p>
          <p className="text-lg font-semibold text-gray-900">{tenantMeta.name || 'Not Available'}</p>
          <p className="text-sm text-gray-500">Slug: {tenantMeta.slug || '—'}</p>
          {tenantMeta.contactEmail && (
            <p className="text-sm text-gray-500">Contact: {tenantMeta.contactEmail}</p>
          )}
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Plan</p>
          <p className="text-lg font-semibold text-gray-900">{formatTier(quotaStatus?.subscription.tier)}</p>
          <p className="text-sm text-gray-500">Message quota: {messageUsage}</p>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Outlets</p>
          <p className="text-lg font-semibold text-gray-900">{outletUsage}</p>
          <p className="text-sm text-gray-500">Active WhatsApp connectors</p>
        </div>
      </div>

      <div className="space-y-8">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-2">WhatsApp Business API Credentials</h2>
              <p className="text-sm text-gray-500">
                Choose an existing outlet or create a new one to update its WhatsApp configuration.
              </p>
            </div>
            {isLoading && (
              <span className="text-sm text-indigo-600">Refreshing data…</span>
            )}
          </div>

          <div className="mt-4">
            <label htmlFor="outletSelector" className="block text-sm font-medium text-gray-700">
              Choose outlet
            </label>
            <select
              id="outletSelector"
              value={selectedOutletId ?? '__new'}
              onChange={handleOutletSelection}
              disabled={isLoading}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
            >
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name} ({outlet.waba_phone_number || 'no phone'})
                </option>
              ))}
              <option value="__new">+ Create new outlet</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              When &quot;Create new outlet&quot; is selected, saving will add an additional outlet to your tenant.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="outletName" className="block text-sm font-medium text-gray-700">
                Outlet Name
              </label>
              <input
                type="text"
                id="outletName"
                value={outletName}
                onChange={(e) => setOutletName(e.target.value)}
                placeholder="e.g. Jakarta HQ Outlet"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="wabaPhoneNumber" className="block text-sm font-medium text-gray-700">
                WABA Phone Number
              </label>
              <input
                type="text"
                id="wabaPhoneNumber"
                value={wabaPhoneNumber}
                onChange={(e) => setWabaPhoneNumber(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="wabaPhoneNumberId" className="block text-sm font-medium text-gray-700">
                WABA Phone Number ID
              </label>
              <input
                type="text"
                id="wabaPhoneNumberId"
                value={wabaPhoneNumberId}
                onChange={(e) => setWabaPhoneNumberId(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="wabaBusinessAccountId" className="block text-sm font-medium text-gray-700">
                WABA Business Account ID
              </label>
              <input
                type="text"
                id="wabaBusinessAccountId"
                value={wabaBusinessAccountId}
                onChange={(e) => setWabaBusinessAccountId(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="wabaAccessToken" className="block text-sm font-medium text-gray-700">
                WABA Access Token
              </label>
              <input
                type="password"
                id="wabaAccessToken"
                value={wabaAccessToken}
                onChange={(e) => setWabaAccessToken(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              {hasExistingToken ? (
                <p className="mt-1 text-xs text-gray-500">
                  A token is already stored securely. Enter a new value only if you intend to rotate credentials.
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">Required when creating a new outlet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">LLM Instructions</h2>
          <p className="text-sm text-gray-500 mb-3">
            These instructions are shared with the orchestration service before generating responses for this tenant.
          </p>
          <textarea
            rows={6}
            value={llmInstructions}
            onChange={(e) => setLlmInstructions(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Enter custom instructions for the LLM..."
          />
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`px-4 py-2 rounded-md text-white ${isSaving ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'} `}
          >
            {isSaving ? 'Saving…' : 'Save Settings'}
          </button>
          {status && (
            <div
              className={`mt-4 flex w-full max-w-xl items-start gap-3 rounded-lg border-l-4 px-4 py-3 text-sm ${
                status.startsWith('Error:')
                  ? 'border-red-500 bg-red-50 text-red-800'
                  : status === 'Saving...'
                    ? 'border-yellow-500 bg-yellow-50 text-yellow-800'
                    : 'border-green-500 bg-green-50 text-green-800'
              }`}
              role="status"
            >
              <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold">
                {status.startsWith('Error:')
                  ? '!'
                  : status === 'Saving...'
                    ? '…'
                    : '✓'}
              </span>
              <span className="text-base font-semibold">{status}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
