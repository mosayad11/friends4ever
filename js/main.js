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
   CLOUDINARY MEDIA STORAGE
========================================================= */

const CLOUDINARY_CLOUD_NAME = "fjfq5xkq";
const CLOUDINARY_UPLOAD_PRESET = "friends4ever_media";

async function uploadMediaFile(file) {
    if (!(file instanceof File || file instanceof Blob)) {
        throw new Error("Invalid media file.");
    }

    if (!file.size) {
        throw new Error("The selected file is empty.");
    }

    const formData = new FormData();

    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const uploadUrl =
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;

    const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("Cloudinary returned an invalid response.");
    }

    if (!response.ok || !result.secure_url) {
        throw new Error(
            result.error?.message || "Failed to upload media to Cloudinary."
        );
    }

    return {
        publicUrl: result.secure_url,
        publicId: result.public_id,
        resourceType: result.resource_type,
        format: result.format,
        size: result.bytes
    };
}



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
const findPeopleButton = $("find-people-button");
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
const chatPresenceStatus = $("chat-presence-status");
const messagesList = $("messages-list");
const chatError = $("chat-error");
const messageForm = $("message-form");
const messageInput = $("message-input");
const sendMessageButton = $("send-message-button");
const voiceRecordButton = $("voice-message-button") || $("voice-record-button");
const voiceCancelButton = $("cancel-voice-recording") || $("voice-cancel-button");
const voiceRecordingStatus = $("voice-recording-status");
const imageMessageButton = $("image-message-button");
const imageMessageInput = $("image-message-input");
const voicePreviewPanel = $("voice-preview-panel");
const voicePreviewPlayer = $("voice-preview-player");
const cancelVoicePreviewButton = $("cancel-voice-preview");
const sendVoicePreviewButton = $("send-voice-message");
const backToListButton = $("back-to-list");
const emojiToggle = $("emoji-toggle");
const emojiPicker = $("emoji-picker");
const replyPreview = $("reply-preview");
const replyPreviewLabel = $("reply-preview-label");
const replyPreviewText = $("reply-preview-text");
const cancelReplyButton = $("cancel-reply");

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
let unsubscribePartnerPresence = null;
let searchTimer = null;

let chatRecords = [];
let activeChatId = null;
let activeChatData = null;
let activeChatPartner = null;
let messageCache = [];
let searchGeneration = 0;
let replyingTo = null;
let typingTimer = null;
let typingState = false;
let presenceHeartbeat = null;
const visibleLastMessageByChat = new Map();
const voiceObjectUrls = new Map();
let voiceRecorder = null;
let voiceChunks = [];
let voiceStartedAt = 0;
let voiceDurationTimer = null;
let voiceCancelRequested = false;
let voiceRecordingTarget = null;
let pendingVoiceMessage = null;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

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


function appendMessageTextWithLinks(container, text) {
    const content = String(text ?? "");

    const urlPattern =
        /(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/gi;

    let lastIndex = 0;
    let match;

    while ((match = urlPattern.exec(content)) !== null) {
        let urlText = match[0];
        let trailing = "";

        // Keep punctuation outside the clickable link.
        while (/[.,!?;:)\]}]$/.test(urlText)) {
            trailing = urlText.slice(-1) + trailing;
            urlText = urlText.slice(0, -1);
        }

        if (!urlText) continue;

        container.append(
            document.createTextNode(
                content.slice(lastIndex, match.index)
            )
        );

        const link = document.createElement("a");
        link.className = "chat-message-link";
        link.textContent = urlText;

        const href = /^https?:\/\//i.test(urlText)
            ? urlText
            : `https://${urlText}`;

        try {
            const parsedUrl = new URL(href);

            if (["http:", "https:"].includes(parsedUrl.protocol)) {
                link.href = parsedUrl.href;
                link.target = "_blank";
                link.rel = "noopener noreferrer nofollow";
                link.referrerPolicy = "no-referrer";

                container.append(link);
            } else {
                container.append(
                    document.createTextNode(urlText)
                );
            }
        } catch {
            container.append(
                document.createTextNode(urlText)
            );
        }

        container.append(
            document.createTextNode(trailing)
        );

        lastIndex = match.index + match[0].length;
    }

    container.append(
        document.createTextNode(content.slice(lastIndex))
    );
}

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

    if (message?.type === "image" || message?.type === "audio") return false;

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
                        const mediaPath = message.mediaPath || message.audioPath;
                        if (mediaPath) {
                            try {
                                const cachedUrl = voiceObjectUrls.get(mediaPath);
                                if (cachedUrl) URL.revokeObjectURL(cachedUrl);
                                voiceObjectUrls.delete(mediaPath);
                            } catch (storageError) {
                                // The message remains, and the renderer will show an unavailable state.
                                console.warn("Could not remove deleted media immediately; scheduled cleanup will handle it:", storageError);
                            }
                        }
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

function isSelfChat(chatData = activeChatData) {
    return Boolean(
        currentUser &&
        Array.isArray(chatData?.participants) &&
        chatData.participants.length === 1 &&
        chatData.participants[0] === currentUser.uid
    );
}

function partnerUidFrom(chatData) {
    if (!currentUser || !Array.isArray(chatData?.participants)) {
        return null;
    }

    const participants = chatData.participants;

    // Self-chat: the only participant is the current user.
    if (
        participants.length === 1 &&
        participants[0] === currentUser.uid
    ) {
        return currentUser.uid;
    }

    // Normal one-to-one conversation.
    return participants.find(uid => uid !== currentUser.uid) || null;
}

function profileNameForChat(chatData, uid) {
    if (currentUser && uid === currentUser.uid && (chatData?.participants || []).length === 1) {
        return "Myself";
    }
    return chatData.participantNames?.[uid] || "Friend";
}

