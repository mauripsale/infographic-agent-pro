import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// services/firebaseConfig.ts
// IMPORTANT: Replace with your own Firebase project's configuration.
export const firebaseConfig = {
  apiKey: "AIzaSyBZJOqyLOu7KK2yoRP5GKpl2TFSYKGf4bI",
  authDomain: "qwiklabs-asl-04-f9d4ba2925b9.firebaseapp.com",
  projectId: "qwiklabs-asl-04-f9d4ba2925b9",
  storageBucket: "qwiklabs-asl-04-f9d4ba2925b9.firebasestorage.app",
  messagingSenderId: "218788847170",
  appId: "1:218788847170:web:5cb315322d8129984bd7db",
  measurementId: "G-FJVR1SD5T4"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);
