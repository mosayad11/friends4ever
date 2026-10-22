
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { db } from "./firebase.js";


/* GET USER PROFILE */

export async function getUserProfile(uid) {
    const userRef = doc(db, "users", uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        return null;
    }

    const data = snapshot.data();

    if (
        typeof data.displayName !== "string" ||
        typeof data.displayNameLower !== "string"
    ) {
        return null;
    }

    return data;
}


/* VALIDATE DISPLAY NAME */

export function validateDisplayName(value) {
    const displayName = String(value ?? "").trim();

    if (!displayName) {
        throw new Error("اكتب اسم المستخدم الأول.");
    }

    if (displayName.length > 40) {
        throw new Error("اسم المستخدم لازم يكون 40 حرف أو أقل.");
    }

    return displayName;
}


/* CREATE USER PROFILE */

export async function createUserProfile(user, requestedName) {
    const displayName = validateDisplayName(requestedName);

    const userRef = doc(db, "users", user.uid);
    const snapshot = await getDoc(userRef);

    if (snapshot.exists()) {
        const existingData = snapshot.data();

        if (
            typeof existingData.displayName === "string" &&
            typeof existingData.displayNameLower === "string"
        ) {
            return existingData;
        }

        throw new Error(
            "حسابك موجود بالفعل، لكن بياناته القديمة محتاجة تحديث."
        );
    }

    const profile = {
        uid: user.uid,
        displayName,
        displayNameLower: displayName.toLowerCase(),
        photoURL: user.photoURL || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    await setDoc(userRef, profile);

    return {
        uid: user.uid,
        displayName,
        displayNameLower: displayName.toLowerCase(),
        photoURL: user.photoURL || ""
    };
}


/* UPDATE DISPLAY NAME */

export async function updateDisplayName(user, requestedName) {
    const displayName = validateDisplayName(requestedName);

    const userRef = doc(db, "users", user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        throw new Error("ملف حسابك مش موجود.");
    }

    const currentData = snapshot.data();

    if (typeof currentData.displayNameLower !== "string") {
        throw new Error(
            "بيانات حسابك القديمة محتاجة تحديث قبل تغيير الاسم."
        );
    }

    await updateDoc(userRef, {
        displayName,
        displayNameLower: displayName.toLowerCase(),
        updatedAt: serverTimestamp()
    });

    return {
        ...currentData,
        displayName,
        displayNameLower: displayName.toLowerCase()
    };
}
