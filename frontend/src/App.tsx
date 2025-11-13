import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/layout/Layout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/Login';
import SignupPage from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { Conversations } from './pages/Conversations';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { Analytics } from './pages/Analytics';
import Settings from './pages/Settings';
import { Bookings } from './pages/Bookings';
import { Products } from './pages/Products';
import { Orders } from './pages/Orders';
import OwnerDashboard from './pages/OwnerDashboard';
import { Users } from './pages/Users';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/conversations" element={<Conversations />} />
                    <Route path="/knowledge" element={<KnowledgeBase />} />
                    <Route path="/bookings" element={<Bookings />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/users" element={<Users />} />
                    <Route path="/owner-dashboard" element={<OwnerDashboard />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
