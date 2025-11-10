// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// TODO: Add your own Firebase configuration from your Firebase project settings
// It's recommended to store these in environment variables for security
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

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
