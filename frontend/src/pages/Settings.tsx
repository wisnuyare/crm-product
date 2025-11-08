import { Card } from '../components/ui/Card';
import { Settings as SettingsIcon } from 'lucide-react';

export function Settings() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
      <p className="mt-2 text-gray-600">Configure your tenant and LLM preferences</p>

      <Card className="mt-8">
        <div className="text-center py-12">
          <SettingsIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-gray-500">Settings interface coming soon...</p>
          <p className="mt-2 text-sm text-gray-400">
            Configure LLM instructions, outlet settings, and user management
          </p>
        </div>
      </Card>
    </div>
  );
}
