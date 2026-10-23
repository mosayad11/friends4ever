import {
    signOutUser,
    watchAuthState
} from "./auth.js";

import {
    getUserProfile,
    updateDisplayName
} from "./profile.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    getCountFromServer,
    query,
    where,
    orderBy,
    startAt,
    endAt,
    limit,
    onSnapshot,
    writeBatch,
    setDoc,
    addDoc,
    updateDoc,
    serverTimestamp,
    runTransaction,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { db } from "./firebase.js";
import { playSound } from "./sounds.js";


/* =========================================================
   ELEMENTS AND STATE
========================================================= */

const $ = (id) => document.getElementById(id);

const loadingScreen = $("home-loading");
const homeScreen = $("home-screen");
const workspace = document.querySelector(".workspace");

const userPhoto = $("user-photo");
const avatarFallback = $("avatar-fallback");
const userName = $("user-name");
const userEmail = $("user-email");

const profileMenuButton = $("profile-menu-button");
const profileEditor = $("profile-editor");
const editForm = $("profile-edit-form");
const editNameInput = $("edit-display-name");
const updateButton = $("update-profile-button");
const editError = $("edit-error");
const editSuccess = $("edit-success");

const logoutButton = $("logout-button");
const homeError = $("home-error");
const connectionStatus = $("connection-status");

const settingsToggle = $("settings-toggle");
const settingsPanel = $("settings-panel");
const settingsClose = $("settings-close");
const themeOptions = document.querySelectorAll("[data-theme-choice]");
const chatPanel = document.querySelector(".chat-panel");
const profileCountValue = $("profile-count-value");

const themeToggle = $("theme-toggle");
const themeIcon = $("theme-icon");

const userSearch = $("user-search");
const clearSearchButton = $("clear-search");
const searchHint = $("search-hint");
const searchResults = $("search-results");

const conversationList = $("conversation-list");
const conversationsEmpty = $("conversations-empty");
const conversationCount = $("conversation-count");

const chatPlaceholder = $("chat-placeholder");
const activeChat = $("active-chat");
const chatUserPhoto = $("chat-user-photo");
const chatUserFallback = $("chat-user-fallback");
const chatUserName = $("chat-user-name");
const chatSubtitle = $("chat-subtitle");
const messagesList = $("messages-list");
const chatError = $("chat-error");
const messageForm = $("message-form");
const messageInput = $("message-input");
const sendMessageButton = $("send-message-button");
const backToListButton = $("back-to-list");

const chatHeader = document.querySelector(".chat-header");

chatPanel?.prepend(settingsPanel);

const requestPanel = document.createElement("section");
requestPanel.className = "chat-request-panel";
requestPanel.hidden = true;
requestPanel.setAttribute("aria-live", "polite");
chatHeader?.after(requestPanel);

let currentUser = null;
let currentProfile = null;
let authStarted = false;
let profileSaveInProgress = false;

let unsubscribeChats = null;
let unsubscribeMessages = null;
let searchTimer = null;

let chatRecords = [];
let activeChatId = null;
let activeChatData = null;
let activeChatPartner = null;
let messageCache = [];
let searchGeneration = 0;
const visibleLastMessageByChat = new Map();

const readResetInProgress = new Set();
let receivedMessageIds = new Set();
let hasReceivedInitialMessageSnapshot = false;

let draftPartner = null;


/* =========================================
   CUSTOM MODAL SYSTEM
========================================= */

const customModalOverlay = document.getElementById(
    "custom-modal-overlay"
);

const customModal = document.getElementById(
    "custom-modal"
);

const customModalTitle = document.getElementById(
    "custom-modal-title"
);

const customModalDescription = document.getElementById(
    "custom-modal-description"
);

const customModalIcon = document.getElementById(
    "custom-modal-icon"
);

const customModalContent = document.getElementById(
    "custom-modal-content"
);

const customModalActions = document.getElementById(
    "custom-modal-actions"
);

const customModalError = document.getElementById(
    "custom-modal-error"
);

let customModalResolver = null;

function closeCustomModal(result = null) {
    if (!customModalOverlay) return;

    customModalOverlay.classList.remove("is-visible");
    customModalOverlay.setAttribute("aria-hidden", "true");

    document.removeEventListener(
        "keydown",
        handleCustomModalKeydown
    );

    const resolver = customModalResolver;
    customModalResolver = null;

    if (resolver) resolver(result);
}

function handleCustomModalKeydown(event) {
    if (event.key === "Escape") {
        closeCustomModal(null);
    }

    if (
        event.key === "Enter" &&
        !event.shiftKey &&
        customModal?.dataset.modalType === "edit" &&
        document.activeElement === customModalContent.querySelector("textarea")
    ) {
        event.preventDefault();

        customModalActions
            .querySelector('[data-action="confirm"]')
            ?.click();
    }
}

function showCustomModal({
    type = "info",
    title = "Friends4Ever",
    description = "",
    icon = "✦",
    content = null,
    buttons = []
}) {
    if (!customModalOverlay) {
        console.error(
            "Custom modal elements were not found in index.html."
        );

        return Promise.resolve(null);
    }

    if (customModalResolver) {
        closeCustomModal(null);
    }

    customModal.dataset.modalType = type;
    customModalTitle.textContent = title;
    customModalDescription.textContent = description;
    customModalIcon.textContent = icon;

    customModalContent.replaceChildren();
    customModalActions.replaceChildren();

    customModalError.hidden = true;
    customModalError.textContent = "";

    if (content) {
        customModalContent.appendChild(content);
    }

    for (const buttonConfig of buttons) {
        const button = document.createElement("button");

        button.type = "button";
        button.className =
            "custom-modal-button " +
            (buttonConfig.style || "custom-modal-button-secondary");

        button.textContent = buttonConfig.label;

        if (buttonConfig.action === "confirm") {
            button.dataset.action = "confirm";
        }

        button.addEventListener("click", async () => {
            if (buttonConfig.action === "cancel") {
                closeCustomModal(null);
                return;
            }

            if (buttonConfig.onClick) {
                button.disabled = true;

                try {
                    const result = await buttonConfig.onClick();

                    if (result !== false) {
                        closeCustomModal(result ?? true);
                    }
                } catch (error) {
                    console.error(error);

                    customModalError.textContent =
                        error?.message ||
                        "Something went wrong. Please try again.";

                    customModalError.hidden = false;
                    button.disabled = false;
                }

                return;
            }

            closeCustomModal(
                buttonConfig.value ?? buttonConfig.action ?? true
            );
        });

        customModalActions.appendChild(button);
    }

    customModalOverlay.classList.add("is-visible");
    customModalOverlay.setAttribute("aria-hidden", "false");

    document.addEventListener(
        "keydown",
        handleCustomModalKeydown
    );

    requestAnimationFrame(() => {
        const firstInput = customModalContent.querySelector(
            "textarea, input"
        );

        if (firstInput) {
            firstInput.focus();
        } else {
            customModalActions.querySelector("button")?.focus();
        }
    });

    return new Promise(resolve => {
        customModalResolver = resolve;
    });
}


