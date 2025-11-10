import React, { useState } from 'react';
import { api, MOCK_TENANT_ID } from '../services/api';

const Settings = () => {
  const [wabaPhoneNumber, setWabaPhoneNumber] = useState('');
  const [wabaPhoneNumberId, setWabaPhoneNumberId] = useState('');
  const [wabaBusinessAccountId, setWabaBusinessAccountId] = useState('');
  const [wabaAccessToken, setWabaAccessToken] = useState('');
  const [llmInstructions, setLlmInstructions] = useState('');
  const [status, setStatus] = useState('');

  const handleSave = async () => {
    setStatus('Saving...');
    try {
      // TODO: Replace MOCK_TENANT_ID with dynamic tenant ID from auth context
      const tenantId = MOCK_TENANT_ID;

      // 1. Save LLM instructions
      await api.tenant.updateLlmInstructions(tenantId, llmInstructions);

      // 2. Create or update outlet with WABA credentials
      // For simplicity, this example creates a new outlet.
      // A real implementation would fetch existing outlets and update one.
      await api.tenant.createOutlet({
        tenantId,
        name: 'My WhatsApp Outlet', // Or use a form field for the name
        wabaPhoneNumber,
        wabaPhoneNumberId,
        wabaBusinessAccountId,
        wabaAccessToken,
      });

      setStatus('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold mb-2">WhatsApp Business API Credentials</h2>
          <div className="space-y-4">
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
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">LLM Instructions</h2>
          <textarea
            rows={6}
            value={llmInstructions}
            onChange={(e) => setLlmInstructions(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Enter custom instructions for the LLM..."
          />
        </div>

        <div>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Save Settings
          </button>
          {status && <p className="mt-2 text-sm text-gray-600">{status}</p>}
        </div>
      </div>
    </div>
  );
};

export default Settings;