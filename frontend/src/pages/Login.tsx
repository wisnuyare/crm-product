import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// import { signInWithEmailAndPassword } from 'firebase/auth';
// import { auth } from '../services/firebase';

const LoginPage = () => {
  // const [email, setEmail] = useState('');
  // const [password, setPassword] = useState('');
  // const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Bypass authentication for local development
    localStorage.setItem('authToken', 'dummy-auth-token');
    localStorage.setItem('userEmail', 'dev@example.com');
    navigate('/');
  }, [navigate]);

  // const handleLogin = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   setError(null);
  //   try {
  //     const userCredential = await signInWithEmailAndPassword(auth, email, password);
  //     const user = userCredential.user;
  //     const token = await user.getIdToken();
      
  //     // Store the token and user info securely
  //     localStorage.setItem('authToken', token);
  //     localStorage.setItem('userEmail', user.email || '');

  //     // TODO: Implement logic to check for owner/super-admin role
  //     // For now, we'll assume a specific email is the owner
  //     if (user.email === 'owner@example.com') {
  //       navigate('/owner-dashboard');
  //     } else {
  //       navigate('/');
  //     }
  //   } catch (error) {
  //     setError('Failed to login. Please check your credentials.');
  //     console.error('Login error:', error);
  //   }
  // };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-900">Logging in...</h2>
        {/* <form className="space-y-6" onSubmit={handleLogin}>
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
                className="block w-full px-3 py-2 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
                className="block w-full px-3 py-2 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <button
              type="submit"
              className="flex justify-center w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Sign in
            </button>
          </div>
        </form> */}
      </div>
    </div>
  );
};

export default LoginPage;
