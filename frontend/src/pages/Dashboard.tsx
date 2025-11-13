import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader } from '../components/ui/Card';
import { analyticsService } from '../services/analytics.service';
import { billingService } from '../services/billing.service';
import { MessageSquare, TrendingUp, Users, DollarSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Dashboard() {
  const { tenantId } = useAuth();

  // Fetch tenant summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['tenant-summary', tenantId],
    queryFn: () => analyticsService.getTenantSummary({}),
    enabled: !!tenantId,
  });

  // Fetch quota status
  const { data: quota, isLoading: quotaLoading } = useQuery({
    queryKey: ['quota-status', tenantId],
    queryFn: () => billingService.getQuotaStatus(tenantId!),
    enabled: !!tenantId,
  });

  if (summaryLoading || quotaLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  const stats = [
    {
      name: 'Total Conversations',
      value: summary?.totalConversations || 0,
      icon: MessageSquare,
      color: 'bg-blue-500',
    },
    {
      name: 'Total Messages',
      value: summary?.totalMessages || 0,
      icon: TrendingUp,
      color: 'bg-green-500',
    },
    {
      name: 'Resolution Rate',
      value: `${((summary?.resolutionRate || 0) * 100).toFixed(1)}%`,
      icon: Users,
      color: 'bg-purple-500',
    },
    {
      name: 'Total Cost',
      value: `$${(summary?.totalCost || 0).toFixed(2)}`,
      icon: DollarSign,
      color: 'bg-yellow-500',
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-2 text-gray-600">Welcome to your WhatsApp CRM dashboard</p>

      {/* Stats Grid */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <div className="flex items-center">
              <div className={`rounded-lg p-3 ${stat.color}`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quota Status */}
      {quota && (
        <Card className="mt-8">
          <CardHeader title="Message Quota" subtitle={`${quota.tier.toUpperCase()} Plan`} />
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">
                  {quota.messagesUsed.toLocaleString()} / {quota.messageQuota.toLocaleString()} messages
                </span>
                <span className="text-gray-500">{quota.percentageUsed.toFixed(1)}%</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                <div
                  className={`h-2 rounded-full ${
                    quota.percentageUsed > 90
                      ? 'bg-red-500'
                      : quota.percentageUsed > 75
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(quota.percentageUsed, 100)}%` }}
                />
              </div>
            </div>
            {!quota.canSendMessage && (
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">
                  ⚠️ Message quota exceeded. Upgrade your plan to continue sending messages.
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Recent Activity */}
      <Card className="mt-8">
        <CardHeader title="Recent Activity" subtitle="Last 30 days" />
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <p className="font-medium text-gray-900">Average Response Time</p>
              <p className="text-sm text-gray-500">
                {(summary?.averageResponseTimeSeconds || 0).toFixed(1)}s
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <p className="font-medium text-gray-900">Handoff Rate</p>
              <p className="text-sm text-gray-500">
                {((summary?.handoffRate || 0) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
