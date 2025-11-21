import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card } from '../components/ui/Card';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { Button } from '../components/ui/Button';
import ResourceModal from '../components/resources/ResourceModal';

interface Resource {
  id: string;
  tenant_id: string;
  outlet_id: string;
  name: string;
  type: string;
  description?: string;
  hourly_rate: number;
  capacity?: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ResourcesResponse {
  resources: Resource[];
  total: number;
}

const fetchResources = async (): Promise<ResourcesResponse> => {
  return api.booking.get('/api/v1/resources');
};

export function Resources() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | undefined>(undefined);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<ResourcesResponse>({
    queryKey: ['resources'],
    queryFn: fetchResources,
  });

  const deleteMutation = useMutation({
    mutationFn: (resourceId: string) => api.booking.delete(`/api/v1/resources/${resourceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      setDeleteConfirmId(null);
    },
    onError: (err: Error) => {
      console.error('Error deleting resource:', err);
      alert('Failed to delete resource. Please try again.');
    }
  });

  const resources = data?.resources || [];

  // Filter resources
  const filteredResources = resources.filter((resource) => {
    const matchesSearch = resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (resource.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || resource.type === filterType;
    const matchesStatus = filterStatus === 'all' || resource.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  // Get unique types for filter
  const resourceTypes = Array.from(new Set(resources.map(r => r.type)));

  // Modal handlers
  const handleCreateResource = () => {
    setEditingResource(undefined);
    setIsModalOpen(true);
  };

  const handleEditResource = (resource: Resource) => {
    setEditingResource(resource);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingResource(undefined);
  };

  const handleResourceSuccess = () => {
    handleCloseModal();
  };

  const handleDeleteResource = (resourceId: string) => {
    deleteMutation.mutate(resourceId);
  };

  // Format price in Rupiah
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(price);
  };

  // Format type label
  const formatType = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Resources</h1>
          <p className="mt-2 text-gray-600">Manage booking resources (rooms, equipment, etc.)</p>
        </div>
        <Button onClick={handleCreateResource}>
          <Plus className="w-5 h-5 mr-2" />
          Add Resource
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <div className="text-sm text-gray-600">Total Resources</div>
          <div className="text-2xl font-bold text-gray-900">{resources.length}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-600">Active</div>
          <div className="text-2xl font-bold text-green-600">
            {resources.filter(r => r.status === 'active').length}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-600">Rooms</div>
          <div className="text-2xl font-bold text-blue-600">
            {resources.filter(r => r.type === 'room').length}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-600">Courts/Fields</div>
          <div className="text-2xl font-bold text-orange-600">
            {resources.filter(r => r.type === 'court' || r.type === 'field').length}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-600">Equipment</div>
          <div className="text-2xl font-bold text-purple-600">
            {resources.filter(r => r.type === 'equipment').length}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
          </div>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          >
            <option value="all">All Types</option>
            {resourceTypes.map(type => (
              <option key={type} value={type}>{formatType(type)}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      </Card>

      {/* Resources Table */}
      {isLoading ? (
        <Card>
          <div className="text-center py-12">Loading resources...</div>
        </Card>
      ) : error ? (
        <Card>
          <div className="text-center py-12 text-red-500">Error loading resources</div>
        </Card>
      ) : filteredResources.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No resources found</p>
            <Button onClick={handleCreateResource}>
              <Plus className="w-5 h-5 mr-2" />
              Add Your First Resource
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resource
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hourly Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Capacity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredResources.map((resource) => (
                  <tr key={resource.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{resource.name}</div>
                        {resource.description && (
                          <div className="text-sm text-gray-500">{resource.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        resource.type === 'room' ? 'bg-blue-100 text-blue-800' :
                        resource.type === 'equipment' ? 'bg-purple-100 text-purple-800' :
                        resource.type === 'court' ? 'bg-orange-100 text-orange-800' :
                        resource.type === 'field' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {formatType(resource.type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatPrice(resource.hourly_rate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {resource.capacity || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        resource.status === 'active' ? 'bg-green-100 text-green-800' :
                        resource.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                        resource.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {resource.status.charAt(0).toUpperCase() + resource.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEditResource(resource)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {deleteConfirmId === resource.id ? (
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => handleDeleteResource(resource.id)}
                            disabled={deleteMutation.isPending}
                            className="text-red-600 hover:text-red-900 text-xs"
                          >
                            {deleteMutation.isPending ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-gray-600 hover:text-gray-900 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(resource.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Resource Modal */}
      <ResourceModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={handleResourceSuccess}
        editResource={editingResource}
      />
    </div>
  );
}