/* =========================================
   EDIT MESSAGE MODAL
========================================= */

async function editMessage(message) {
    const messageId = message?.id;
    const currentText = String(message?.text || "");

    if (!messageId) {
        console.error("Missing message id for edit.", message);
        return false;
    }

    const textarea = document.createElement("textarea");

    textarea.className = "custom-modal-input";
    textarea.maxLength = 5000;
    textarea.value = currentText;
    textarea.placeholder = "Write your updated message...";

    const result = await showCustomModal({
        type: "edit",
        title: "Edit your message",
        description: "Make your changes and save them when you're ready.",
        icon: "✎",
        content: textarea,
        buttons: [
            {
                label: "Cancel",
                action: "cancel",
                style: "custom-modal-button-secondary"
            },
            {
                label: "Save changes",
                action: "confirm",
                style: "custom-modal-button-primary",
                onClick: async () => {
                    const newText = textarea.value.trim();

                    if (!newText) {
                        customModalError.textContent =
                            "Message cannot be empty.";

                        customModalError.hidden = false;

                        return false;
                    }

                    if (newText === currentText.trim()) {
                        return true;
                    }

                    await updateDoc(
                        doc(db, "chats", activeChatId, "messages", messageId),
                        {
                            text: newText,
                            editedAt: serverTimestamp()
                        }
                    );

                    return true;
                }
            }
        ]
    });

    return result;
}


/* =========================================
   DELETE MESSAGE MODAL
========================================= */

async function deleteMessage(message) {
    const messageId = message?.id;
    const chatId = activeChatId;
    const isOwnMessage = message?.senderId === currentUser?.uid;

    if (!messageId || !chatId || !currentUser) return;

    const deleteChoice = document.createElement("div");
    deleteChoice.className = "custom-modal-content";

    const options = isOwnMessage
        ? [
            {
                value: "me",
                title: "Delete for me",
                description: "Remove this message from your view only."
            },
            {
                value: "everyone",
                title: "Delete for everyone",
                description: "Remove this message for everyone in the chat."
            }
        ]
        : [
            {
                value: "me",
                title: "Delete for me",
                description: "Hide this message from your view. The other person will still see it."
            }
        ];

    for (const option of options) {
        const label = document.createElement("label");
        label.className = "custom-modal-choice";

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "delete-message-scope";
        radio.value = option.value;
        radio.checked = option.value === "me";

        const text = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent = option.title;

        const description = document.createElement("small");
        description.textContent = option.description;

        text.append(title, description);
        label.append(radio, text);
        deleteChoice.appendChild(label);
    }

    await showCustomModal({
        type: "delete",
        title: "Delete message?",
        description: isOwnMessage
            ? "Choose whether to delete this message just for you or for everyone."
            : "This message will be removed from your view only.",
        icon: "⌫",
        content: deleteChoice,
        buttons: [
            {
                label: "Cancel",
                action: "cancel",
                style: "custom-modal-button-secondary"
            },
            {
                label: "Delete message",
                action: "confirm",
                style: "custom-modal-button-danger",
                onClick: async () => {
                    const scope = deleteChoice.querySelector(
                        'input[name="delete-message-scope"]:checked'
                    )?.value;

                    const messageRef = doc(
                        db,
                        "chats",
                        chatId,
                        "messages",
                        messageId
                    );

                    if (scope === "everyone" && isOwnMessage) {
                        await updateDoc(messageRef, {
                            text: "",
                            deletedForEveryone: true,
                            deletedAt: serverTimestamp()
                        });
                    } else {
                        await updateDoc(messageRef, {
                            deletedFor: arrayUnion(currentUser.uid)
                        });
                    }

                    return true;
                }
            }
        ]
    });
}


/* =========================================
   MESSAGE READ RECEIPTS
========================================= */

async function markIncomingMessagesAsRead(messages, chatId) {
    if (!currentUser || !chatId || !Array.isArray(messages)) {
        return;
    }

    const unreadIncomingMessages = messages.filter(message =>
        message.senderId !== currentUser.uid &&
        !message.deletedForEveryone &&
        !(message.deletedFor || []).includes(currentUser.uid) &&
        !(message.readBy || []).includes(currentUser.uid)
    );

    if (!unreadIncomingMessages.length) return;

    try {
        const batch = writeBatch(db);

        for (const message of unreadIncomingMessages) {
            batch.update(
                doc(db, "chats", chatId, "messages", message.id),
                { readBy: arrayUnion(currentUser.uid) }
            );
        }

        await batch.commit();
    } catch (error) {
        console.error("Could not mark messages as read:", error);
    }
}


/* =========================================================
   HELPERS
========================================================= */

function setMessage(element, message, visible = true) {
    if (!element) return;

    element.textContent = message || "";
    element.hidden = !visible || !message;
}

function hideMessage(element) {
    setMessage(element, "", false);
}

function setConnectionState(message, online = true) {
    if (!connectionStatus) return;

    connectionStatus.replaceChildren();

    const dot = document.createElement("span");
    dot.className = `status-dot${online ? "" : " offline"}`;

    connectionStatus.append(
        dot,
        document.createTextNode(message)
    );
}

function escapeInitial(name) {
    const trimmed = String(name || "").trim();
    return Array.from(trimmed)[0]?.toUpperCase() || "F";
}

function formatTime(value) {
    if (!value) return "";

    const date = typeof value.toDate === "function"
        ? value.toDate()
        : new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function formatConversationTime(value) {
    if (!value) return "";

    const date = typeof value.toDate === "function"
        ? value.toDate()
        : new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();

    if (sameDay) return formatTime(date);

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (date.toDateString() === yesterday.toDateString()) {
        return "Yesterday";
    }

    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric"
    }).format(date);
}

function sortUids(uidA, uidB) {
    return [uidA, uidB].sort((a, b) => a.localeCompare(b));
}

function makeChatId(uidA, uidB) {
    return sortUids(uidA, uidB).join("__");
}

function partnerUidFrom(chatData) {
    return (chatData.participants || [])
        .find((uid) => uid !== currentUser?.uid) || null;
}

function profileNameForChat(chatData, uid) {
    return chatData.participantNames?.[uid] || "Friend";
}

function profilePhotoForChat(chatData, uid) {
    return chatData.participantPhotos?.[uid] || "";
}

