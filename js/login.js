import {
    signInWithGoogle,
    watchAuthState,
    getAuthErrorMessage
} from "./auth.js";

import { getUserProfile } from "./profile.js";
import "./sounds.js";


const loginButton = document.getElementById("login-button");
const authError = document.getElementById("auth-error");

let redirecting = false;


function showLoginError(message) {
    if (!authError) return;

    authError.textContent = message;
    authError.hidden = false;
}


async function routeUser(user) {
    if (!user || redirecting) return;

    redirecting = true;

    try {
        const profile = await getUserProfile(user.uid);

        window.location.replace(
            profile ? "./index.html" : "./setup-profile.html"
        );
    } catch (error) {
        redirecting = false;
        console.error("Profile lookup failed:", error);

        showLoginError(
            "تعذّر التحقق من حسابك. راجع اتصال الإنترنت وقواعد Firestore."
        );
    }
}


watchAuthState((user) => {
    if (user) {
        routeUser(user);
    }
});


if (loginButton) {
    loginButton.addEventListener("click", async () => {
        if (authError) {
            authError.textContent = "";
            authError.hidden = true;
        }

        loginButton.disabled = true;
        const originalText = loginButton.textContent;
        loginButton.textContent = "جاري تسجيل الدخول...";

        try {
            await signInWithGoogle();
            // watchAuthState سيتولى توجيه المستخدم.
        } catch (error) {
            console.error("Google sign-in failed:", error);

            showLoginError(getAuthErrorMessage(error));

            loginButton.disabled = false;
            loginButton.textContent = originalText || "تسجيل الدخول باستخدام Google";
        }
    });
}