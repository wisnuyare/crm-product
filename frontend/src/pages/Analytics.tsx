import { useEffect, useState, useCallback } from 'react';
import { Card } from '../components/ui/Card';
import {
  BarChart3,
  MessageSquare,
  Clock,
  CheckCircle,
  Users,
  DollarSign,
  TrendingUp,
  PhoneForwarded,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface PlatformMetrics {
  total_conversations: number;
  total_messages: number;
  platform_average_response_time_seconds: number;
  platform_resolution_rate: number;
  platform_handoff_rate: number;
  total_platform_cost: number;
}

interface TenantMetrics {
  tenant_id: string;
  total_conversations: number;
  total_messages: number;
  avg_response_time_seconds: number;
  resolution_rate: number;
  handoff_rate: number;
  total_cost: number;
}

export function Analytics() {
  const { role, tenantId } = useAuth();
  const [metrics, setMetrics] = useState<TenantMetrics | PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  const loadMetrics = useCallback(async () => {
    if (!tenantId) return;

    setLoading(true);
    setError(null);

    try {
      // For now, use mock data since analytics service might not be fully implemented
      // In production, this would call: await api.analytics.get('/api/v1/metrics')

      // Mock data for demonstration
      const mockMetrics: TenantMetrics = {
        tenant_id: tenantId,
        total_conversations: 127,
        total_messages: 1543,
        avg_response_time_seconds: 2.8,
        resolution_rate: 0.87,
        handoff_rate: 0.13,
        total_cost: 45.32,
      };

      setMetrics(mockMetrics);
    } catch (err: unknown) {
      console.error('Failed to load metrics:', err);
      const message = err instanceof Error ? err.message : 'Failed to load analytics';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadMetrics();
  }, [timeRange, loadMetrics]);

  const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);
  const formatCurrency = (num: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  const formatPercentage = (num: number) => `${(num * 100).toFixed(1)}%`;
  const formatSeconds = (seconds: number) => `${seconds.toFixed(1)}s`;

  const StatCard = ({
    title,
    value,
    icon: Icon,
    color = 'text-blue-600',
  }: {
    title: string;
    value: string | number;
    icon: React.ElementType;
    color?: string;
  }) => (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <Icon className={`${color} w-8 h-8`} />
      </div>
    </Card>
  );

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-2 text-gray-600">Detailed metrics and insights</p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <Card className="mt-8">
          <div className="text-center py-12">
            <BarChart3 className="mx-auto h-12 w-12 text-red-400" />
            <p className="mt-4 text-red-600 font-semibold">Failed to load analytics</p>
            <p className="mt-2 text-sm text-gray-500">{error}</p>
            <button
              onClick={loadMetrics}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <Card className="mt-8">
          <div className="text-center py-12">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-4 text-gray-500">No analytics data available</p>
          </div>
        </Card>
      </div>
    );
  }

  const isTenantMetrics = 'tenant_id' in metrics;
  const tenantMetrics = isTenantMetrics ? metrics : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-2 text-gray-600">
            {role === 'admin'
              ? 'Comprehensive insights into your tenant performance'
              : 'View key metrics and performance indicators'}
          </p>
        </div>

        {/* Time Range Selector */}
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeRange === range
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Conversations"
          value={formatNumber(tenantMetrics?.total_conversations || 0)}
          icon={MessageSquare}
          color="text-blue-600"
        />

        <StatCard
          title="Total Messages"
          value={formatNumber(tenantMetrics?.total_messages || 0)}
          icon={TrendingUp}
          color="text-green-600"
        />

        <StatCard
          title="Avg Response Time"
          value={formatSeconds(tenantMetrics?.avg_response_time_seconds || 0)}
          icon={Clock}
          color="text-purple-600"
        />

        <StatCard
          title="Resolution Rate"
          value={formatPercentage(tenantMetrics?.resolution_rate || 0)}
          icon={CheckCircle}
          color="text-emerald-600"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Handoff Rate"
          value={formatPercentage(tenantMetrics?.handoff_rate || 0)}
          icon={PhoneForwarded}
          color="text-amber-600"
        />

        {role === 'admin' && (
          <StatCard
            title="Total LLM Cost"
            value={formatCurrency(tenantMetrics?.total_cost || 0)}
            icon={DollarSign}
            color="text-red-600"
          />
        )}

        <StatCard
          title="Active Agents"
          value={formatNumber(3)}
          icon={Users}
          color="text-indigo-600"
        />
      </div>

      {/* Charts Section (Placeholder for future implementation) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold mb-4">Message Volume Trend</h3>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center text-gray-500">
              <BarChart3 className="mx-auto h-12 w-12 mb-2" />
              <p className="text-sm">Chart visualization coming soon</p>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold mb-4">Response Time Distribution</h3>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center text-gray-500">
              <Clock className="mx-auto h-12 w-12 mb-2" />
              <p className="text-sm">Chart visualization coming soon</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Performance Insights */}
      <Card>
        <h3 className="text-lg font-semibold mb-4">Performance Insights</h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="text-green-600 mt-0.5" size={20} />
            <div>
              <p className="font-medium">Strong resolution rate</p>
              <p className="text-sm text-gray-600">
                {formatPercentage(tenantMetrics?.resolution_rate || 0)} of conversations are
                resolved successfully without escalation.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock className="text-blue-600 mt-0.5" size={20} />
            <div>
              <p className="font-medium">Fast response time</p>
              <p className="text-sm text-gray-600">
                Average response time of {formatSeconds(tenantMetrics?.avg_response_time_seconds || 0)} is
                below the industry standard.
              </p>
            </div>
          </div>

          {role === 'admin' && (
            <div className="flex items-start gap-3">
              <DollarSign className="text-purple-600 mt-0.5" size={20} />
              <div>
                <p className="font-medium">Cost efficiency</p>
                <p className="text-sm text-gray-600">
                  Total LLM cost of {formatCurrency(tenantMetrics?.total_cost || 0)} for{' '}
                  {formatNumber(tenantMetrics?.total_conversations || 0)} conversations.
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
