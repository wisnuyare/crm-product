import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Card } from '../components/ui/Card';
import { Package, AlertTriangle, Plus, Search, Edit, Trash2 } from 'lucide-react';
import ProductModal from '../components/products/ProductModal';

interface Product {
  id: string;
  tenant_id: string;
  name: string;
  description?: {
    String: string;
    Valid: boolean;
  };
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  category?: {
    String: string;
    Valid: boolean;
  };
  sku?: {
    String: string;
    Valid: boolean;
  };
  status: string;
  created_at: string;
  updated_at: string;
}

interface ProductsResponse {
  products: Product[];
  total: number;
}

type FormProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  category: string;
  sku: string;
};

const fetchProducts = async (categoryFilter: string): Promise<ProductsResponse> => {
  const params = new URLSearchParams({
    status: 'active',
    limit: '100',
  });

  if (categoryFilter !== 'all') {
    params.append('category', categoryFilter);
  }
  
  return api.order.get(`/api/v1/products?${params.toString()}`);
};

export function Products() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<FormProduct | undefined>(undefined);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<ProductsResponse>({
    queryKey: ['products', categoryFilter],
    queryFn: () => fetchProducts(categoryFilter),
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => api.order.delete(`/api/v1/products/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteConfirmId(null);
      toast.success('Product deleted successfully');
    },
    onError: (err: Error) => {
      console.error('Error deleting product:', err);
      toast.error('Failed to delete product. Please try again.');
    }
  });

  const products = data?.products || [];

  // Filter products by search term
  const filteredProducts = products.filter(product => {
    const searchLower = searchTerm.toLowerCase();
    return (
      product.name.toLowerCase().includes(searchLower) ||
      (product.description?.Valid && product.description.String.toLowerCase().includes(searchLower)) ||
      (product.sku?.Valid && product.sku.String.toLowerCase().includes(searchLower))
    );
  });

  // Get unique categories
  const categories = Array.from(
    new Set(
      products
        .filter(p => p.category?.Valid)
        .map(p => p.category!.String)
    )
  );

  // Format price in Rupiah
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(price);
  };

  // Low stock products count
  const lowStockCount = products.filter(p => p.stock_quantity <= p.low_stock_threshold).length;

  // Modal handlers
  const handleCreateProduct = () => {
    setEditingProduct(undefined);
    setIsModalOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct({
      id: product.id,
      name: product.name,
      description: product.description?.Valid ? product.description.String : '',
      price: product.price,
      stock_quantity: product.stock_quantity,
      low_stock_threshold: product.low_stock_threshold,
      category: product.category?.Valid ? product.category.String : '',
      sku: product.sku?.Valid ? product.sku.String : ''
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(undefined);
  };

  const handleProductSuccess = () => {
    handleCloseModal();
  };

  const handleDeleteProduct = (productId: string) => {
    deleteMutation.mutate(productId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Products</h1>
          <p className="text-gray-600">Manage your product catalog and inventory</p>
        </div>
        <button
          onClick={handleCreateProduct}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all duration-200 font-semibold"
        >
          <Plus size={20} />
          Add Product
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Products</p>
              <p className="text-2xl font-bold">{products.length}</p>
            </div>
            <Package className="text-blue-600" size={32} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Low Stock</p>
              <p className="text-2xl font-bold text-orange-600">{lowStockCount}</p>
            </div>
            <AlertTriangle className="text-orange-600" size={32} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Categories</p>
              <p className="text-2xl font-bold">{categories.length}</p>
            </div>
            <Package className="text-green-600" size={32} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Value</p>
              <p className="text-2xl font-bold">
                {formatPrice(products.reduce((sum, p) => sum + (p.price * p.stock_quantity), 0))}
              </p>
            </div>
            <Package className="text-purple-600" size={32} />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search products by name, description, or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Products Table */}
      <Card>
        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-gray-600">Loading products...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">
            <p>Error fetching products: {error.message}</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-8">
            <Package className="mx-auto mb-4 text-gray-400" size={48} />
            <p className="text-gray-600">No products found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Product</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">SKU</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Price</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">Stock</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900">{product.name}</p>
                        {product.description?.Valid && (
                          <p className="text-sm text-gray-500">{product.description.String}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {product.sku?.Valid ? product.sku.String : '-'}
                    </td>
                    <td className="py-3 px-4">
                      {product.category?.Valid && (
                        <span className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                          {product.category.String}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-900">
                      {formatPrice(product.price)}
                    .</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`font-semibold ${
                          product.stock_quantity <= product.low_stock_threshold
                            ? 'text-orange-600'
                            : 'text-green-600'
                        }`}>
                          {product.stock_quantity}
                        </span>
                        {product.stock_quantity <= product.low_stock_threshold && (
                          <AlertTriangle className="text-orange-600" size={16} />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                        product.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEditProduct(product)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit product"
                        >
                          <Edit size={16} />
                        </button>
                        {deleteConfirmId === product.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="px-2 py-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded"
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? 'Deleting...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(product.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                            title="Delete product"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Product Modal */}
      <ProductModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={handleProductSuccess}
        editProduct={editingProduct}
      />
    </div>
  );
}