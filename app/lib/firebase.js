// lib/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBSeKOqPAd3exE5Qn_Yp8Oa8lGwG2jTm_4",
  authDomain: "bingo-70e47.firebaseapp.com",
  projectId: "bingo-70e47",
  storageBucket: "bingo-70e47.firebasestorage.app",
  messagingSenderId: "207455113775",
  appId: "1:207455113775:web:18c2f749eb369ad26d2cda",
  measurementId: "G-7ZDTZ6CL70"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;

