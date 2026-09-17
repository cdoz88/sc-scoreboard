import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBpIvn2o5ZrSqqsZ9uJX9W2CzPamF8AI-w",
  authDomain: "fantasy-scores-app.firebaseapp.com",
  projectId: "fantasy-scores-app",
  storageBucket: "fantasy-scores-app.firebasestorage.app",
  messagingSenderId: "211500207758",
  appId: "1:211500207758:web:6e03b98bba28b7fcd283df",
  measurementId: "G-0N899D42R4"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize anonymous auth by default to tie devices to a session
signInAnonymously(auth).catch(console.error);
