import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '../services/analytics.service';
import { AlertCircle, Loader, TrendingUp, Users, MessagesSquare, Timer, CheckCircle, PhoneForwarded, DollarSign } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, isLoading }: { title: string; value: string | number; icon: React.ElementType; isLoading: boolean }) => (
  <div className="p-6 bg-white rounded-lg shadow">
    <div className="flex items-center">
      <div className="flex-shrink-0">
        <Icon className="w-8 h-8 text-gray-500" />
      </div>
      <div className="ml-5 w-0 flex-1">
        <dl>
          <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
          <dd>
            {isLoading ? (
              <div className="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              <div className="text-2xl font-bold text-gray-900">{value}</div>
            )}
          </dd>
        </dl>
      </div>
    </div>
  </div>
);


const OwnerDashboard = () => {
  const { data, error, isLoading } = useQuery({
    queryKey: ['platformSummary'],
    queryFn: analyticsService.getPlatformSummary,
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500" />
          <h2 className="mt-4 text-xl font-semibold text-red-600">Failed to load platform data</h2>
          <p className="mt-2 text-gray-500">{error.message}</p>
        </div>
      </div>
    );
  }

  const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);
  const formatCurrency = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  const formatPercentage = (num: number) => `${(num * 100).toFixed(1)}%`;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold">Platform Dashboard</h1>
      <p className="mt-2 text-gray-600">
        An overview of metrics across all tenants.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard
            title="Total Active Tenants"
            value={isLoading ? 0 : formatNumber(data?.total_active_tenants || 0)}
            icon={Users}
            isLoading={isLoading}
        />
        <StatCard
            title="Total Conversations"
            value={isLoading ? 0 : formatNumber(data?.total_conversations || 0)}
            icon={MessagesSquare}
            isLoading={isLoading}
        />
        <StatCard
            title="Total Messages"
            value={isLoading ? 0 : formatNumber(data?.total_messages || 0)}
            icon={TrendingUp}
            isLoading={isLoading}
        />
        <StatCard
            title="Total Platform Cost"
            value={isLoading ? 0 : formatCurrency(data?.total_platform_cost || 0)}
            icon={DollarSign}
            isLoading={isLoading}
        />
        <StatCard
            title="Avg. Response Time"
            value={isLoading ? '0s' : `${(data?.platform_average_response_time_seconds || 0).toFixed(2)}s`}
            icon={Timer}
            isLoading={isLoading}
        />
        <StatCard
            title="Resolution Rate"
            value={isLoading ? '0%' : formatPercentage(data?.platform_resolution_rate || 0)}
            icon={CheckCircle}
            isLoading={isLoading}
        />
        <StatCard
            title="Handoff Rate"
            value={isLoading ? '0%' : formatPercentage(data?.platform_handoff_rate || 0)}
            icon={PhoneForwarded}
            isLoading={isLoading}
        />
      </div>
    </div>
  );
};

export default OwnerDashboard;
