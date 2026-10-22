const soundFiles = {
    hover: "../sound/hover.mp3",
    click: "../sound/click.wav",
    receive: "../sound/recieve_msg.wav",
    send: "../sound/send_msg.wav"
};

const sounds = Object.fromEntries(
    Object.entries(soundFiles).map(([name, path]) => {
        const audio = new Audio(new URL(path, import.meta.url));
        audio.preload = "auto";
        return [name, audio];
    })
);

export function playSound(name) {
    const sound = sounds[name];

    if (!sound) return;

    try {
        sound.pause();
        sound.currentTime = 0;
        void sound.play().catch(() => {});
    } catch {
        // Audio is optional; playback failures should not affect app actions.
    }
}

export function enableInterfaceSounds(root = document) {
    root.addEventListener("pointerover", (event) => {
        const element = event.target.closest("button, a");

        if (
            !element ||
            element.disabled ||
            element.contains(event.relatedTarget)
        ) {
            return;
        }

        playSound("hover");
    });

    root.addEventListener("click", (event) => {
        const element = event.target.closest("button, a");

        if (element && !element.disabled) {
            playSound("click");
        }
    });
}

enableInterfaceSounds();