function profilePhotoForChat(chatData, uid) {
    if (currentUser && uid === currentUser.uid && (chatData?.participants || []).length === 1) {
        return currentProfile?.photoURL || currentUser.photoURL || "";
    }
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
        return ["dark",
            "light",
            "ocean",
            "sunset",
            "midnight-purple",
            "river-breeze",
            "sunrise-energy"
        ].includes(stored)
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
    const supportedThemes = [
        "dark",
        "light",
        "ocean",
        "sunset",
        "midnight-purple",
        "river-breeze",
        "sunrise-energy"
    ];
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
        const themeColors = {
            dark: "#101827",
            light: "#f2f5fc",
            ocean: "#062a3a",
            sunset: "#2b1723",
            "midnight-purple": "#21132f",
            "river-breeze": "#EFFAF5",
            "sunrise-energy": "#FFFAF1"
        };

        themeColor.content = themeColors[selected] || "#101827";
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
                row.querySelectorAll(".message-actions, .reaction-actions")
                    .forEach((actions) => {
                        actions.style.display = "none";
                    });
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
        renderSearchState("Check the name: this username is not available.");
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
            where("displayNameLower", "==", term),
            limit(1)
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
                : "That username is not available.";
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
    if (clearSearchButton) clearSearchButton.hidden = !userSearch.value;

    if (searchHint) {
        searchHint.textContent =
            "Press Find to search the exact username.";
    }
});

