import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAGNlZB0i0pnqRb7vpigx0xAzzVVYVm1cY",
  authDomain: "studio-9848664260-1b715.firebaseapp.com",
  projectId: "studio-9848664260-1b715",
  storageBucket: "studio-9848664260-1b715.firebasestorage.app",
  messagingSenderId: "936554709602",
  appId: "1:936554709602:web:dba997370fc5d7e5f3c73b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistent cache to reduce data re-downloads and costs.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  }),
  ignoreUndefinedProperties: true,
  experimentalForceLongPolling: true,
});

export const auth = getAuth(app);
export const storage = getStorage(app);