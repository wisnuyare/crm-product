import { Card } from '../components/ui/Card';

export function Conversations() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900">Conversations</h1>
      <p className="mt-2 text-gray-600">Manage customer conversations in real-time</p>

      <Card className="mt-8">
        <div className="text-center py-12">
          <p className="text-gray-500">
            Real-time conversation interface coming soon...
          </p>
          <p className="mt-2 text-sm text-gray-400">
            This will show active WhatsApp conversations with WebSocket support
          </p>
        </div>
      </Card>
    </div>
  );
}