findPeopleButton?.addEventListener("click", () => {
    void searchUsers(userSearch.value);
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
                    : (visibleMessage.type === "audio"
                        ? "🎤 Voice message"
                        : visibleMessage.type === "image"
                            ? "📷 Image"
                            : (visibleMessage.text || "")),
                senderId: visibleMessage.senderId,
                createdAt: visibleMessage.createdAt
            });
        } else {
            visibleLastMessageByChat.delete(chatId);
        }

        if (activeChatId === chatId) {
            activeChatData = {
                ...activeChatData,
                lastMessage: visibleMessage?.deletedForEveryone
                    ? "This message was deleted."
                    : (visibleMessage?.type === "audio"
                        ? "🎤 Voice message"
                        : visibleMessage?.type === "image"
                            ? "📷 Image"
                            : (visibleMessage?.text || "")),
                lastSenderId: visibleMessage?.senderId || null,
                lastMessageAt: visibleMessage?.createdAt || null
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
                    renderChatPresence();

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

async function openSelfChat() {
    if (!currentUser) return;

    const uid = currentUser.uid;
    const chatId = `self__${uid}`;
    const chatRef = doc(db, "chats", chatId);

    try {
        let snapshot = await getDoc(chatRef);

        if (!snapshot.exists()) {
            const name =
                currentProfile?.displayName ||
                currentUser.displayName ||
                "( Myself )";

            const photo =
                currentProfile?.photoURL ||
                currentUser.photoURL ||
                "";

            const selfChatData = {
                participants: [uid],
                participantNames: {
                    [uid]: name
                },
                participantPhotos: {
                    [uid]: photo
                },
                unreadCounts: {
                    [uid]: 0
                },
                lastMessage: "",
                lastSenderId: "",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastMessageAt: serverTimestamp(),
                requestStatus: "accepted",
                requestedBy: uid,
                blockedBy: []
            };

            await setDoc(chatRef, selfChatData);
            snapshot = await getDoc(chatRef);
        }

        if (!snapshot.exists()) {
            throw new Error("Self chat could not be created.");
        }

        const chatData = snapshot.data();

        if (!(chatData.participants || []).includes(uid)) {
            throw new Error(
                "You are not a participant in this self chat."
            );
        }

        // Keep the self-chat unread count at zero.
        if (
            !chatData.unreadCounts ||
            chatData.unreadCounts[uid] !== 0
        ) {
            await updateDoc(chatRef, {
                [`unreadCounts.${uid}`]: 0
            });
        }

        await openExistingConversation(
            chatId,
            {
                ...chatData,
                unreadCounts: {
                    ...(chatData.unreadCounts || {}),
                    [uid]: 0
                },
                requestStatus: "accepted",
                blockedBy: []
            },
            {
                uid,
                displayName: "Myself",
                photoURL:
                    currentProfile?.photoURL ||
                    currentUser.photoURL ||
                    ""
            }
        );

        if (userSearch) userSearch.value = "";
        if (clearSearchButton) {
            clearSearchButton.hidden = true;
        }

        renderSearchState("");

        if (searchHint) {
            searchHint.textContent =
                "Type a name to find friends.";
        }

        hideMessage(chatError);
        setConnectionState("Connected", true);

    } catch (error) {
        console.error("Could not open Notes to Self:", error);

        showChatError(
            "Could not open Myself chat. Check Firestore rules and permissions."
        );
    }
}

$("open-self-chat")?.addEventListener("click", () => {
    void openSelfChat();
});

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
    if (voiceRecordButton) voiceRecordButton.disabled = !enabled;
    if (imageMessageButton) imageMessageButton.disabled = !enabled;
    if (emojiToggle) emojiToggle.disabled = !enabled;
    updateComposerMode?.();
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

    if (isSelfChat(data)) {
        requestPanel.hidden = true;
        setComposerEnabled(true);
        chatHeader?.querySelector(".chat-block-button")?.remove();
        return;
    }

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

async function updateOwnPresence(status) {
    if (!currentUser) return;

    try {
        await updateDoc(doc(db, "users", currentUser.uid), {
            presenceStatus: status,
            lastActiveAt: serverTimestamp(),
            ...(status === "offline"
                ? { lastSeenAt: serverTimestamp() }
                : {})
        });
    } catch (error) {
        console.warn("Could not update presence:", error);
    }
}

function formatLastSeen(timestamp) {
    const date = timestamp?.toDate?.();

    if (!date) return "last seen recently";

    return `last seen at ${new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric"
    }).format(date)}`;
}

function renderChatPresence(profile = null) {
    if (!chatPresenceStatus || !activeChatPartner) return;

    const partnerUid = activeChatPartner.uid;
    const typingBy = activeChatData?.typingBy || {};

    if (typingBy[partnerUid]) {
        chatPresenceStatus.textContent = "typing…";
        chatPresenceStatus.className = "chat-presence-status is-typing";
        return;
    }

    const presence = profile || activeChatPartner.presence || {};
    const isOnline = presence.presenceStatus === "online" && (
        !presence.lastActiveAt?.toDate ||
        Date.now() - presence.lastActiveAt.toDate().getTime() < 90000
    );

    chatPresenceStatus.textContent = isOnline
        ? "online"
        : formatLastSeen(presence.lastSeenAt || presence.lastActiveAt);
    chatPresenceStatus.className = isOnline
        ? "chat-presence-status is-online"
        : "chat-presence-status";
}

function subscribeToPartnerPresence(partnerUid) {
    unsubscribePartnerPresence?.();
    unsubscribePartnerPresence = null;

    if (!partnerUid) return;

    unsubscribePartnerPresence = onSnapshot(
        doc(db, "users", partnerUid),
        (snapshot) => {
            const profile = snapshot.exists() ? snapshot.data() : {};

            activeChatPartner = {
                ...activeChatPartner,
                presence: profile
            };

            renderChatPresence(profile);
        },
        (error) => {
            console.warn("Could not watch partner presence:", error);
            renderChatPresence();
        }
    );
}

function setTypingState(isTyping) {
    if (!currentUser || !activeChatId || typingState === isTyping) {
        return;
    }

    typingState = isTyping;

    void updateDoc(doc(db, "chats", activeChatId), {
        [`typingBy.${currentUser.uid}`]: isTyping
    }).catch((error) => {
        console.warn("Could not update typing state:", error);
    });
}

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

        // A self-chat is always labelled Notes to Self, not the account name.
        if (partnerUid !== currentUser.uid) {
            try {
                const partnerSnapshot = await getDoc(doc(db, "users", partnerUid));
                if (partnerSnapshot.exists()) {
                    const profile = partnerSnapshot.data();
                    partner = {
                        uid: partnerUid,
                        displayName: profile.displayName || partner.displayName,
                        photoURL: profile.photoURL || partner.photoURL
                    };
                }
            } catch (error) {
                console.warn("Could not refresh partner profile:", error);
            }
        }
    }

    const isSelfChat =
        chatId === `self__${currentUser.uid}` &&
        Array.isArray(chatData.participants) &&
        chatData.participants.length === 1 &&
        chatData.participants[0] === currentUser.uid;

    if (isSelfChat) {
        partner = {
            ...partner,
            uid: currentUser.uid,
            displayName: "Myself",
            photoURL: currentProfile?.photoURL || currentUser.photoURL || ""
        };
    }

    activeChatId = chatId;
    activeChatData = chatData;
    activeChatPartner = partner;
    typingState = false;

    chatPlaceholder.hidden = true;
    activeChat.hidden = false;

    setWorkspaceVisible(true);
    hideMessage(chatError);

    chatHeader?.querySelector(".chat-block-button")?.remove();

    draftPartner = null;

    renderChatHeader(partner);
    if (partner.uid !== currentUser.uid) {
        subscribeToPartnerPresence(partner.uid);
    } else {
        unsubscribePartnerPresence?.();
        unsubscribePartnerPresence = null;
        if (chatPresenceStatus) chatPresenceStatus.textContent = "Your private notes";
    }
    renderChatControls();
    renderConversationList();

    if (
        isChatAccepted(chatData) &&
        !isChatBlocked(chatData)
    ) {
        setComposerEnabled(true);
        void markChatAsRead(chatId);
        subscribeToMessages(chatId);
        
        if (window.matchMedia("(min-width: 761px)").matches) {
            messageInput?.focus();
        }
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
    if (partner.uid === currentUser?.uid) {
        if (chatPresenceStatus) chatPresenceStatus.textContent = "Your private notes";
    } else {
        renderChatPresence(partner.presence || null);
    }

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

function formatVoiceDuration(seconds) {
    const totalSeconds = Math.max(
        0,
        Math.floor(Number(seconds) || 0)
    );

    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
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
        row.dataset.messageId = message.id;

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
                    item.querySelectorAll(".message-actions, .reaction-actions")
                        .forEach((actions) => {
                            actions.style.display = "none";
                        });
                });

            row.classList.add("actions-visible");
            row.querySelectorAll(".message-actions, .reaction-actions")
                .forEach((actions) => {
                    actions.style.display = "flex";
                });
        };

        let pointerStartX = 0;
        let pointerStartY = 0;
        let longPressTimer = null;
        let suppressNextClick = false;

        const cancelLongPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        bubble.addEventListener("pointerdown", (event) => {
            pointerStartX = event.clientX;
            pointerStartY = event.clientY;
            suppressNextClick = false;

            longPressTimer = setTimeout(() => {
                showActions();
                toggleReactionPicker(message, row);
                suppressNextClick = true;
            }, 550);
        });

        bubble.addEventListener("pointermove", (event) => {
            const deltaX = event.clientX - pointerStartX;
            const deltaY = event.clientY - pointerStartY;

            if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12) {
                cancelLongPress();
            }
        });

        bubble.addEventListener("pointerup", (event) => {
            cancelLongPress();

            const deltaX = event.clientX - pointerStartX;
            const deltaY = event.clientY - pointerStartY;

            if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY)) {
                beginReply(message);
                suppressNextClick = true;
            }
        });

        bubble.addEventListener("pointercancel", cancelLongPress);

        row.addEventListener("click", (event) => {
            if (suppressNextClick) {
                suppressNextClick = false;
                return;
            }

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

        const replyTarget = message.replyTo?.id
            ? messageCache.find((item) => item.id === message.replyTo.id)
            : null;

        const replyTargetHidden = replyTarget && (
            replyTarget.deletedForEveryone ||
            (replyTarget.deletedFor || []).includes(currentUser?.uid)
        );

        if (message.replyTo && !replyTargetHidden) {
            const quotedReply = document.createElement("span");
            quotedReply.className = "message-reply-quote";
            quotedReply.textContent = message.replyTo.text || "Message";
            quotedReply.title = "Jump to original message";
            quotedReply.addEventListener("click", (event) => {
                event.stopPropagation();
                focusMessage(message.replyTo.id);
            });
            bubble.append(quotedReply);
        }

        if (message.type === "image" && !message.deletedForEveryone) {
            const imageWrap = document.createElement("div");
            imageWrap.className = "image-message-wrap";
            if (message.mediaUrl) {
                const image = document.createElement("img");
                image.className = "image-message";
                image.alt = "Shared image";
                image.loading = "lazy";
                image.src = message.mediaUrl;
                image.addEventListener("error", () => {
                    const unavailable = document.createElement("span");
                    unavailable.className = "media-unavailable";
                    unavailable.textContent = "Image unavailable";
                    image.replaceWith(unavailable);
                }, { once: true });
                image.addEventListener("click", () => window.open(message.mediaUrl, "_blank", "noopener,noreferrer"));
                imageWrap.append(image);
            } else {
                const unavailable = document.createElement("span");
                unavailable.className = "media-unavailable";
                unavailable.textContent = "Image unavailable";
                imageWrap.append(unavailable);
            }
            bubble.append(imageWrap);
        
        } else if (message.type === "audio" && !message.deletedForEveryone) {
            const player = document.createElement("div");
            player.className = "voice-message-player";

            const playButton = document.createElement("button");
            playButton.type = "button";
            playButton.className = "voice-play-button";
            playButton.textContent = "▶";
            playButton.setAttribute("aria-label", "Play voice message");

            const details = document.createElement("span");
            details.className = "voice-message-details";
            details.textContent =
                `Voice message · ${formatVoiceDuration(message.durationSeconds || 0)}`;

            playButton.addEventListener("click", async () => {
                let audio = player.querySelector("audio");

                if (audio) {
                    if (audio.paused) {
                        try {
                            await audio.play();
                        } catch (error) {
                            console.error("Voice playback failed:", error);
                            details.textContent = "Unable to play voice message";
                        }
                    } else {
                        audio.pause();
                    }

                    return;
                }

                const audioUrl = message.audioUrl || message.mediaUrl;

                if (!audioUrl) {
                    details.textContent = "Voice message unavailable";
                    return;
                }

                playButton.disabled = true;
                details.textContent = "Loading audio…";

                try {
                    audio = document.createElement("audio");
                    audio.controls = true;
                    audio.preload = "none";
                    audio.src = audioUrl;
                    audio.setAttribute(
                        "aria-label",
                        "Voice message audio player"
                    );

                    audio.addEventListener("error", () => {
                        details.textContent = "Voice message unavailable";
                        playButton.disabled = false;
                    });

                    audio.addEventListener("loadedmetadata", () => {
                        details.textContent =
                            `Voice message · ${formatVoiceDuration(
                                message.durationSeconds || audio.duration || 0
                            )}`;
                    });

                    player.replaceChildren(audio, details);
                    await audio.play();

                } catch (error) {
                    console.error("Voice playback failed:", error);
                    details.textContent = "Unable to play voice message";
                    playButton.disabled = false;
                }
            });

            player.append(playButton, details);
            bubble.append(player);

        } else {
            const messageText = document.createElement("span");
            messageText.className = "message-text-content";

            const text = message.deletedForEveryone
                ? "This message was deleted."
                : (message.text || "");

            messageText.dir = directionForText(text);

            if (!message.deletedForEveryone) {
                appendMessageTextWithLinks(messageText, text);
            } else {
                messageText.textContent = text;
            }

            bubble.append(messageText);
        }


        if (message.editedAt && !message.deletedForEveryone) {
            const edited = document.createElement("span");
            edited.className = "message-edited";
            edited.textContent = "Edited";
            bubble.append(document.createTextNode(" "));
            bubble.append(edited);
        }

        const meta = document.createElement("div");
        meta.className = "message-meta";
        let actions = null;
        let reactionActions = null;

        if (!message.deletedForEveryone && message.senderId === currentUser?.uid) {
            const readBy = message.readBy || [];

            const participantList = activeChatData?.participants || [];
            const selfChat = participantList.length === 1 && participantList[0] === currentUser.uid;
            const recipientUid = participantList.find(uid => uid !== currentUser.uid);
            const isRead = selfChat
                ? true
                : Boolean(recipientUid && readBy.includes(recipientUid));

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

            actions = document.createElement("div");
            actions.className = "message-actions";

            reactionActions = document.createElement("div");
            reactionActions.className = "reaction-actions";

            if (mine && (!message.type || message.type === "text")) {
                const edit = document.createElement("button");
                edit.type = "button";
                edit.textContent = "Edit";
                edit.addEventListener("click", () => {
                    editMessage(message);
                });

                actions.append(edit);
            }

            for (const emoji of quickReactionChoices) {
                const quickReact = document.createElement("button");
                quickReact.type = "button";
                quickReact.textContent = emoji;
                quickReact.title = `React with ${emoji}`;
                quickReact.setAttribute("aria-label", `React with ${emoji}`);
                quickReact.addEventListener("click", () => {
                    void toggleReaction(message, emoji);
                });
                reactionActions.append(quickReact);
            }

            const react = document.createElement("button");
            react.type = "button";
            react.textContent = "+";
            react.title = "Add reaction";
            react.setAttribute("aria-label", "Add reaction");
            react.addEventListener("click", () => {
                toggleReactionPicker(message, row);
            });

            reactionActions.append(react);

            const reply = document.createElement("button");
            reply.type = "button";
            reply.textContent = "Reply";
            reply.addEventListener("click", () => {
                beginReply(message);
            });

            actions.append(reply);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "Delete";
            remove.addEventListener("click", () => {
                deleteMessage(message);
            });

            actions.append(remove);
        }

        row.append(bubble);

        if (reactionActions) row.append(reactionActions);

        const reactions = renderReactions(message);
        if (reactions) row.append(reactions);

        if (!message.deletedForEveryone) {
            row.append(meta);
            if (actions) row.append(actions);
        }

        messagesList.append(row);
    }

    if (wasNearBottom || messageCache.length <= 2) {
        scrollMessagesToBottom();
    }
}