function showAvatar(imageElement, fallbackElement, photoURL, name) {
    if (!imageElement || !fallbackElement) return;

    fallbackElement.textContent = escapeInitial(name);

    if (!photoURL) {
        imageElement.hidden = true;
        fallbackElement.hidden = false;
        return;
    }

    imageElement.onerror = () => {
        imageElement.hidden = true;
        fallbackElement.hidden = false;
    };

    imageElement.onload = () => {
        imageElement.hidden = false;
        fallbackElement.hidden = true;
    };

    imageElement.src = photoURL;
}

function makeMiniAvatar(photoURL, name) {
    const wrapper = document.createElement("span");
    wrapper.className = "mini-avatar";
    wrapper.textContent = escapeInitial(name);

    if (photoURL) {
        const img = document.createElement("img");

        img.alt = "";
        img.loading = "lazy";
        img.src = photoURL;

        img.onerror = () => {
            img.remove();
            wrapper.textContent = escapeInitial(name);
        };

        wrapper.replaceChildren(img);
    }

    return wrapper;
}

function setWorkspaceVisible(isChatOpen) {
    workspace?.classList.toggle(
        "chat-open",
        Boolean(isChatOpen)
    );
}

function scrollMessagesToBottom() {
    if (!messagesList) return;

    requestAnimationFrame(() => {
        messagesList.scrollTop = messagesList.scrollHeight;
    });
}

function showChatError(message) {
    setMessage(chatError, message, true);
}

function setChatBusy(busy) {
    if (sendMessageButton) {
        sendMessageButton.disabled = busy;
    }

    if (messageInput) {
        messageInput.disabled = busy;
    }
}


/* =========================================================
   THEME
========================================================= */

const THEME_KEY = "friends4ever-theme";

function readStoredTheme() {
    try {
        const stored = localStorage.getItem(THEME_KEY);
        return ["dark", "light", "ocean", "sunset"].includes(stored)
            ? stored
            : "dark";
    } catch {
        return "dark";
    }
}

function persistTheme(theme) {
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {
        // Keep the current page theme working even if storage is unavailable.
    }
}

function applyTheme(theme) {
    const supportedThemes = ["dark", "light", "ocean", "sunset"];
    const selected = supportedThemes.includes(theme) ? theme : "dark";

    document.documentElement.dataset.theme = selected;

    themeOptions.forEach((option) => {
        option.classList.toggle(
            "is-selected",
            option.dataset.themeChoice === selected
        );
    });

    if (themeIcon) {
        themeIcon.textContent = selected === "dark" ? "☀" : "☾";
    }

    if (themeToggle) {
        const next = selected === "dark" ? "light" : "dark";

        themeToggle.setAttribute(
            "aria-label",
            `Switch to ${next} mode`
        );

        themeToggle.title = `Switch to ${next} mode`;
    }

    const themeColor = document.querySelector(
        'meta[name="theme-color"]'
    );

    if (themeColor) {
        themeColor.content = selected === "dark"
            ? "#101827"
            : selected === "sunset"
                ? "#2b1723"
                : selected === "ocean"
                    ? "#062a3a"
                    : "#f2f5fc";
    }
}

applyTheme(readStoredTheme());

themeToggle?.addEventListener("click", () => {
    const next =
        document.documentElement.dataset.theme === "dark"
            ? "light"
            : "dark";

    applyTheme(next);
    persistTheme(next);
});

function setSettingsOpen(open) {
    if (!settingsPanel || !settingsToggle) return;

    settingsPanel.hidden = !open;
    settingsToggle.setAttribute("aria-expanded", String(open));

    if (open && window.matchMedia("(max-width: 760px)").matches) {
        setWorkspaceVisible(true);
    } else if (
        !open &&
        !activeChatId &&
        window.matchMedia("(max-width: 760px)").matches
    ) {
        setWorkspaceVisible(false);
    }
}

settingsToggle?.addEventListener("click", () => {
    setSettingsOpen(settingsPanel.hidden);
});

settingsClose?.addEventListener("click", () => {
    setSettingsOpen(false);
});

themeOptions.forEach((option) => {
    option.addEventListener("click", () => {
        const selected = option.dataset.themeChoice;
        applyTheme(selected);
        persistTheme(selected);
    });
});

document.addEventListener("click", (event) => {
    if (
        settingsPanel &&
        !settingsPanel.hidden &&
        !event.target.closest("#settings-panel, #settings-toggle")
    ) {
        setSettingsOpen(false);
    }

    if (!event.target.closest(".message-row")) {
        document
            .querySelectorAll(".message-row.actions-visible")
            .forEach((row) => {
                row.classList.remove("actions-visible");
                const actions = row.querySelector(".message-actions");
                if (actions) actions.style.display = "none";
            });
    }
});


/* =========================================================
   PROFILE
========================================================= */

function renderProfile(user, profile) {
    currentUser = user;
    currentProfile = profile;

    if (userName) {
        userName.textContent = profile.displayName || "Friend";
    }

    // Email is displayed only to the signed-in owner, from Firebase Auth.
    if (userEmail) {
        userEmail.textContent = user.email || "";
    }

    if (editNameInput) {
        editNameInput.value = profile.displayName || "";
    }

    showAvatar(
        userPhoto,
        avatarFallback,
        profile.photoURL || user.photoURL || "",
        profile.displayName
    );

    loadingScreen.hidden = true;
    homeScreen.hidden = false;
}

profileMenuButton?.addEventListener("click", () => {
    profileEditor.hidden = !profileEditor.hidden;

    if (!profileEditor.hidden) {
        editNameInput?.focus();
    }
});

editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    hideMessage(editError);
    hideMessage(editSuccess);

    if (!currentUser || profileSaveInProgress) return;

    profileSaveInProgress = true;

    const originalText = updateButton?.textContent;

    if (updateButton) {
        updateButton.disabled = true;
        updateButton.textContent = "Saving…";
    }

    try {
        currentProfile = await updateDisplayName(
            currentUser,
            editNameInput.value
        );

        if (userName) {
            userName.textContent = currentProfile.displayName;
        }

        if (editNameInput) {
            editNameInput.value = currentProfile.displayName;
        }

        // Refresh this user's display metadata in the active conversation.
        if (activeChatId && activeChatData && currentUser?.uid) {
            const chatRef = doc(db, "chats", activeChatId);

            const names = {
                ...(activeChatData.participantNames || {})
            };

            const photos = {
                ...(activeChatData.participantPhotos || {})
            };

            names[currentUser.uid] = currentProfile.displayName;

            photos[currentUser.uid] =
                currentProfile.photoURL || currentUser.photoURL || "";

            try {
                await updateDoc(chatRef, {
                    participantNames: names,
                    participantPhotos: photos,
                    updatedAt: serverTimestamp()
                });
            } catch (metadataError) {
                // Profile save is already complete; metadata refresh is best-effort.
                console.warn(
                    "Chat display metadata was not refreshed:",
                    metadataError
                );
            }
        }

        setMessage(editSuccess, "Display name updated.", true);
    } catch (error) {
        console.error("Failed to update display name:", error);

        setMessage(
            editError,
            error.message || "Could not update your name.",
            true
        );
    } finally {
        profileSaveInProgress = false;

        if (updateButton) {
            updateButton.disabled = false;
            updateButton.textContent = originalText || "Save name";
        }
    }
});
/* =========================================================
   SEARCH USERS
========================================================= */

