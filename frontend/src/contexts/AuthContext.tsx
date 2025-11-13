import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { auth, onAuthChange, logOut } from '../services/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  tenantId: string | null;
  role: string | null;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const refreshToken = async () => {
    if (user) {
      const idTokenResult = await user.getIdTokenResult(true); // Force refresh
      setTenantId(idTokenResult.claims.tenant_id as string || null);
      setRole(idTokenResult.claims.role as string || null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthChange(async (user) => {
      setUser(user);

      if (user) {
        try {
          // Get custom claims (tenant_id, role)
          const idTokenResult = await user.getIdTokenResult();
          setTenantId(idTokenResult.claims.tenant_id as string || null);
          setRole(idTokenResult.claims.role as string || null);
        } catch (error) {
          console.error('Error getting custom claims:', error);
          setTenantId(null);
          setRole(null);
        }
      } else {
        setTenantId(null);
        setRole(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const logout = async () => {
    await logOut();
    setUser(null);
    setTenantId(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, tenantId, role, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
};