function directionForText(value) {
    const firstStrongCharacter = String(value || "")
        .match(/[A-Za-z\u0600-\u06ff]/);

    return firstStrongCharacter && /[\u0600-\u06ff]/.test(
        firstStrongCharacter[0]
    )
        ? "rtl"
        : "ltr";
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

const composerEmojis = [
    "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
    "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😎", "🤓",
    "🧐", "🤗", "🤭", "🤔", "🫡", "😐", "😑", "😶", "🙄", "😏",
    "😣", "😥", "😮", "🤐", "😯", "😪", "😫", "🥱", "😴", "😌",
    "🤤", "😛", "😜", "🤪", "😝", "🤨", "🤑", "😒", "😔", "😭",
    "😢", "😤", "😠", "😡", "🤬", "😱", "😨", "😰", "😳", "🤯",
    "🥳", "🤠", "💀", "👻", "👽", "🤖", "💩", "😺", "👍", "👎",
    "👏", "🙌", "🙏", "🤝", "💪", "👋", "✌️", "🤞", "❤️", "🧡",
    "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💕", "🔥", "✨",
    "⭐", "💯", "🎉", "🎊", "✅", "❌", "⚡", "💡", "💬", "📌",
    "🎁", "☕", "🍕", "🍔", "🍟", "🍎", "🎵", "🚀", "⚽", "🏀",
    "🎮", "🌟", "🌈", "☀️", "🌙", "🌸", "🐶", "🐱"
];

function toggleEmojiPicker() {
    if (!emojiPicker) return;

    emojiPicker.replaceChildren();
    emojiPicker.hidden = !emojiPicker.hidden;

    if (emojiPicker.hidden) return;

    for (const emoji of composerEmojis) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = emoji;
        button.addEventListener("click", () => {
            const start = messageInput.selectionStart ?? messageInput.value.length;
            const end = messageInput.selectionEnd ?? start;

            messageInput.value =
                messageInput.value.slice(0, start) +
                emoji +
                messageInput.value.slice(end);

            messageInput.focus();
            messageInput.setSelectionRange(
                start + emoji.length,
                start + emoji.length
            );
            autoResizeMessageInput();
        });
        emojiPicker.append(button);
    }
}