function renderSearchState(message) {
    searchResults.replaceChildren();

    if (message) {
        const note = document.createElement("p");
        note.className = "empty-note";
        note.textContent = message;
        searchResults.append(note);
    }
}

function renderSearchResults(profiles) {
    searchResults.replaceChildren();

    if (!profiles.length) {
        renderSearchState("No matching people found.");
        return;
    }

    for (const profile of profiles) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "search-result";

        const avatar = makeMiniAvatar(
            profile.photoURL,
            profile.displayName
        );

        const text = document.createElement("span");
        text.className = "person-text";

        const name = document.createElement("strong");
        name.textContent = profile.displayName || "Friend";

        const sub = document.createElement("small");
        sub.textContent = "Start a private conversation";

        text.append(name, sub);

        const mark = document.createElement("span");
        mark.className = "start-chat-mark";
        mark.textContent = "↗";
        mark.setAttribute("aria-hidden", "true");

        button.append(avatar, text, mark);
        button.addEventListener("click", () => {
            openConversationWith(profile);
        });

        searchResults.append(button);
    }
}

async function searchUsers(rawTerm) {
    const term = rawTerm.trim().toLowerCase();
    const generation = ++searchGeneration;

    if (clearSearchButton) {
        clearSearchButton.hidden = !rawTerm;
    }

    if (term.length < 1) {
        renderSearchState("");

        if (searchHint) {
            searchHint.textContent = "Type a name to find friends.";
        }

        return;
    }

    if (searchHint) {
        searchHint.textContent = "Searching…";
    }

    try {
        const usersQuery = query(
            collection(db, "users"),
            orderBy("displayNameLower"),
            startAt(term),
            endAt(term + "\uf8ff"),
            limit(12)
        );

        const snapshot = await getDocs(usersQuery);

        if (generation !== searchGeneration) return;

        const profiles = snapshot.docs
            .map((item) => item.data())
            .filter((profile) =>
                profile.uid &&
                profile.uid !== currentUser?.uid &&
                typeof profile.displayName === "string"
            );

        if (searchHint) {
            searchHint.textContent = profiles.length
                ? `${profiles.length} ${
                    profiles.length === 1 ? "person" : "people"
                } found`
                : "No matches yet.";
        }

        renderSearchResults(profiles);
    } catch (error) {
        console.error("User search failed:", error);

        if (generation !== searchGeneration) return;

        if (searchHint) {
            searchHint.textContent = "Search is temporarily unavailable.";
        }

        renderSearchState(
            "Check your Firestore rules and try again."
        );
    }
}

userSearch?.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
        searchUsers(userSearch.value);
    }, 250);
});

clearSearchButton?.addEventListener("click", () => {
    userSearch.value = "";
    clearSearchButton.hidden = true;
    searchGeneration++;

    renderSearchState("");

    if (searchHint) {
        searchHint.textContent = "Type a name to find friends.";
    }

    userSearch.focus();
});


/* =========================================================
   UNREAD MESSAGE COUNTS
========================================================= */

function unreadCountFor(chatData, uid = currentUser?.uid) {
    const value = chatData?.unreadCounts?.[uid];

    return Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : 0;
}

async function markChatAsRead(chatId) {
    if (
        !currentUser ||
        !chatId ||
        readResetInProgress.has(chatId)
    ) {
        return;
    }

    readResetInProgress.add(chatId);

    try {
        const chatRef = doc(db, "chats", chatId);

        const result = await runTransaction(
            db,
            async (transaction) => {
                const snapshot = await transaction.get(chatRef);

                if (!snapshot.exists()) return null;

                const data = snapshot.data();

                if (!(data.participants || []).includes(currentUser.uid)) {
                    return null;
                }

                const oldCounts = data.unreadCounts || {};

                const otherUid = (data.participants || [])
                    .find((uid) => uid !== currentUser.uid);

                const hasOwnCount = Object.prototype
                    .hasOwnProperty.call(oldCounts, currentUser.uid);

                const hasOtherCount = otherUid
                    ? Object.prototype.hasOwnProperty.call(
                        oldCounts,
                        otherUid
                    )
                    : true;

                if (
                    oldCounts[currentUser.uid] === 0 &&
                    hasOwnCount &&
                    hasOtherCount
                ) {
                    return null;
                }

                const unreadCounts = {
                    ...oldCounts,
                    [currentUser.uid]: 0
                };

                if (
                    otherUid &&
                    !Number.isFinite(unreadCounts[otherUid])
                ) {
                    unreadCounts[otherUid] = 0;
                }

                if (
                    oldCounts[currentUser.uid] !== 0 ||
                    !hasOwnCount ||
                    !hasOtherCount
                ) {
                    transaction.update(chatRef, {
                    unreadCounts,
                    updatedAt: serverTimestamp()
                });
                    return unreadCounts;
                }

                return null;
            }
        );

        if (result) {
            if (activeChatId === chatId) {
                activeChatData = {
                    ...activeChatData,
                    unreadCounts: result
                };
            }

            const record = chatRecords.find(
                (item) => item.id === chatId
            );

            if (record) {
                record.data = {
                    ...record.data,
                    unreadCounts: result
                };
            }

            renderConversationList();
        }
    } catch (error) {
        console.warn(
            "Could not mark conversation as read:",
            error
        );
    } finally {
        readResetInProgress.delete(chatId);
    }
}


/* =========================================================
   CONVERSATION LIST
========================================================= */

