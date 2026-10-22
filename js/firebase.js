
import { initializeApp } from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider
} from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import { getFirestore } from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


/* =====================================================
   FIREBASE CONFIGURATION
===================================================== */

// Replace these placeholders with your actual Firebase
// Web App configuration from Project Settings.

const firebaseConfig = {
    apiKey: "AIzaSyBidbwIHTsVcURoAFNq8b7YwgBgZ-4foLo",
    authDomain: "friends4ever-23f88.firebaseapp.com",
    projectId: "friends4ever-23f88",
    storageBucket: "friends4ever-23f88.firebasestorage.app",
    messagingSenderId: "1037506682699",
    appId: "1:1037506682699:web:b763a3a06277077a5f12ce"
};


/* =====================================================
   INITIALIZE FIREBASE
===================================================== */

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
    prompt: "select_account"
});