emojiToggle?.addEventListener("click", toggleEmojiPicker);
cancelReplyButton?.addEventListener("click", clearReply);

document.addEventListener("click", (event) => {
    if (
        emojiPicker &&
        !emojiPicker.hidden &&
        !event.target.closest("#emoji-picker, #emoji-toggle")
    ) {
        emojiPicker.hidden = true;
    }
});

function updateComposerMode() {
    const hasText = Boolean(messageInput?.value.trim());
    if (sendMessageButton) sendMessageButton.hidden = !hasText;
    if (voiceRecordButton) voiceRecordButton.hidden = hasText;
}

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

            const selfChat = (chatData.participants || []).length === 1;
            const recipientUid = (chatData.participants || [])
                .find((uid) => uid !== currentUser.uid) ||
                (selfChat ? currentUser.uid : null);

            if (!recipientUid) {
                throw new Error("Could not find the recipient.");
            }

            const currentUnreadCounts = chatData.unreadCounts || {};
            const recipientUnreadCount = selfChat
                ? 0
                : (Number.isFinite(currentUnreadCounts[recipientUid])
                    ? currentUnreadCounts[recipientUid]
                    : 0);

            transaction.set(messageRef, {
                senderId: currentUser.uid,
                text,
                type: "text",
                ...(selfChat ? { readBy: [currentUser.uid] } : {}),
                createdAt: serverTimestamp(),
                ...(replyingTo ? { replyTo: replyingTo } : {})
            });

            transaction.update(chatRef, {
                lastMessage: text.slice(0, 500),
                lastSenderId: currentUser.uid,

                unreadCounts: {
                    ...currentUnreadCounts,
                    [currentUser.uid]: 0,
                    [recipientUid]: selfChat ? 0 : recipientUnreadCount + 1
                },

                lastMessageAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        });

        playSound("send");
        setTypingState(false);
        clearReply();
        if (emojiPicker) emojiPicker.hidden = true;
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



