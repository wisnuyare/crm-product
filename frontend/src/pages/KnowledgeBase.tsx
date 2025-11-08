import { Card } from '../components/ui/Card';
import { Upload } from 'lucide-react';

export function KnowledgeBase() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900">Knowledge Base</h1>
      <p className="mt-2 text-gray-600">Manage documents for RAG-powered responses</p>

      <Card className="mt-8">
        <div className="text-center py-12">
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-gray-500">Document upload interface coming soon...</p>
          <p className="mt-2 text-sm text-gray-400">
            Upload PDF, DOCX, and XLSX files to power your AI responses
          </p>
        </div>
      </Card>
    </div>
  );
}
