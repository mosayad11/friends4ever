
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
    auth,
    googleProvider
} from "./firebase.js";


/* =====================================================
   SIGN IN
===================================================== */

export async function signInWithGoogle() {
    const result = await signInWithPopup(
        auth,
        googleProvider
    );

    return result.user;
}


/* =====================================================
   SIGN OUT
===================================================== */

export async function signOutUser() {
    await signOut(auth);
}


/* =====================================================
   AUTH STATE
===================================================== */

export function watchAuthState(callback) {
    return onAuthStateChanged(auth, callback);
}


/* =====================================================
   USER-FRIENDLY ERRORS
===================================================== */

export function getAuthErrorMessage(error) {
    switch (error?.code) {
        case "auth/popup-closed-by-user":
            return "You closed the sign-in window. Please try again.";

        case "auth/popup-blocked":
            return "Your browser blocked the sign-in window. Allow popups and try again.";

        case "auth/cancelled-popup-request":
            return "A sign-in request is already in progress.";

        case "auth/unauthorized-domain":
            return "This website domain is not authorized in Firebase Authentication.";

        case "auth/network-request-failed":
            return "Network error. Check your internet connection.";

        default:
            console.error("Authentication error:", error);

            return "We couldn't complete your request. Please try again.";
    }
}
