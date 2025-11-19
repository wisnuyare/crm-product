import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  Calendar,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  Users,
  LogOut,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'agent', 'viewer'] },
  { name: 'Conversations', href: '/conversations', icon: MessageSquare, roles: ['admin', 'agent', 'viewer'] },
  { name: 'Knowledge Base', href: '/knowledge', icon: BookOpen, roles: ['admin', 'agent'] },
  { name: 'Bookings', href: '/bookings', icon: Calendar, roles: ['admin', 'agent'] },
  { name: 'Products', href: '/products', icon: Package, roles: ['admin', 'agent'] },
  { name: 'Orders', href: '/orders', icon: ShoppingCart, roles: ['admin', 'agent'] },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, roles: ['admin', 'agent', 'viewer'] },
  { name: 'Users', href: '/users', icon: Users, roles: ['admin'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, user } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('authToken');
      localStorage.removeItem('userEmail');
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Filter navigation items based on user role
  const visibleNavigation = navigation.filter((item) =>
    role ? item.roles.includes(role) : true
  );

  return (
    <div className="flex h-screen w-64 flex-col bg-gray-900">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <h1 className="text-xl font-bold text-white">WhatsApp CRM</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleNavigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={`
                flex items-center rounded-lg px-3 py-2 text-sm font-medium
                ${
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }
              `}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-800 p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          <LogOut className="mr-3 h-5 w-5" />
          Logout
        </button>
        <div className="mt-4 text-xs text-gray-500">
          <p className="truncate">{user?.email || 'Not logged in'}</p>
          <p className="mt-1 capitalize">
            {role && <span className="font-semibold text-blue-400">{role}</span>}
          </p>
          <p className="mt-1">v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
