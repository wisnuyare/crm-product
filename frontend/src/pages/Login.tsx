import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmail, signInWithGoogle } from '../services/firebase';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const userCredential = await signInWithEmail(email, password);
      const user = userCredential.user;

      // Get ID token (includes custom claims)
      const idToken = await user.getIdToken();
      const idTokenResult = await user.getIdTokenResult();

      // Store token
      localStorage.setItem('authToken', idToken);
      localStorage.setItem('userEmail', user.email || '');

      // Check if user has tenant_id (custom claim)
      if (!idTokenResult.claims.tenant_id) {
        console.warn('No tenant_id claim found - using default tenant for development');
        // TEMPORARY: Allow login without tenant_id for development
        // In production, this should redirect to a tenant selection page
        // setError('Account not properly configured. Please contact administrator.');
        // setLoading(false);
        // return;
      }

      // Navigate to dashboard
      navigate('/');
    } catch (err: unknown) {
      console.error('Login error:', err);
      let errorCode: string | undefined;
      if (typeof err === 'object' && err !== null && 'code' in err) {
        errorCode = (err as { code: string }).code;
      }

      if (errorCode === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else if (errorCode === 'auth/wrong-password') {
        setError('Incorrect password.');
      } else if (errorCode === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else {
        setError('Failed to login. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      const result = await signInWithGoogle();
      const user = result.user;

      // Send ID token to backend for verification and custom claims setup
      const idToken = await user.getIdToken();

      const response = await fetch('http://localhost:3001/api/v1/auth/google-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Google sign-in failed. Please contact administrator.');
      }

      // Store token
      localStorage.setItem('authToken', idToken);
      localStorage.setItem('userEmail', user.email || '');

      // Force token refresh to get custom claims
      await user.getIdToken(true);

      // Navigate to dashboard
      navigate('/');
    } catch (err: unknown) {
      console.error('Google login error:', err);
      const message = err instanceof Error ? err.message : 'Failed to login with Google. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-900">Sign In</h2>

        {error && (
          <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form className="space-y-6" onSubmit={handleEmailLogin}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <div className="mt-1">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-3 py-2 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="mt-1">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-3 py-2 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="flex justify-center w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 py-2 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="w-5 h-5"
          />
          Sign in with Google
        </button>

        <p className="mt-4 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <a href="/signup" className="text-blue-600 hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