function renderConversationList() {
    conversationList.replaceChildren();

    const sorted = [...chatRecords].sort((a, b) => {
        const aTime = a.data.updatedAt?.toMillis?.() || 0;
        const bTime = b.data.updatedAt?.toMillis?.() || 0;

        return bTime - aTime;
    });

    conversationCount.textContent = String(sorted.length);
    conversationsEmpty.hidden = sorted.length > 0;

    if (!sorted.length) return;

    for (const record of sorted) {
        const chat = record.data;
        const partnerUid = partnerUidFrom(chat);

        if (!partnerUid) continue;

        const name = profileNameForChat(chat, partnerUid);
        const photo = profilePhotoForChat(chat, partnerUid);

        const button = document.createElement("button");
        button.type = "button";

        button.className =
            `conversation-item${record.id === activeChatId ? " active" : ""}`;

        button.append(makeMiniAvatar(photo, name));

        const text = document.createElement("span");
        text.className = "person-text";

        const title = document.createElement("strong");
        title.textContent = name;

        const preview = document.createElement("small");

        const visibleLastMessage = visibleLastMessageByChat.get(record.id);
        let lastMessage = visibleLastMessage?.text ||
            chat.lastMessage ||
            "Start the conversation";

        if (chat.requestStatus === "pending") {
            lastMessage = chat.requestedBy === currentUser?.uid
                ? "Chat request sent"
                : "Wants to start chatting";
        } else if (chat.requestStatus === "declined") {
            lastMessage = "Chat request declined";
        }

        preview.textContent =
            visibleLastMessage?.senderId === currentUser?.uid
                ? `You: ${lastMessage}`
                : chat.lastSenderId === currentUser?.uid && chat.lastMessage
                ? `You: ${lastMessage}`
                : lastMessage;

        text.append(title, preview);

        const meta = document.createElement("span");
        meta.className = "conversation-meta";

        const time = document.createElement("span");
        time.textContent = formatConversationTime(
            visibleLastMessage?.createdAt ||
            chat.updatedAt ||
            chat.lastMessageAt
        );

        meta.append(time);

        const unreadCount = unreadCountFor(chat);

        if (unreadCount > 0) {
            const badge = document.createElement("span");
            badge.className = "unread-badge";
            badge.textContent = unreadCount > 99
                ? "99+"
                : String(unreadCount);

            badge.setAttribute(
                "aria-label",
                `${unreadCount} unread message${
                    unreadCount === 1 ? "" : "s"
                }`
            );

            meta.append(badge);
        }

        button.append(text, meta);

        button.addEventListener("click", () => {
            openExistingConversation(record.id, chat);
        });

        conversationList.append(button);
    }
}

async function refreshVisibleLastMessage(chatId) {
    if (!currentUser || !chatId) return;

    try {
        const messagesQuery = query(
            collection(db, "chats", chatId, "messages"),
            orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(messagesQuery);
        const visibleMessage = snapshot.docs
            .map((item) => ({
                id: item.id,
                ...item.data()
            }))
            .find((message) =>
                !(message.deletedFor || []).includes(currentUser.uid)
            );

        if (visibleMessage) {
            visibleLastMessageByChat.set(chatId, {
                text: visibleMessage.deletedForEveryone
                    ? "This message was deleted."
                    : (visibleMessage.text || ""),
                senderId: visibleMessage.senderId,
                createdAt: visibleMessage.createdAt
            });
        } else {
            visibleLastMessageByChat.delete(chatId);
        }

        if (activeChatId === chatId) {
            activeChatData = {
                ...activeChatData,
                lastMessage: visibleLastMessage?.text || "",
                lastSenderId: visibleLastMessage?.senderId || null,
                lastMessageAt: visibleLastMessage?.createdAt || null
            };
        }

        renderConversationList();
    } catch (error) {
        console.warn("Could not refresh conversation preview:", error);
    }
}

async function refreshAllVisibleLastMessages() {
    await Promise.all(
        chatRecords.map((record) => refreshVisibleLastMessage(record.id))
    );
}

function subscribeToConversations() {
    unsubscribeChats?.();

    const chatsQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", currentUser.uid),
        limit(75)
    );

    unsubscribeChats = onSnapshot(
        chatsQuery,
        (snapshot) => {
            chatRecords = snapshot.docs.map((item) => ({
                id: item.id,
                data: item.data()
            }));

            renderConversationList();
            void refreshAllVisibleLastMessages();

            if (activeChatId) {
                const current = chatRecords.find(
                    (record) => record.id === activeChatId
                );

                if (current) {
                    activeChatData = current.data;

                    const partnerUid = partnerUidFrom(current.data);

                    if (
                        partnerUid &&
                        activeChatPartner?.uid === partnerUid
                    ) {
                        activeChatPartner = {
                            ...activeChatPartner,
                            displayName: profileNameForChat(
                                current.data,
                                partnerUid
                            ),
                            photoURL: profilePhotoForChat(
                                current.data,
                                partnerUid
                            )
                        };

                        renderChatHeader(activeChatPartner);
                    }

                    renderChatControls();

                    setComposerEnabled(
                        isChatAccepted(current.data) &&
                        !isChatBlocked(current.data)
                    );
                }
            }
        },
        (error) => {
            console.error(
                "Conversation list listener failed:",
                error
            );

            conversationsEmpty.hidden = false;
            conversationsEmpty.textContent =
                "Could not load conversations. Check Firestore rules.";
        }
    );
}
/* =========================================================
   OPEN OR CREATE CHAT
========================================================= */

async function openConversationWith(profile) {
    if (
        !currentUser ||
        !profile?.uid ||
        profile.uid === currentUser.uid
    ) {
        return;
    }

    const chatId = makeChatId(currentUser.uid, profile.uid);

    try {
        const snapshot = await getDoc(doc(db, "chats", chatId));

        if (snapshot.exists()) {
            await openExistingConversation(
                chatId,
                snapshot.data(),
                {
                    uid: profile.uid,
                    displayName: profile.displayName || "Friend",
                    photoURL: profile.photoURL || ""
                }
            );
        } else {
            const partner = {
                uid: profile.uid,
                displayName: profile.displayName || "Friend",
                photoURL: profile.photoURL || ""
            };

            activeChatId = chatId;
            activeChatPartner = partner;
            draftPartner = partner;

            activeChatData = {
                participants: sortUids(currentUser.uid, profile.uid),
                participantNames: {
                    [currentUser.uid]:
                        currentProfile?.displayName || "Friend",
                    [profile.uid]: partner.displayName
                },
                participantPhotos: {
                    [currentUser.uid]:
                        currentProfile?.photoURL || "",
                    [profile.uid]: partner.photoURL
                },
                requestStatus: "new",
                requestedBy: null,
                blockedBy: []
            };

            chatPlaceholder.hidden = true;
            activeChat.hidden = false;

            setWorkspaceVisible(true);
            hideMessage(chatError);
            renderChatHeader(partner);

            messagesList.replaceChildren();

            const note = document.createElement("div");
            note.className = "message-empty";
            note.textContent =
                `Press “Let's Start a Chat” to send ${partner.displayName} a request.`;

            messagesList.append(note);

            setComposerEnabled(false);
            renderChatControls();
            renderConversationList();
        }

        if (userSearch) userSearch.value = "";
        if (clearSearchButton) clearSearchButton.hidden = true;

        renderSearchState("");

        if (searchHint) {
            searchHint.textContent = "Type a name to find friends.";
        }

        setConnectionState("Connected", true);
    } catch (error) {
        console.error("Could not open conversation:", error);

        showChatError(
            "Could not open this conversation. Check your Firestore rules and try again."
        );

        setConnectionState("Connection issue", false);
    }
}

