import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// REPLACE THIS with your actual Firebase config object from the console
const firebaseConfig = {
  apiKey: "AIzaSyDvkKTNS7ZMi4IOtsFy2KZ3iMOq4jGAQzk",
  authDomain: "club-e1344.firebaseapp.com",
  projectId: "club-e1344",
  storageBucket: "club-e1344.firebasestorage.app",
  messagingSenderId: "1061367534790",
  appId: "1:1061367534790:web:0119bc50d987a465d673c7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);