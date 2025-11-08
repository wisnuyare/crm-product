import { Card } from '../components/ui/Card';
import { BarChart3 } from 'lucide-react';

export function Analytics() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
      <p className="mt-2 text-gray-600">Detailed metrics and insights</p>

      <Card className="mt-8">
        <div className="text-center py-12">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-gray-500">Detailed analytics charts coming soon...</p>
          <p className="mt-2 text-sm text-gray-400">
            View conversation trends, response times, and cost analysis
          </p>
        </div>
      </Card>
    </div>
  );
}