function isChatAccepted(data = activeChatData) {
    return (
        data?.requestStatus === "accepted" ||
        !("requestStatus" in (data || {}))
    );
}

function isChatBlocked(data = activeChatData) {
    return (data?.blockedBy || []).length > 0;
}

function setComposerEnabled(enabled) {
    if (messageForm) messageForm.hidden = !enabled;
    if (messageInput) messageInput.disabled = !enabled;
    if (sendMessageButton) sendMessageButton.disabled = !enabled;
}

function addRequestButton(label, className, handler) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);

    requestPanel.append(button);
}

function renderChatControls() {
    if (!requestPanel || !activeChatData || !currentUser) {
        if (requestPanel) requestPanel.hidden = true;
        return;
    }

    requestPanel.replaceChildren();
    requestPanel.hidden = false;

    const data = activeChatData;
    const status = data.requestStatus;
    const requester = data.requestedBy === currentUser.uid;
    const blockedBy = data.blockedBy || [];

    if (blockedBy.length) {
        const p = document.createElement("p");

        p.textContent = blockedBy.includes(currentUser.uid)
            ? "You blocked this person. Messages are disabled."
            : "This person blocked this conversation.";

        requestPanel.append(p);

        if (blockedBy.includes(currentUser.uid)) {
            addRequestButton(
                "Unblock",
                "chat-action-button",
                unblockChat
            );
        }

        setComposerEnabled(false);
        return;
    }

    if (status === "new") {
        const p = document.createElement("p");
        p.textContent =
            "Send a request before you can message this person.";

        requestPanel.append(p);

        addRequestButton(
            "Let's Start a Chat",
            "chat-action-button primary",
            startChatRequest
        );

        setComposerEnabled(false);
    } else if (status === "pending") {
        const p = document.createElement("p");

        p.textContent = requester
            ? "Chat request sent. Waiting for their response."
            : `${activeChatPartner?.displayName || "This person"} wants to start chatting.`;

        requestPanel.append(p);

        if (!requester) {
            addRequestButton(
                "Accept",
                "chat-action-button primary",
                acceptChatRequest
            );

            addRequestButton(
                "Decline",
                "chat-action-button",
                declineChatRequest
            );
        }

        setComposerEnabled(false);
    } else if (status === "declined") {
        const p = document.createElement("p");

        p.textContent = requester
            ? "Your request was declined. You can try again."
            : "You declined this request.";

        requestPanel.append(p);

        if (requester) {
            addRequestButton(
                "Let's Start a Chat",
                "chat-action-button primary",
                retryChatRequest
            );
        }

        setComposerEnabled(false);
    } else if (isChatAccepted(data)) {
        requestPanel.hidden = true;
        setComposerEnabled(true);

        if (
            chatHeader &&
            !chatHeader.querySelector(".chat-block-button")
        ) {
            addHeaderBlockButton();
        }
    }
}

function addHeaderBlockButton() {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "chat-block-button";
    button.textContent = "Block";

    button.addEventListener("click", blockChat);

    chatHeader?.append(button);
}

async function updateChatFields(fields) {
    await updateDoc(
        doc(db, "chats", activeChatId),
        {
            ...fields,
            updatedAt: serverTimestamp()
        }
    );
}

async function startChatRequest() {
    if (!currentUser || !activeChatId || !draftPartner) return;

    const partner = draftPartner;

    try {
        await setDoc(doc(db, "chats", activeChatId), {
            participants: sortUids(currentUser.uid, partner.uid),

            participantNames: {
                [currentUser.uid]:
                    currentProfile?.displayName || "Friend",
                [partner.uid]: partner.displayName
            },

            participantPhotos: {
                [currentUser.uid]:
                    currentProfile?.photoURL ||
                    currentUser.photoURL ||
                    "",
                [partner.uid]: partner.photoURL || ""
            },

            unreadCounts: {
                [currentUser.uid]: 0,
                [partner.uid]: 0
            },

            lastMessage: "",
            lastSenderId: "",

            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessageAt: serverTimestamp(),

            requestStatus: "pending",
            requestedBy: currentUser.uid,
            blockedBy: []
        });

        draftPartner = null;

        activeChatData = {
            ...activeChatData,
            requestStatus: "pending",
            requestedBy: currentUser.uid,
            blockedBy: []
        };

        renderChatControls();
    } catch (error) {
        console.error("Could not send chat request:", error);

        showChatError(
            "Could not send the request. Check your Firestore rules and try again."
        );
    }
}

async function acceptChatRequest() {
    if (
        activeChatData?.requestStatus !== "pending" ||
        activeChatData.requestedBy === currentUser?.uid
    ) {
        return;
    }

    try {
        await updateChatFields({
            requestStatus: "accepted"
        });

        activeChatData = {
            ...activeChatData,
            requestStatus: "accepted"
        };

        renderChatControls();
        subscribeToMessages(activeChatId);
    } catch (error) {
        console.error(error);

        showChatError(
            "Could not accept this request. Check Firestore rules."
        );
    }
}

async function declineChatRequest() {
    if (
        activeChatData?.requestStatus !== "pending" ||
        activeChatData.requestedBy === currentUser?.uid
    ) {
        return;
    }

    try {
        await updateChatFields({
            requestStatus: "declined"
        });

        activeChatData = {
            ...activeChatData,
            requestStatus: "declined"
        };

        renderChatControls();
    } catch (error) {
        console.error(error);

        showChatError(
            "Could not decline this request. Check Firestore rules."
        );
    }
}

async function retryChatRequest() {
    if (
        activeChatData?.requestStatus !== "declined" ||
        activeChatData.requestedBy !== currentUser?.uid
    ) {
        return;
    }

    try {
        await updateChatFields({
            requestStatus: "pending",
            requestedBy: currentUser.uid
        });

        activeChatData = {
            ...activeChatData,
            requestStatus: "pending"
        };

        renderChatControls();
    } catch (error) {
        console.error(error);

        showChatError(
            "Could not resend this request. Check Firestore rules."
        );
    }
}

async function blockChat() {
    if (!activeChatId || !currentUser) return;

    try {
        await updateChatFields({
            blockedBy: arrayUnion(currentUser.uid)
        });

        activeChatData = {
            ...activeChatData,
            blockedBy: [
                ...new Set([
                    ...(activeChatData.blockedBy || []),
                    currentUser.uid
                ])
            ]
        };

        renderChatControls();
    } catch (error) {
        console.error(error);

        showChatError(
            "Could not block this person. Check Firestore rules."
        );
    }
}

