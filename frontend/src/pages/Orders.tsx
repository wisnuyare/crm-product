import { useEffect, useState, useCallback, type ElementType } from 'react';
import { Card } from '../components/ui/Card';
import { ShoppingCart, Package, Clock, CheckCircle, XCircle, Eye } from 'lucide-react';
import { api } from '../services/api';

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  subtotal: number;
  notes?: {
    String: string;
    Valid: boolean;
  };
}

interface Order {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_phone: string;
  customer_name?: {
    String: string;
    Valid: boolean;
  };
  status: string;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  payment_status: string;
  amount_paid: number;
  pickup_delivery_date?: {
    Time: string;
    Valid: boolean;
  };
  fulfillment_type: string;
  notes?: {
    String: string;
    Valid: boolean;
  };
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

interface OrdersResponse {
  orders: Order[];
  total: number;
}

type OrderStatus = 'all' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderStatus>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: '100'
      });

      if (activeTab !== 'all') {
        params.append('status', activeTab);
      }

      const data: OrdersResponse = await api.order.get(`/api/v1/orders?${params}`);
      setOrders(data.orders || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // Fetch orders
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Format price in Rupiah
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(price);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get status color
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      preparing: 'bg-purple-100 text-purple-800',
      ready: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Get payment status color
  const getPaymentColor = (status: string) => {
    const colors: Record<string, string> = {
      unpaid: 'text-red-600',
      partially_paid: 'text-orange-600',
      paid: 'text-green-600'
    };
    return colors[status] || 'text-gray-600';
  };

  // Calculate stats
  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    completed: orders.filter(o => o.status === 'completed').length,
    revenue: orders
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.total, 0)
  };

  const tabs: { id: OrderStatus; label: string; icon: ElementType }[] = [
    { id: 'all', label: 'All Orders', icon: ShoppingCart },
    { id: 'pending', label: 'Pending', icon: Clock },
    { id: 'confirmed', label: 'Confirmed', icon: CheckCircle },
    { id: 'preparing', label: 'Preparing', icon: Package },
    { id: 'ready', label: 'Ready', icon: Package },
    { id: 'completed', label: 'Completed', icon: CheckCircle },
    { id: 'cancelled', label: 'Cancelled', icon: XCircle }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-gray-600">Manage customer orders and fulfillment</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Orders</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <ShoppingCart className="text-blue-600" size={32} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            </div>
            <Clock className="text-yellow-600" size={32} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <CheckCircle className="text-green-600" size={32} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Revenue</p>
              <p className="text-2xl font-bold">{formatPrice(stats.revenue)}</p>
            </div>
            <Package className="text-purple-600" size={32} />
          </div>
        </Card>
      </div>

      {/* Status Tabs */}
      <Card>
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const count = tab.id === 'all' ? stats.total : orders.filter(o => o.status === tab.id).length;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === tab.id ? 'bg-blue-700' : 'bg-white text-gray-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Orders Table */}
      <Card>
        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-600">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8">
            <ShoppingCart className="mx-auto mb-4 text-gray-400" size={48} />
            <p className="text-gray-600">No orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Order #</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Customer</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Items</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Total</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">Payment</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{order.order_number}</p>
                      <p className="text-xs text-gray-500">{order.fulfillment_type}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">
                        {order.customer_name?.Valid ? order.customer_name.String : 'Guest'}
                      </p>
                      <p className="text-sm text-gray-500">{order.customer_phone}</p>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm">
                        {order.items.slice(0, 2).map((item, idx) => (
                          <p key={idx} className="text-gray-700">
                            {item.quantity}x {item.product_name}
                          </p>
                        ))}
                        {order.items.length > 2 && (
                          <p className="text-gray-500 text-xs">+{order.items.length - 2} more</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <p className="font-semibold text-gray-900">{formatPrice(order.total)}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-medium ${getPaymentColor(order.payment_status)}`}>
                        {order.payment_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Order Details</h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Order Number</p>
                  <p className="font-semibold">{selectedOrder.order_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getStatusColor(selectedOrder.status)}`}>
                    {selectedOrder.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Customer</p>
                  <p className="font-semibold">
                    {selectedOrder.customer_name?.Valid ? selectedOrder.customer_name.String : 'Guest'}
                  </p>
                  <p className="text-sm text-gray-500">{selectedOrder.customer_phone}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment</p>
                  <p className={`font-semibold ${getPaymentColor(selectedOrder.payment_status)}`}>
                    {selectedOrder.payment_status.replace('_', ' ')}
                  </p>
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h3 className="font-semibold mb-2">Order Items</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-2 px-4 text-sm font-semibold text-gray-700">Product</th>
                        <th className="text-center py-2 px-4 text-sm font-semibold text-gray-700">Qty</th>
                        <th className="text-right py-2 px-4 text-sm font-semibold text-gray-700">Price</th>
                        <th className="text-right py-2 px-4 text-sm font-semibold text-gray-700">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="py-2 px-4">
                            <p className="font-medium">{item.product_name}</p>
                            {item.notes?.Valid && (
                              <p className="text-sm text-gray-500">{item.notes.String}</p>
                            )}
                          </td>
                          <td className="py-2 px-4 text-center">{item.quantity}</td>
                          <td className="py-2 px-4 text-right">{formatPrice(item.product_price)}</td>
                          <td className="py-2 px-4 text-right font-semibold">{formatPrice(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Order Summary */}
              <div className="border-t pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-semibold">{formatPrice(selectedOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Delivery Fee</span>
                    <span className="font-semibold">{formatPrice(selectedOrder.delivery_fee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Discount</span>
                    <span className="font-semibold text-green-600">-{formatPrice(selectedOrder.discount)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total</span>
                    <span>{formatPrice(selectedOrder.total)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes?.Valid && (
                <div>
                  <p className="text-sm text-gray-600">Notes</p>
                  <p className="text-gray-900">{selectedOrder.notes.String}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
