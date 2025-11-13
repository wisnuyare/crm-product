import { auth } from '../services/firebase';

/**
 * API Helper with automatic JWT token injection
 *
 * This helper ensures all API calls include the Firebase JWT token
 * in the Authorization header, enabling multi-tenant security.
 */

export interface ApiOptions extends RequestInit {
  skipAuth?: boolean; // For public endpoints like /health
}

/**
 * Make an authenticated API call to the backend
 *
 * @param endpoint - API endpoint (e.g., '/api/v1/tenants')
 * @param options - Fetch options (method, body, etc.)
 * @returns Parsed JSON response
 */
export const apiCall = async <T = any>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> => {
  const { skipAuth = false, ...fetchOptions } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };

  // Add JWT token for authenticated requests
  if (!skipAuth) {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated. Please log in.');
    }

    try {
      const idToken = await user.getIdToken();
      headers['Authorization'] = `Bearer ${idToken}`;
    } catch (error) {
      console.error('Failed to get ID token:', error);
      throw new Error('Authentication failed. Please log in again.');
    }
  }

  // Construct full URL
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  const url = `${baseUrl}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    // Handle non-200 responses
    if (!response.ok) {
      let errorMessage = `API error: ${response.status} ${response.statusText}`;

      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // Response might not be JSON
      }

      // Handle specific status codes
      if (response.status === 401) {
        throw new Error('Unauthorized. Please log in again.');
      } else if (response.status === 403) {
        throw new Error('Access denied. You do not have permission to perform this action.');
      } else if (response.status === 404) {
        throw new Error('Resource not found.');
      } else if (response.status >= 500) {
        throw new Error('Server error. Please try again later.');
      }

      throw new Error(errorMessage);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null as T;
    }

    // Parse and return JSON response
    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error. Please check your connection.');
  }
};

/**
 * Convenience method for GET requests
 */
export const apiGet = <T = any>(endpoint: string, options?: ApiOptions): Promise<T> => {
  return apiCall<T>(endpoint, { ...options, method: 'GET' });
};

/**
 * Convenience method for POST requests
 */
export const apiPost = <T = any>(
  endpoint: string,
  data?: any,
  options?: ApiOptions
): Promise<T> => {
  return apiCall<T>(endpoint, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
};

/**
 * Convenience method for PUT requests
 */
export const apiPut = <T = any>(
  endpoint: string,
  data?: any,
  options?: ApiOptions
): Promise<T> => {
  return apiCall<T>(endpoint, {
    ...options,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
};

/**
 * Convenience method for PATCH requests
 */
export const apiPatch = <T = any>(
  endpoint: string,
  data?: any,
  options?: ApiOptions
): Promise<T> => {
  return apiCall<T>(endpoint, {
    ...options,
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  });
};

/**
 * Convenience method for DELETE requests
 */
export const apiDelete = <T = any>(endpoint: string, options?: ApiOptions): Promise<T> => {
  return apiCall<T>(endpoint, { ...options, method: 'DELETE' });
};