async function unblockChat() {
    if (!activeChatId || !currentUser) return;

    try {
        await updateChatFields({
            blockedBy: arrayRemove(currentUser.uid)
        });

        activeChatData = {
            ...activeChatData,
            blockedBy: (activeChatData.blockedBy || [])
                .filter((uid) => uid !== currentUser.uid)
        };

        renderChatControls();
    } catch (error) {
        console.error(error);

        showChatError(
            "Could not unblock this person. Check Firestore rules."
        );
    }
}


/* =========================================================
   OPEN EXISTING CONVERSATION
========================================================= */

async function openExistingConversation(
    chatId,
    chatData,
    suppliedPartner = null
) {
    if (!currentUser || !chatData) return;

    const partnerUid = partnerUidFrom(chatData);

    if (!partnerUid) return;

    let partner = suppliedPartner;

    if (!partner) {
        partner = {
            uid: partnerUid,
            displayName: profileNameForChat(chatData, partnerUid),
            photoURL: profilePhotoForChat(chatData, partnerUid)
        };

        // Refresh the partner's public display data when opening the chat.
        try {
            const partnerSnapshot = await getDoc(
                doc(db, "users", partnerUid)
            );

            if (partnerSnapshot.exists()) {
                const profile = partnerSnapshot.data();

                partner = {
                    uid: partnerUid,
                    displayName:
                        profile.displayName || partner.displayName,
                    photoURL: profile.photoURL || partner.photoURL
                };
            }
        } catch (error) {
            console.warn(
                "Could not refresh partner profile:",
                error
            );
        }
    }

    activeChatId = chatId;
    activeChatData = chatData;
    activeChatPartner = partner;

    chatPlaceholder.hidden = true;
    activeChat.hidden = false;

    setWorkspaceVisible(true);
    hideMessage(chatError);

    chatHeader?.querySelector(".chat-block-button")?.remove();

    draftPartner = null;

    renderChatHeader(partner);
    renderChatControls();
    renderConversationList();

    if (
        isChatAccepted(chatData) &&
        !isChatBlocked(chatData)
    ) {
        setComposerEnabled(true);
        void markChatAsRead(chatId);
        subscribeToMessages(chatId);
        messageInput?.focus();
    } else {
        setComposerEnabled(false);

        unsubscribeMessages?.();
        unsubscribeMessages = null;

        messageCache = [];
        messagesList.replaceChildren();

        const note = document.createElement("div");
        note.className = "message-empty";
        note.textContent =
            "Messages will be available after the request is accepted.";

        messagesList.append(note);
    }
}

function renderChatHeader(partner) {
    if (!partner) return;

    chatHeader?.querySelector(".chat-block-button")?.remove();

    chatUserName.textContent = partner.displayName || "Friend";
    chatSubtitle.textContent = "Private conversation";

    showAvatar(
        chatUserPhoto,
        chatUserFallback,
        partner.photoURL || "",
        partner.displayName
    );
}

function subscribeToMessages(chatId) {
    unsubscribeMessages?.();

    messageCache = [];
    receivedMessageIds = new Set();
    hasReceivedInitialMessageSnapshot = false;
    messagesList.replaceChildren();

    const messagesQuery = query(
        collection(db, "chats", chatId, "messages"),
        orderBy("createdAt", "desc"),
        limit(100)
    );

    unsubscribeMessages = onSnapshot(
        messagesQuery,
        (snapshot) => {
            const newIncomingMessage = snapshot.docChanges().some(change => {
                if (change.type !== "added") return false;

                const message = change.doc.data();
                const isNewIncomingMessage =
                    hasReceivedInitialMessageSnapshot &&
                    message.senderId !== currentUser?.uid &&
                    !receivedMessageIds.has(change.doc.id);

                receivedMessageIds.add(change.doc.id);
                return isNewIncomingMessage;
            });
            hasReceivedInitialMessageSnapshot = true;

            messageCache = snapshot.docs
                .map((item) => ({
                    id: item.id,
                    ...item.data()
                }))
                .reverse();

            void markIncomingMessagesAsRead(messageCache, chatId);
            renderMessages();
            void refreshVisibleLastMessage(chatId);

            if (newIncomingMessage) {
                playSound("receive");
            }

            // If a new message arrives while this chat is open, keep it read.
            if (
                messageCache.some(
                    (message) => message.senderId !== currentUser?.uid
                )
            ) {
                void markChatAsRead(chatId);
            }
        },
        (error) => {
            console.error("Message listener failed:", error);

            messagesList.replaceChildren();

            const note = document.createElement("p");
            note.className = "message-empty";
            note.textContent =
                "Messages couldn't load. Check your Firestore rules.";

            messagesList.append(note);
        }
    );
}
/* =========================================================
   RENDER MESSAGES
========================================================= */

function renderMessages() {
    const wasNearBottom =
        messagesList.scrollHeight -
        messagesList.scrollTop -
        messagesList.clientHeight < 100;

    messagesList.replaceChildren();

    if (!messageCache.length) {
        const empty = document.createElement("div");
        empty.className = "message-empty";

        const heading = document.createElement("strong");
        heading.textContent = "Say hello ✨";

        const text = document.createElement("span");
        text.textContent =
            `Your conversation with ${activeChatPartner?.displayName || "your friend"} starts here.`;

        empty.append(heading, text);
        messagesList.append(empty);

        return;
    }

    let previousDay = "";

    for (const message of messageCache) {
        // Hide a message deleted only for the current user.
        if ((message.deletedFor || []).includes(currentUser?.uid)) {
            continue;
        }

        const date = message.createdAt?.toDate?.() || null;

        if (date) {
            const dayKey = date.toDateString();

            if (dayKey !== previousDay) {
                const dayLabel = document.createElement("div");
                dayLabel.className = "message-day";
                dayLabel.textContent = formatDayLabel(date);

                messagesList.append(dayLabel);
                previousDay = dayKey;
            }
        }

        const mine = message.senderId === currentUser?.uid;

        const row = document.createElement("div");
        row.className = `message-row${mine ? " mine" : ""}`;

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        bubble.tabIndex = 0;
        bubble.setAttribute("role", "button");
        bubble.setAttribute("aria-label", "Show message actions");

        const showActions = () => {
            document
                .querySelectorAll(".message-row.actions-visible")
                .forEach((item) => {
                    item.classList.remove("actions-visible");
                    const actions = item.querySelector(".message-actions");
                    if (actions) actions.style.display = "none";
                });

            row.classList.add("actions-visible");
            const actions = row.querySelector(".message-actions");
            if (actions) actions.style.display = "flex";
        };

        row.addEventListener("click", (event) => {
            if (!event.target.closest(".message-actions")) {
                showActions();
            }
        });

        bubble.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                showActions();
            }
        });

        bubble.textContent = message.deletedForEveryone
            ? "This message was deleted."
            : (message.text || "");

        if (message.editedAt && !message.deletedForEveryone) {
            const edited = document.createElement("span");
            edited.className = "message-edited";
            edited.textContent = "Edited";
            bubble.append(document.createTextNode(" "));
            bubble.append(edited);
        }

        const meta = document.createElement("div");
        meta.className = "message-meta";

        if (!message.deletedForEveryone && message.senderId === currentUser?.uid) {
            const readBy = message.readBy || [];

            const recipientUid = (activeChatData?.participants || [])
                .find(uid => uid !== currentUser.uid);

            const isRead = recipientUid
                ? readBy.includes(recipientUid)
                : false;

            const receipt = document.createElement("span");
            receipt.className = isRead
                ? "message-read-receipt is-read"
                : "message-read-receipt";

            receipt.textContent = "✓";
            receipt.title = isRead ? "Seen" : "Sent";

            meta.appendChild(receipt);
        }

        if (!message.deletedForEveryone) {
            const time = document.createElement("time");
            time.className = "message-time";
            time.textContent = formatTime(message.createdAt);

            meta.append(time);

            const actions = document.createElement("div");
            actions.className = "message-actions";

            if (mine) {
                const edit = document.createElement("button");
                edit.type = "button";
                edit.textContent = "Edit";
                edit.addEventListener("click", () => {
                    editMessage(message);
                });

                actions.append(edit);
            }

            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "Delete";
            remove.addEventListener("click", () => {
                deleteMessage(message);
            });

            actions.append(remove);
            meta.append(actions);
        }

        row.append(bubble);

        if (!message.deletedForEveryone) {
            row.append(meta);
        }

        messagesList.append(row);
    }

    if (wasNearBottom || messageCache.length <= 2) {
        scrollMessagesToBottom();
    }
}