async function sendImageMessage(file) {
    if (!file) {
        throw new Error("No image selected.");
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error("Unsupported image format.");
    }

    if (file.size > MAX_IMAGE_BYTES) {
        throw new Error("Image size must not exceed 10 MB.");
    }

    // Use the existing current-chat variables.
    const user = currentUser;
    const chatId = activeChatId;

    if (!user || !chatId) {
        throw new Error("No conversation selected.");
    }

    let uploaded = null;

    try {
        // Upload the image to Cloudinary.
        uploaded = await uploadMediaFile(file);

        const chatRef = doc(db, "chats", chatId);
        const messageRef = doc(
            collection(db, "chats", chatId, "messages")
        );

        await runTransaction(db, async (transaction) => {
            const chatSnapshot = await transaction.get(chatRef);

            if (!chatSnapshot.exists()) {
                throw new Error("Conversation no longer exists.");
            }

            const chatData = chatSnapshot.data();
            const participants = chatData.participants || [];

            if (!participants.includes(user.uid)) {
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

            const selfChat = participants.length === 1;

            const recipientUid =
                participants.find(uid => uid !== user.uid) ||
                (selfChat ? user.uid : null);

            if (!recipientUid) {
                throw new Error("Could not find the recipient.");
            }

            const counts = chatData.unreadCounts || {};

            const recipientCount = selfChat
                ? 0
                : (
                    Number.isFinite(counts[recipientUid])
                        ? counts[recipientUid]
                        : 0
                );

            transaction.set(messageRef, {
                senderId: user.uid,
                text: "",
                type: "image",

                mediaUrl: uploaded.publicUrl,
                mediaPublicId: uploaded.publicId,
                mediaMimeType: file.type,
                mediaSize: file.size,

                ...(replyingTo ? { replyTo: replyingTo } : {}),
                ...(selfChat ? { readBy: [user.uid] } : {}),

                createdAt: serverTimestamp()
            });

            transaction.update(chatRef, {
                lastMessage: "📷 Image",
                lastSenderId: user.uid,

                unreadCounts: {
                    ...counts,
                    [user.uid]: 0,
                    [recipientUid]: selfChat
                        ? 0
                        : recipientCount + 1
                },

                lastMessageAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        });

        playSound("send");
        clearReply();

        if (activeChatId === chatId) {
            hideMessage(chatError);
        }

        return messageRef.id;

    } catch (error) {
        console.error("Failed to send image message:", error);
        throw error;
    }
}

function setVoiceRecordingUi(recording, message = "") {
    const recordingPanel = $("voice-recording-panel");
    if (recordingPanel) recordingPanel.hidden = !recording;
    if (voiceRecordButton) {
        voiceRecordButton.classList.toggle("is-recording", recording);
        voiceRecordButton.textContent = recording ? "■" : "Voice Msg🎙️";
        voiceRecordButton.title = recording ? "Stop recording" : "Record voice message";
        voiceRecordButton.setAttribute("aria-label", voiceRecordButton.title);
    }
    if (voiceCancelButton) voiceCancelButton.hidden = !recording;
    if (voiceRecordingStatus) {
        voiceRecordingStatus.hidden = !message;
        voiceRecordingStatus.textContent = message;
    }
}

async function startVoiceRecording() {
    if (!currentUser || !activeChatId || !activeChatData) return;
    if (!isChatAccepted(activeChatData) || isChatBlocked(activeChatData)) {
        showChatError("Accept the chat request before recording a voice message.");
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        showChatError("Voice recording is not supported by this browser. Try the latest Chrome or Edge over HTTPS/localhost.");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/mp4",
            "audio/ogg;codecs=opus"
        ].find(type => MediaRecorder.isTypeSupported(type));

        voiceCancelRequested = false;
        voiceChunks = [];
        voiceStartedAt = Date.now();
        voiceRecordingTarget = {
            chatId: activeChatId,
            chatData: activeChatData,
            user: currentUser
        };
        voiceRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

        voiceRecorder.addEventListener("dataavailable", event => {
            if (event.data?.size) voiceChunks.push(event.data);
        });

        voiceRecorder.addEventListener("stop", async () => {
            const target = voiceRecordingTarget;
            const canceled = voiceCancelRequested;
            const durationSeconds = Math.max(1, Math.round((Date.now() - voiceStartedAt) / 1000));
            const actualMimeType = voiceRecorder?.mimeType || mimeType || "audio/webm";
            stream.getTracks().forEach(track => track.stop());
            clearInterval(voiceDurationTimer);
            voiceDurationTimer = null;
            setVoiceRecordingUi(false);
            voiceRecorder = null;
            voiceRecordingTarget = null;

            if (canceled) {
                voiceChunks = [];
                return;
            }

            const blob = new Blob(voiceChunks, { type: actualMimeType });
            voiceChunks = [];
            if (durationSeconds < 1 || blob.size < 1000) {
                showChatError("The recording is too short. Record a little longer and try again.");
                return;
            }
            if (durationSeconds > 120 || blob.size > 10 * 1024 * 1024) {
                showChatError("Voice messages must be no longer than 2 minutes and smaller than 10 MB.");
                return;
            }

            pendingVoiceMessage = { blob, durationSeconds, mimeType: actualMimeType, target };
            if (voicePreviewPanel && voicePreviewPlayer) {
                const previewUrl = URL.createObjectURL(blob);
                voicePreviewPlayer.src = previewUrl;
                voicePreviewPlayer.dataset.objectUrl = previewUrl;
                voicePreviewPanel.hidden = false;
                if (sendVoicePreviewButton) sendVoicePreviewButton.disabled = false;
            } else {
                try {
                    await sendVoiceMessage(blob, durationSeconds, actualMimeType, target);
                } catch (error) {
                    console.error("Voice message send failed:", error);
                    showChatError(error?.message || "Voice message wasn't sent. Check Supabase Storage and Firestore rules.");
                }
            }
        }, { once: true });

        voiceRecorder.start(250);
        setVoiceRecordingUi(true, "Recording 0:00 · press ■ to send");
        voiceDurationTimer = setInterval(() => {
            const seconds = Math.floor((Date.now() - voiceStartedAt) / 1000);
            if (voiceRecordingStatus) {
                voiceRecordingStatus.textContent = `Recording ${formatVoiceDuration(seconds)} · press ■ to send`;
            }
            if (seconds >= 120 && voiceRecorder?.state === "recording") voiceRecorder.stop();
        }, 500);
        hideMessage(chatError);
    } catch (error) {
        console.error("Could not start voice recording:", error);
        showChatError(error?.name === "NotAllowedError"
            ? "Microphone permission was denied. Allow microphone access in your browser settings."
            : "Could not start recording. Check your microphone and browser permissions.");
    }
}

async function sendVoiceMessage(blob, durationSeconds, mimeType, target) {
    const user = target?.user;
    const chatId = target?.chatId;
    const chatData = target?.chatData;

    if (!user || !chatId || !chatData) {
        throw new Error("Chat is no longer available.");
    }

    const extension = mimeType.includes("mp4")
        ? "m4a"
        : mimeType.includes("ogg")
            ? "ogg"
            : "webm";

    const file = new File(
        [blob],
        `voice-${Date.now()}.${extension}`,
        { type: mimeType }
    );

    const uploaded = await uploadMediaFile(file);

    try {
        const chatRef = doc(db, "chats", chatId);
        const messageRef = doc(
            collection(db, "chats", chatId, "messages")
        );

        await runTransaction(db, async transaction => {
            const chatSnapshot = await transaction.get(chatRef);

            if (!chatSnapshot.exists()) {
                throw new Error("Conversation no longer exists.");
            }

            const currentChat = chatSnapshot.data();

            if (!(currentChat.participants || []).includes(user.uid)) {
                throw new Error(
                    "You are not a participant in this conversation."
                );
            }

            if (
                currentChat.requestStatus &&
                currentChat.requestStatus !== "accepted"
            ) {
                throw new Error(
                    "This chat request has not been accepted."
                );
            }

            if ((currentChat.blockedBy || []).length) {
                throw new Error("This conversation is blocked.");
            }

            const selfChat =
                (currentChat.participants || []).length === 1;

            const recipientUid =
                (currentChat.participants || []).find(
                    uid => uid !== user.uid
                ) || (selfChat ? user.uid : null);

            if (!recipientUid) {
                throw new Error("Could not find the recipient.");
            }

            const counts = currentChat.unreadCounts || {};

            const recipientCount = selfChat
                ? 0
                : (
                    Number.isFinite(counts[recipientUid])
                        ? counts[recipientUid]
                        : 0
                );

            transaction.set(messageRef, {
                senderId: user.uid,
                text: "",
                type: "audio",

                // Cloudinary media fields
                audioUrl: uploaded.publicUrl,
                mediaUrl: uploaded.publicUrl,
                mediaPublicId: uploaded.publicId,

                audioMimeType: mimeType.split(";")[0],
                durationSeconds,

                ...(replyingTo ? { replyTo: replyingTo } : {}),
                ...(selfChat ? { readBy: [user.uid] } : {}),

                createdAt: serverTimestamp()
            });

            transaction.update(chatRef, {
                lastMessage: "🎤 Voice message",
                lastSenderId: user.uid,

                unreadCounts: {
                    ...counts,
                    [user.uid]: 0,
                    [recipientUid]: selfChat
                        ? 0
                        : recipientCount + 1
                },

                lastMessageAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        });

        playSound("send");
        clearReply();

        if (activeChatId === chatId) {
            hideMessage(chatError);
        }
    } catch (error) {
        // Cloudinary uploads cannot be deleted securely from the browser.
        // Keep the original error and preserve the existing error handling.
        throw error;
    }
}

voiceRecordButton?.addEventListener("click", () => {
    if (voiceRecorder?.state === "recording") voiceRecorder.stop();
    else void startVoiceRecording();
});

imageMessageButton?.addEventListener("click", () => {
    if (!currentUser || !activeChatId || !activeChatData) return;
    if (!isChatAccepted(activeChatData) || isChatBlocked(activeChatData)) {
        showChatError("Accept the chat request before sending images.");
        return;
    }
    imageMessageInput?.click();
});

imageMessageInput?.addEventListener("change", async () => {
    const file = imageMessageInput.files?.[0];
    imageMessageInput.value = "";
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        showChatError("Choose a JPG, PNG, WebP, GIF, or AVIF image.");
        return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
        showChatError("Images must be 10 MB or smaller.");
        return;
    }
    try {
        await sendImageMessage(file);
    } catch (error) {
        console.error("Image message send failed:", error);
        showChatError(error?.message || "Image wasn't sent. Check Supabase Storage and Firestore rules.");
    }
});

cancelVoicePreviewButton?.addEventListener("click", () => {
    const objectUrl = voicePreviewPlayer?.dataset.objectUrl;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (voicePreviewPlayer) {
        voicePreviewPlayer.pause();
        voicePreviewPlayer.removeAttribute("src");
        delete voicePreviewPlayer.dataset.objectUrl;
    }
    if (voicePreviewPanel) voicePreviewPanel.hidden = true;
    pendingVoiceMessage = null;
});

sendVoicePreviewButton?.addEventListener("click", async () => {
    if (!pendingVoiceMessage) return;
    sendVoicePreviewButton.disabled = true;
    try {
        const pending = pendingVoiceMessage;
        await sendVoiceMessage(pending.blob, pending.durationSeconds, pending.mimeType, pending.target);
        const objectUrl = voicePreviewPlayer?.dataset.objectUrl;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        if (voicePreviewPlayer) {
            voicePreviewPlayer.pause();
            voicePreviewPlayer.removeAttribute("src");
            delete voicePreviewPlayer.dataset.objectUrl;
        }
        if (voicePreviewPanel) voicePreviewPanel.hidden = true;
        pendingVoiceMessage = null;
        hideMessage(chatError);
    } catch (error) {
        console.error("Voice message send failed:", error);
        showChatError(error?.message || "Voice message wasn't sent. Check Supabase Storage and Firestore rules.");
        sendVoicePreviewButton.disabled = false;
    }
});

voiceCancelButton?.addEventListener("click", () => {
    if (voiceRecorder?.state === "recording") {
        voiceCancelRequested = true;
        voiceRecorder.stop();
    }
});

$("stop-voice-recording")?.addEventListener("click", () => {
    if (voiceRecorder?.state === "recording") voiceRecorder.stop();
});

window.addEventListener("beforeunload", () => {
    clearInterval(voiceDurationTimer);
    for (const url of voiceObjectUrls.values()) URL.revokeObjectURL(url);
    voiceObjectUrls.clear();
});

function autoResizeMessageInput() {
    if (!messageInput) return;

    messageInput.style.height = "auto";

    messageInput.style.height =
        `${Math.min(messageInput.scrollHeight, 140)}px`;
}

messageInput?.addEventListener("input", () => {
    autoResizeMessageInput();
    updateComposerMode();

    const direction = directionForText(messageInput.value);
    messageInput.dir = direction;
    messageInput.style.textAlign = direction === "rtl" ? "right" : "left";

    if (typingTimer) clearTimeout(typingTimer);

    setTypingState(Boolean(messageInput.value.trim()));

    if (messageInput.value.trim()) {
        typingTimer = setTimeout(() => {
            setTypingState(false);
        }, 1400);
    }
});


updateComposerMode();

/* =========================================================
   BACK TO CONVERSATION LIST
========================================================= */

backToListButton?.addEventListener("click", () => {
    setTypingState(false);
    unsubscribePartnerPresence?.();
    unsubscribePartnerPresence = null;

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

const reactionChoices = composerEmojis;
const quickReactionChoices = ["❤️", "😂", "👍", "😮", "🔥"];

function beginReply(message) {
    replyingTo = {
        id: message.id,
        senderId: message.senderId,
        text: message.deletedForEveryone
            ? "This message was deleted."
            : message.type === "image"
                ? "📷 Image"
                : message.type === "audio"
                    ? "🎤 Voice message"
                    : (message.text || "Message")
    };

    if (replyPreviewLabel) {
        replyPreviewLabel.textContent = message.senderId === currentUser?.uid
            ? "Replying to yourself"
            : `Replying to ${activeChatPartner?.displayName || "friend"}`;
    }

    if (replyPreviewText) replyPreviewText.textContent = replyingTo.text;
    if (replyPreview) replyPreview.hidden = false;

    messageInput?.focus();
}

function clearReply() {
    replyingTo = null;

    if (replyPreview) replyPreview.hidden = true;
    if (replyPreviewText) replyPreviewText.textContent = "";
}

function renderReactions(message) {
    const reactions = message.reactions || {};
    const entries = Object.entries(reactions)
        .filter(([, users]) => Array.isArray(users) && users.length);

    if (!entries.length) return null;

    const list = document.createElement("div");
    list.className = "message-reactions";

    for (const [emoji, users] of entries) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = users.includes(currentUser?.uid)
            ? "is-reacted"
            : "";
        button.textContent = `${emoji} ${users.length}`;
        button.addEventListener("click", () => {
            toggleReaction(message, emoji);
        });
        list.append(button);
    }

    return list;
}

async function toggleReactionPicker(message) {
    const picker = document.createElement("div");
    picker.className = "reaction-modal-picker";

    for (const emoji of reactionChoices) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = emoji;
        button.setAttribute("aria-label", `React with ${emoji}`);
        button.addEventListener("click", async () => {
            await toggleReaction(message, emoji);
            closeCustomModal(emoji);
        });
        picker.append(button);
    }

    await showCustomModal({
        type: "reaction",
        title: "React to message",
        description: "Choose an emoji reaction.",
        icon: "☺",
        content: picker,
        buttons: [
            {
                label: "Cancel",
                action: "cancel",
                style: "custom-modal-button-secondary"
            }
        ]
    });
}

async function toggleReaction(message, emoji) {
    if (!currentUser || !activeChatId || !message?.id) return;

    const messageRef = doc(
        db,
        "chats",
        activeChatId,
        "messages",
        message.id
    );

    try {
        await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(messageRef);
            if (!snapshot.exists()) return;

            const data = snapshot.data();
            const reactions = { ...(data.reactions || {}) };
            const users = Array.isArray(reactions[emoji])
                ? [...reactions[emoji]]
                : [];
            const index = users.indexOf(currentUser.uid);

            if (index === -1) {
                users.push(currentUser.uid);
            } else {
                users.splice(index, 1);
            }

            if (users.length) {
                reactions[emoji] = users;
            } else {
                delete reactions[emoji];
            }

            transaction.update(messageRef, { reactions });
        });
    } catch (error) {
        console.error("Could not update reaction:", error);
    }
}

function focusMessage(messageId) {
    if (!messageId || !messagesList) return;

    const target = messagesList.querySelector(
        `[data-message-id="${CSS.escape(messageId)}"]`
    );

    if (!target) return;

    target.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    target.classList.remove("message-target-highlight");
    void target.offsetWidth;
    target.classList.add("message-target-highlight");

    window.setTimeout(() => {
        target.classList.remove("message-target-highlight");
    }, 1400);
}

/* =====================================
   FRIENDS4EVER PWA INSTALL
===================================== */

let friends4EverInstallPrompt = null;

const installPopup =
    document.getElementById("install-app-popup");

const installPopupInstall =
    document.getElementById("install-popup-install");

const installPopupLater =
    document.getElementById("install-popup-later");

const installPopupClose =
    document.getElementById("install-popup-close");

const installPopupNever =
    document.getElementById("install-popup-never");

const settingsInstallApp =
    document.getElementById("settings-install-app");

const INSTALL_NEVER_KEY = "friends4ever-install-never";
const INSTALL_LATER_KEY = "friends4ever-install-later";


/* =====================================
   CHECK INSTALL STATE
===================================== */

function isFriends4EverInstalled() {
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
    );
}


