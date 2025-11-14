// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInWithCustomToken,
  type User
} from "firebase/auth";

// Firebase configuration from Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyCZ4pnQABquhK4Vgq9vkvc6eSVo-0uIdYs",
  authDomain: "crm-product-fb.firebaseapp.com",
  projectId: "crm-product-fb",
  storageBucket: "crm-product-fb.firebasestorage.app",
  messagingSenderId: "806200656983",
  appId: "1:806200656983:web:aed9d3addb8a83af2fcf12"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

// Auth helper functions
export const signInWithEmail = (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const signInWithGoogle = () => {
  return signInWithPopup(auth, googleProvider);
};

export const signUpWithEmail = async (email: string, password: string) => {
  // This will be handled by backend signup endpoint
  // which creates Firebase user + sets custom claims
  throw new Error("Use backend signup endpoint at /api/v1/auth/signup");
};

export const signInWithToken = (token: string) => {
  return signInWithCustomToken(auth, token);
};

export const logOut = () => {
  return signOut(auth);
};

export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