function formatDayLabel(date) {
    const today = new Date();

    if (date.toDateString() === today.toDateString()) {
        return "Today";
    }

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === yesterday.toDateString()) {
        return "Yesterday";
    }

    return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: date.getFullYear() === today.getFullYear()
            ? undefined
            : "numeric"
    }).format(date);
}


/* =========================================================
   SEND MESSAGE
========================================================= */

messageForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || !activeChatId || !activeChatData) {
        return;
    }

    if (
        !isChatAccepted(activeChatData) ||
        isChatBlocked(activeChatData)
    ) {
        showChatError(
            "Accept the chat request before sending messages."
        );
        return;
    }

    const text = messageInput.value.trim();

    if (!text) return;

    hideMessage(chatError);
    setChatBusy(true);

    try {
        const chatRef = doc(db, "chats", activeChatId);

        const messageRef = doc(
            collection(db, "chats", activeChatId, "messages")
        );

        await runTransaction(db, async (transaction) => {
            const chatSnapshot = await transaction.get(chatRef);

            if (!chatSnapshot.exists()) {
                throw new Error("Conversation no longer exists.");
            }

            const chatData = chatSnapshot.data();

            if (!(chatData.participants || []).includes(currentUser.uid)) {
                throw new Error(
                    "You are not a participant in this conversation."
                );
            }

            if (
                chatData.requestStatus &&
                chatData.requestStatus !== "accepted"
            ) {
                throw new Error(
                    "This chat request has not been accepted."
                );
            }

            if ((chatData.blockedBy || []).length) {
                throw new Error("This conversation is blocked.");
            }

            const recipientUid = (chatData.participants || [])
                .find((uid) => uid !== currentUser.uid);

            if (!recipientUid) {
                throw new Error("Could not find the recipient.");
            }

            const currentUnreadCounts = chatData.unreadCounts || {};

            const recipientUnreadCount =
                Number.isFinite(currentUnreadCounts[recipientUid])
                    ? currentUnreadCounts[recipientUid]
                    : 0;

            transaction.set(messageRef, {
                senderId: currentUser.uid,
                text,
                createdAt: serverTimestamp()
            });

            transaction.update(chatRef, {
                lastMessage: text.slice(0, 500),
                lastSenderId: currentUser.uid,

                unreadCounts: {
                    ...currentUnreadCounts,
                    [currentUser.uid]: 0,
                    [recipientUid]: recipientUnreadCount + 1
                },

                lastMessageAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        });

        playSound("send");
        messageInput.value = "";
        autoResizeMessageInput();
        messageInput.focus();
    } catch (error) {
        console.error("Message send failed:", error);

        showChatError(
            "Message wasn't sent. Check your connection and Firestore rules."
        );
    } finally {
        setChatBusy(false);
    }
});

function autoResizeMessageInput() {
    if (!messageInput) return;

    messageInput.style.height = "auto";

    messageInput.style.height =
        `${Math.min(messageInput.scrollHeight, 140)}px`;
}

messageInput?.addEventListener("input", autoResizeMessageInput);


/* =========================================================
   BACK TO CONVERSATION LIST
========================================================= */

backToListButton?.addEventListener("click", () => {
    setWorkspaceVisible(false);

    activeChat.hidden = true;
    chatPlaceholder.hidden = false;

    unsubscribeMessages?.();
    unsubscribeMessages = null;

    activeChatId = null;
    activeChatData = null;
    activeChatPartner = null;
    draftPartner = null;

    requestPanel.hidden = true;

    renderConversationList();
});


/* =========================================================
   AUTH STATE AND INITIALIZATION
========================================================= */

watchAuthState(async (user) => {
    if (!user) {
        window.location.replace("./login.html");
        return;
    }

    if (authStarted) return;

    authStarted = true;
    currentUser = user;

    try {
        const profile = await getUserProfile(user.uid);

        if (!profile) {
            window.location.replace("./setup-profile.html");
            return;
        }

        renderProfile(user, profile);
        subscribeToConversations();
        void loadProfileCount();

        setConnectionState("Connected", true);
    } catch (error) {
        console.error(
            "Failed to initialize Friends4Ever:",
            error
        );

        loadingScreen.hidden = true;

        setMessage(
            homeError,
            "Could not load your account. Check your internet connection and Firestore rules.",
            true
        );

        setConnectionState("Connection issue", false);
    }
});


/* =========================================================
   SIGN OUT
========================================================= */

logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
        unsubscribeChats?.();
        unsubscribeMessages?.();

        await signOutUser();

        window.location.replace("./login.html");
    } catch (error) {
        console.error("Sign out failed:", error);

        setMessage(
            homeError,
            "Could not sign out. Please try again.",
            true
        );

        logoutButton.disabled = false;
    }
});

async function loadProfileCount() {
    if (!profileCountValue) return;

    try {
        const snapshot = await getCountFromServer(
            collection(db, "users")
        );

        profileCountValue.textContent = snapshot.data().count.toLocaleString();
    } catch (error) {
        console.warn("Could not load profile count:", error);
        profileCountValue.textContent = "--";
    }
}