/* =====================================
   POPUP CONTROLS
===================================== */

function closeFriends4EverInstallPopup() {
    if (installPopup) {
        installPopup.hidden = true;
    }
}

function showFriends4EverInstallPopup() {

    if (!installPopup) return;

    if (isFriends4EverInstalled()) return;

    if (!friends4EverInstallPrompt) return;

    if (localStorage.getItem(INSTALL_NEVER_KEY) === "true") {
        return;
    }

    if (sessionStorage.getItem(INSTALL_LATER_KEY) === "true") {
        return;
    }

    installPopup.hidden = false;
}


/* =====================================
   UPDATE INSTALL UI
===================================== */

function updateFriends4EverInstallUI() {

    const installed = isFriends4EverInstalled();

    const canInstall =
        !!friends4EverInstallPrompt && !installed;

    if (settingsInstallApp) {
        settingsInstallApp.hidden = !canInstall;
    }

    if (installed) {
        closeFriends4EverInstallPopup();
    }
}


/* =====================================
   BROWSER INSTALL PROMPT
===================================== */

window.addEventListener("beforeinstallprompt", event => {

    // Prevent the browser's automatic mini prompt.
    event.preventDefault();

    // Save the native installation event.
    friends4EverInstallPrompt = event;

    console.log("[PWA] Install prompt is available.");

    updateFriends4EverInstallUI();

    // Show the popup only when installation is available.
    showFriends4EverInstallPopup();

});


