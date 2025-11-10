import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/ui/Card';
import {
  Upload,
  Plus,
  Trash2,
  FileText,
  Database,
  RefreshCcw,
  AlertCircle,
} from 'lucide-react';
import { api } from '../services/api';

type KnowledgeBaseRecord = {
  id: string;
  name: string;
  description?: string;
  outlet_id: string;
  status: string;
  document_count?: number;
  created_at: string;
  updated_at: string;
};

type KnowledgeDocument = {
  id: string;
  filename: string;
  file_type: string;
  file_size_bytes: number;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  chunk_count: number;
  uploaded_at: string;
  processed_at?: string;
};

type OutletRecord = {
  id: string;
  name: string;
  status?: string;
};

type QuotaStatus = {
  subscription: {
    knowledgeBaseLimit: number;
    storageLimitMB: number;
  };
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${mb.toFixed(2)} MB`;
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(new Date(value));
};

const documentStatusStyles: Record<
  KnowledgeDocument['processing_status'],
  { label: string; classes: string }
> = {
  completed: { label: 'Completed', classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  processing: { label: 'Processing', classes: 'bg-sky-50 text-sky-700 border border-sky-200' },
  pending: { label: 'Pending', classes: 'bg-gray-50 text-gray-700 border border-gray-200' },
  failed: { label: 'Failed', classes: 'bg-red-50 text-red-700 border border-red-200' },
};

const allowedFileTypes = '.pdf,.docx,.xlsx,.txt';

export function KnowledgeBase() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRecord[]>([]);
  const [documentsByKb, setDocumentsByKb] = useState<Record<string, KnowledgeDocument[]>>({});
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [outlets, setOutlets] = useState<OutletRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creatingKb, setCreatingKb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKbName, setNewKbName] = useState('');
  const [newKbDescription, setNewKbDescription] = useState('');
  const [newKbOutletId, setNewKbOutletId] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedKnowledgeBase = knowledgeBases.find((kb) => kb.id === selectedKbId) || null;
  const selectedDocuments = selectedKbId ? documentsByKb[selectedKbId] || [] : [];

  const storageLimitBytes =
    quotaStatus && quotaStatus.subscription.storageLimitMB > 0
      ? quotaStatus.subscription.storageLimitMB * 1024 * 1024
      : Infinity;

  const totalStorageBytes = useMemo(
    () =>
      Object.values(documentsByKb).reduce(
        (sum, docs) => sum + docs.reduce((docSum, doc) => docSum + doc.file_size_bytes, 0),
        0,
      ),
    [documentsByKb],
  );

  const knowledgeBaseLimit = quotaStatus?.subscription.knowledgeBaseLimit ?? 0;
  const storageUsagePercent =
    storageLimitBytes === Infinity ? 0 : Math.min(100, (totalStorageBytes / storageLimitBytes) * 100);

  const canCreateKnowledgeBase =
    knowledgeBaseLimit < 0 || knowledgeBases.length < knowledgeBaseLimit;

  const refreshDocuments = async (knowledgeBaseId: string) => {
    setDocumentsLoading(true);
    try {
      const docs = await api.knowledgeService.listDocuments(knowledgeBaseId);
      setDocumentsByKb((prev) => ({ ...prev, [knowledgeBaseId]: docs }));
      setKnowledgeBases((prev) =>
        prev.map((kb) =>
          kb.id === knowledgeBaseId ? { ...kb, document_count: docs.length } : kb,
        ),
      );
    } catch (err: any) {
      setError(err.message || 'Failed to fetch documents');
    } finally {
      setDocumentsLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [kbData, quotaData, outletData] = await Promise.all([
        api.knowledgeService.listKnowledgeBases(),
        api.tenant.getQuotaStatus(),
        api.tenant.listOutlets(),
      ]);

      const docsEntries = await Promise.all(
        kbData.map(async (kb) => {
          const docs = await api.knowledgeService.listDocuments(kb.id);
          return [kb.id, docs] as [string, KnowledgeDocument[]];
        }),
      );

      const docsMap = docsEntries.reduce(
        (acc, [kbId, docs]) => ({ ...acc, [kbId]: docs }),
        {} as Record<string, KnowledgeDocument[]>,
      );

      setKnowledgeBases(kbData);
      setDocumentsByKb(docsMap);
      setQuotaStatus(quotaData);
      setOutlets(outletData);
      setNewKbOutletId(outletData[0]?.id ?? '');
      setSelectedKbId((prev) => prev || kbData[0]?.id || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load knowledge data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateKnowledgeBase = async () => {
    if (!newKbOutletId || !newKbName.trim()) {
      setError('Please provide a name and outlet for the knowledge base.');
      return;
    }
    if (!canCreateKnowledgeBase) {
      setError('Knowledge base limit reached for your subscription tier.');
      return;
    }
    setCreatingKb(true);
    setError(null);
    try {
      const payload = {
        outlet_id: newKbOutletId,
        name: newKbName.trim(),
        description: newKbDescription.trim() || undefined,
      };
      const created = await api.knowledgeService.createKnowledgeBase(payload);
      setKnowledgeBases((prev) => [created, ...prev]);
      setDocumentsByKb((prev) => ({ ...prev, [created.id]: [] }));
      setSelectedKbId(created.id);
      setShowCreateForm(false);
      setNewKbName('');
      setNewKbDescription('');
      setSuccessMessage('Knowledge base created successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to create knowledge base');
    } finally {
      setCreatingKb(false);
    }
  };

  const handleDeleteKnowledgeBase = async (kbId: string) => {
    if (!window.confirm('Delete this knowledge base and all documents? This cannot be undone.')) {
      return;
    }
    setError(null);
    try {
      await api.knowledgeService.deleteKnowledgeBase(kbId);
      setKnowledgeBases((prev) => prev.filter((kb) => kb.id !== kbId));
      setDocumentsByKb((prev) => {
        const updated = { ...prev };
        delete updated[kbId];
        return updated;
      });
      if (selectedKbId === kbId) {
        const remaining = knowledgeBases.filter((kb) => kb.id !== kbId);
        setSelectedKbId(remaining[0]?.id || null);
      }
      setSuccessMessage('Knowledge base deleted.');
    } catch (err: any) {
      setError(err.message || 'Failed to delete knowledge base');
    }
  };

  const handleUploadDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedKbId) {
      return;
    }
    const projectedStorage = totalStorageBytes + file.size;
    if (projectedStorage > storageLimitBytes) {
      setError('Storage quota exceeded. Delete files or upgrade your plan to upload more.');
      event.target.value = '';
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await api.knowledgeService.uploadDocument(selectedKbId, file);
      await refreshDocuments(selectedKbId);
      setSuccessMessage('Document uploaded and processing started.');
    } catch (err: any) {
      setError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!selectedKbId) return;
    if (!window.confirm('Delete this document from the knowledge base?')) {
      return;
    }
    setError(null);
    try {
      await api.knowledgeService.deleteDocument(selectedKbId, documentId);
      await refreshDocuments(selectedKbId);
      setSuccessMessage('Document deleted.');
    } catch (err: any) {
      setError(err.message || 'Failed to delete document');
    }
  };

  const selectedKbStorageBytes = selectedKbId
    ? (documentsByKb[selectedKbId] || []).reduce((sum, doc) => sum + doc.file_size_bytes, 0)
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="mt-2 text-gray-600">
            Upload and manage documents that power retrieval-augmented responses.
          </p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          disabled={loading}
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border-l-4 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mt-4 rounded-md border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">
              Knowledge Bases {knowledgeBaseLimit > -1 ? `(limit ${knowledgeBaseLimit})` : '(unlimited)'}
            </p>
            <p className="text-2xl font-semibold text-gray-900">
              {knowledgeBases.length}
              {knowledgeBaseLimit > -1 && (
                <span className="text-base font-normal text-gray-500">
                  {' '}
                  / {knowledgeBaseLimit}
                </span>
              )}
            </p>
          </div>
          <div className="rounded-full bg-indigo-50 p-3 text-indigo-600">
            <Database className="h-5 w-5" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">
                Storage Usage{' '}
                {storageLimitBytes === Infinity ? '(unlimited)' : `(limit ${quotaStatus?.subscription.storageLimitMB} MB)`}
              </p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatBytes(totalStorageBytes)}
                {storageLimitBytes !== Infinity && (
                  <span className="text-base font-normal text-gray-500">
                    {' '}
                    / {quotaStatus?.subscription.storageLimitMB} MB
                  </span>
                )}
              </p>
            </div>
          </div>
          {storageLimitBytes !== Infinity && (
            <div className="mt-4 h-2 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-indigo-500 transition-all"
                style={{ width: `${storageUsagePercent}%` }}
              />
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px,1fr]">
        <Card className="h-[700px] overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Knowledge Bases</h2>
              <p className="text-sm text-gray-500">Choose a base to manage its documents.</p>
            </div>
            <button
              onClick={() => setShowCreateForm((prev) => !prev)}
              disabled={!canCreateKnowledgeBase}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white ${
                canCreateKnowledgeBase ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              <Plus className="h-4 w-4" />
              New
            </button>
          </div>

          {showCreateForm && (
            <div className="border-b px-5 py-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Outlet</label>
                  <select
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={newKbOutletId}
                    onChange={(e) => setNewKbOutletId(e.target.value)}
                  >
                    {outlets.map((outlet) => (
                      <option key={outlet.id} value={outlet.id}>
                        {outlet.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={newKbName}
                    onChange={(e) => setNewKbName(e.target.value)}
                    placeholder="e.g. Product Manuals"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    rows={2}
                    value={newKbDescription}
                    onChange={(e) => setNewKbDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex justify-end gap-2 text-sm">
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKnowledgeBase}
                    disabled={creatingKb}
                    className="rounded-md bg-indigo-600 px-3 py-2 font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-300"
                  >
                    {creatingKb ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-4 p-5">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="animate-pulse space-y-2 rounded-lg border p-4">
                      <div className="h-4 w-2/3 rounded bg-gray-200" />
                      <div className="h-3 w-1/2 rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              ) : knowledgeBases.length === 0 ? (
                <div className="p-5 text-center text-sm text-gray-500">
                  No knowledge bases yet. Create one to start uploading documents.
                </div>
              ) : (
                <ul className="divide-y">
                  {knowledgeBases.map((kb) => {
                    const isSelected = kb.id === selectedKbId;
                    const docs = documentsByKb[kb.id] || [];
                    return (
                      <li
                        key={kb.id}
                        className={`cursor-pointer px-5 py-4 transition ${
                          isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedKbId(kb.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-900">{kb.name}</p>
                            <p className="text-sm text-gray-500">
                              {docs.length} document{docs.length === 1 ? '' : 's'}
                            </p>
                          </div>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteKnowledgeBase(kb.id);
                            }}
                            className="text-gray-400 hover:text-red-500"
                            title="Delete knowledge base"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          Storage {formatBytes(docs.reduce((sum, doc) => sum + doc.file_size_bytes, 0))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </Card>

        <Card className="h-[700px] flex flex-col">
          {selectedKnowledgeBase ? (
            <>
              <div className="border-b pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{selectedKnowledgeBase.name}</h2>
                    <p className="text-sm text-gray-500">
                      {selectedKnowledgeBase.description || 'No description provided.'}
                    </p>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <span className="font-medium text-gray-900">{selectedDocuments.length} docs</span>
                    <p className="text-xs text-gray-500">{formatBytes(selectedKbStorageBytes)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-b pb-4">
                <label
                  htmlFor="document-upload-input"
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-2 text-sm font-medium ${
                    uploading
                      ? 'border-gray-300 text-gray-400'
                      : 'border-indigo-300 text-indigo-600 hover:border-indigo-500 hover:text-indigo-700'
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? 'Uploading…' : 'Upload Document'}
                </label>
                <input
                  ref={fileInputRef}
                  id="document-upload-input"
                  type="file"
                  accept={allowedFileTypes}
                  className="hidden"
                  onChange={handleUploadDocument}
                  disabled={uploading}
                />
                <button
                  onClick={() => selectedKbId && refreshDocuments(selectedKbId)}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  disabled={documentsLoading}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </button>
                <div className="text-xs text-gray-500">
                  PDF, DOCX, XLSX, TXT · Max 50 MB per file
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {documentsLoading ? (
                  <div className="space-y-3 py-6">
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <div key={idx} className="mx-1 animate-pulse rounded-lg border p-4">
                        <div className="h-4 w-1/3 rounded bg-gray-200" />
                      </div>
                    ))}
                  </div>
                ) : selectedDocuments.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
                    <FileText className="h-10 w-10 text-gray-300" />
                    <p className="mt-3 text-sm">No documents yet. Upload files to start building knowledge.</p>
                  </div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-gray-600">Document</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-600">Size</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-600">Status</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-600">Uploaded</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedDocuments.map((doc) => {
                          const statusToken = documentStatusStyles[doc.processing_status];
                          return (
                            <tr key={doc.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-gray-400" />
                                  <div>
                                    <p className="font-medium text-gray-900">{doc.filename}</p>
                                    <p className="text-xs uppercase text-gray-500">{doc.file_type}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-700">{formatBytes(doc.file_size_bytes)}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusToken.classes}`}>
                                  {statusToken.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-600">{formatDate(doc.uploaded_at)}</td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => handleDeleteDocument(doc.id)}
                                  className="text-gray-400 hover:text-red-500"
                                  title="Delete document"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
              <AlertCircle className="h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm">Select or create a knowledge base to get started.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
