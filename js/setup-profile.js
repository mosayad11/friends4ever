
import {
    watchAuthState
} from "./auth.js";

import {
    getUserProfile,
    createUserProfile
} from "./profile.js";
import "./sounds.js";


const setupForm = document.getElementById("setup-form");
const nameInput = document.getElementById("display-name");
const createButton = document.getElementById("create-account-button");
const setupError = document.getElementById("setup-error");

let currentUser = null;
let checkingAccount = true;


watchAuthState(async (user) => {
    if (!user) {
        window.location.replace("./login.html");
        return;
    }

    currentUser = user;

    try {
        const existingProfile = await getUserProfile(user.uid);

        if (existingProfile) {
            window.location.replace("./index.html");
            return;
        }

        checkingAccount = false;
        setupForm.hidden = false;
        nameInput.focus();
    } catch (error) {
        console.error("Setup account check error:", error);
        setupError.textContent =
            "We couldn't check your account. Please refresh and try again.";
    }
});


setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || checkingAccount) return;

    setupError.textContent = "";
    createButton.disabled = true;
    createButton.textContent = "Creating account...";

    try {
        await createUserProfile(currentUser, nameInput.value);
        window.location.replace("./index.html");
    } catch (error) {
        console.error("Create app profile error:", error);

        setupError.textContent =
            error.message || "Couldn't create your account. Please try again.";

        createButton.disabled = false;
        createButton.textContent = "Create account";
    }
});