/* =====================================
   INSTALL APP
===================================== */

async function installFriends4Ever() {

    if (isFriends4EverInstalled()) {
        updateFriends4EverInstallUI();
        return;
    }

    if (!friends4EverInstallPrompt) {
        console.log("[PWA] Native install prompt is unavailable.");
        return;
    }

    const installEvent = friends4EverInstallPrompt;

    // The prompt can only be used once.
    friends4EverInstallPrompt = null;

    closeFriends4EverInstallPopup();
    updateFriends4EverInstallUI();

    try {

        await installEvent.prompt();

        const result = await installEvent.userChoice;

        console.log(
            "[PWA] Install result:",
            result.outcome
        );

        if (result.outcome === "accepted") {
            console.log("[PWA] User accepted installation.");
        } else {
            console.log("[PWA] User dismissed installation.");
        }

    } catch (error) {

        console.error(
            "[PWA] Installation failed:",
            error
        );

    }

    updateFriends4EverInstallUI();
}


/* =====================================
   INSTALL BUTTONS
===================================== */

installPopupInstall?.addEventListener(
    "click",
    installFriends4Ever
);

settingsInstallApp?.addEventListener(
    "click",
    installFriends4Ever
);


/* =====================================
   APP INSTALLED
===================================== */

window.addEventListener("appinstalled", () => {

    console.log("[PWA] Friends4Ever installed.");

    friends4EverInstallPrompt = null;

    closeFriends4EverInstallPopup();

    sessionStorage.removeItem(INSTALL_LATER_KEY);

    updateFriends4EverInstallUI();

});


/* =====================================
   REMIND ME LATER
===================================== */

function remindFriends4EverLater() {

    sessionStorage.setItem(
        INSTALL_LATER_KEY,
        "true"
    );

    closeFriends4EverInstallPopup();

}

installPopupLater?.addEventListener(
    "click",
    remindFriends4EverLater
);

installPopupClose?.addEventListener(
    "click",
    remindFriends4EverLater
);


/* =====================================
   NEVER SHOW AUTOMATIC POPUP
===================================== */

installPopupNever?.addEventListener("click", () => {

    localStorage.setItem(
        INSTALL_NEVER_KEY,
        "true"
    );

    closeFriends4EverInstallPopup();

});


/* =====================================
   CLOSE ON BACKDROP CLICK
===================================== */

installPopup?.addEventListener("click", event => {

    if (event.target === installPopup) {
        remindFriends4EverLater();
    }

});


/* =====================================
   INITIAL STATE
===================================== */

updateFriends4EverInstallUI();


/* =====================================
   UPDATE WHEN RETURNING TO APP
===================================== */

window.addEventListener(
    "pageshow",
    updateFriends4EverInstallUI
);

const displayModeQuery =
    window.matchMedia("(display-mode: standalone)");

if (displayModeQuery.addEventListener) {

    displayModeQuery.addEventListener(
        "change",
        updateFriends4EverInstallUI
    );

} else {

    displayModeQuery.addListener(
        updateFriends4EverInstallUI
    );

}
