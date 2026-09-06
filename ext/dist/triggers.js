"use strict";
const STORAGE_KEY = "dualsense_profiles";
const EFFECTS = {
    "21": "Feedback",
    "22": "Bow",
    "25": "Weapon",
    "26": "Auto Gun",
    "27": "Machine",
};
const SELECT_EFFECT_TYPE = {
    21: 6,
    22: 3,
    23: 4,
    25: 3,
    26: 9,
    27: 5,
};
const DEFAULT_EFFECT_VALUES = {
    21: [128, 3, 255, 255, 255, 255], // 0x21 - Feedback
    22: [128, 1, 63], // 0x22 - Bow
    23: [128, 2, 20, 2], // 0x23 - Galloping
    25: [128, 2, 70], // 0x25 - Weapon
    26: [0, 3, 0, 0, 0, 255, 0, 0, 12], // 0x26 - Automatic Gun
    27: [0, 3, 112, 15, 10], // 0x27 - Machine
};
const deviceChannel = new BroadcastChannel("dualsense_channel");
// Função para enviar os logs gerados nesta janela para a tela principal
function remoteLog(message) {
    console.log(message); // Mantém no console local do devtools desta aba
    deviceChannel.postMessage({ type: "REMOTE_LOG", message: message });
}
document.getElementById("btn-apply-trigger")?.addEventListener("click", (e) => {
    let modeValue = document.getElementById("effectMode").value;
    let payloadValue = document.getElementById("hexOutput").dataset.payload;
    let trigger = modeValue + " " + payloadValue;
    localStorage.setItem("trigger_test", JSON.stringify({
        hand: document.getElementById("sel-trigger-hand").value,
        effect: trigger || [],
    }));
    deviceChannel.postMessage({ type: "DEVICE_APPLY_TRIGGER_TEST" });
    remoteLog(`[Teste] Testando gatilho 0x${modeValue}...`);
});
function initSliders() {
    const container = document.getElementById("slidersContainer");
    if (!container) {
        return;
    }
    let modeSelect = document.getElementById("effectMode");
    let hexString = modeSelect?.value || "21";
    let modeNum = Number(hexString);
    let numLength = SELECT_EFFECT_TYPE[modeNum] || 6;
    let defaults = DEFAULT_EFFECT_VALUES[modeNum] || [];
    let html = "";
    if (modeNum === 23) {
        for (let i = 1; i <= numLength; i++) {
            let defaultVal = defaults[i - 1] !== undefined ? defaults[i - 1] : 0;
            let hexVal = toHex(defaultVal);
            if (i == 2) {
                html += `
             <div class="audio-control">
                <div class="audio-control-row">
                   <label>Byte ${i}</label>
                   <output id="val-${hexString}_b${i}">${defaultVal} (0x${hexVal})</output>
                </div>
                <input type="range" id="${hexString}_b${i}" min="0" max="3" value="${defaultVal}">
             </div>`;
            }
            else if (i == 3) {
                html += `
             <div class="audio-control">
                <div class="audio-control-row">
                   <label>Byte ${i}</label>
                   <output id="val-${hexString}_b${i}">${defaultVal} (0x${hexVal})</output>
                </div>
                <input type="range" id="${hexString}_b${i}" min="0" max="30" value="${defaultVal}">
             </div>`;
            }
            else if (i == 4) {
                html += `
          <div class="audio-control">
             <div class="audio-control-row">
                <label>Byte ${i}</label>
                <output id="val-${hexString}_b${i}">${defaultVal} (0x${hexVal})</output>
             </div>
             <input type="range" id="${hexString}_b${i}" min="0" max="15" value="${defaultVal}">
          </div>`;
            }
            else {
                html += `
          <div class="audio-control">
             <div class="audio-control-row">
                <label>Byte ${i}</label>
                <output id="val-${hexString}_b${i}">${defaultVal} (0x${hexVal})</output>
             </div>
             <input type="range" id="${hexString}_b${i}" min="0" max="255" value="${defaultVal}">
          </div>`;
            }
        }
    }
    else {
        for (let i = 1; i <= numLength; i++) {
            let defaultVal = defaults[i - 1] !== undefined ? defaults[i - 1] : 0;
            let hexVal = toHex(defaultVal);
            if (i == 2) {
                html += `
             <div class="audio-control">
                <div class="audio-control-row">
                   <label>Byte ${i}</label>
                   <output id="val-${hexString}_b${i}">${defaultVal} (0x${hexVal})</output>
                </div>
                <input type="range" id="${hexString}_b${i}" min="0" max="3" value="${defaultVal}">
             </div>`;
            }
            else if (i == 9) {
                html += `
             <div class="audio-control">
                <div class="audio-control-row">
                   <label>Byte ${i}</label>
                   <output id="val-${hexString}_b${i}">${defaultVal} (0x${hexVal})</output>
                </div>
                <input type="range" id="${hexString}_b${i}" min="0" max="40" value="${defaultVal}">
             </div>`;
            }
            else {
                html += `
          <div class="audio-control">
             <div class="audio-control-row">
                <label>Byte ${i}</label>
                <output id="val-${hexString}_b${i}">${defaultVal} (0x${hexVal})</output>
             </div>
             <input type="range" id="${hexString}_b${i}" min="0" max="255" value="${defaultVal}">
          </div>`;
            }
        }
    }
    container.innerHTML = html;
    for (let i = 1; i <= numLength; i++) {
        document.getElementById(`${hexString}_b${i}`)?.addEventListener("input", updateHexOutput);
    }
}
function toHex(dec) {
    return Math.max(0, Math.min(255, dec)).toString(16).padStart(2, "0");
}
function updateHexOutput() {
    const modeSelect = document.getElementById("effectMode");
    if (!modeSelect)
        return;
    let hexString = modeSelect.value || "21";
    let payloadOnly = "";
    let numLength = SELECT_EFFECT_TYPE[Number(hexString)] || 6;
    for (let i = 1; i <= numLength; i++) {
        const slider = document.getElementById(`${hexString}_b${i}`);
        const output = document.getElementById(`val-${hexString}_b${i}`);
        const val = parseInt(slider?.value || "0", 10);
        const hexVal = toHex(val);
        if (output) {
            output.textContent = `${val} (0x${hexVal})`;
        }
        payloadOnly += `${hexVal} `;
    }
    const hexOutput = document.getElementById("hexOutput");
    if (hexOutput) {
        hexOutput.textContent = `${hexString} ${payloadOnly.trim()}`;
        hexOutput.dataset.payload = payloadOnly.trim();
    }
}
function getSavedGames() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    }
    catch {
        return [];
    }
}
function saveTrigger() {
    const gameName = document.getElementById("gameName").value.trim();
    const effectName = document.getElementById("effectName").value.trim();
    const effectMode = document.getElementById("effectMode").value;
    const payload = document.getElementById("hexOutput")?.dataset.payload || "";
    if (!gameName || !effectName) {
        alert("Preencha o nome do Game e do Efeito.");
        return;
    }
    let games = getSavedGames();
    let gameIndex = games.findIndex((g) => g.gameName.toLowerCase() === gameName.toLowerCase());
    const newTrigger = {
        id: Date.now().toString(),
        name: effectName,
        type: effectMode,
        hex: payload,
        hand: document.getElementById("sel-trigger-hand").value,
    };
    if (gameIndex >= 0) {
        if (games[gameIndex].triggers.length >= 3) {
            alert(`O jogo "${games[gameIndex].gameName}" já atingiu o limite de 3 gatilhos.`);
            return;
        }
        games[gameIndex].triggers.push(newTrigger);
    }
    else {
        games.push({
            gameName: gameName,
            triggers: [newTrigger],
        });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
    document.getElementById("effectName").value = "";
    let _effectMode = document.getElementById("effectMode").value;
    let numLength = SELECT_EFFECT_TYPE[Number(_effectMode)] || 6;
    for (let i = 1; i <= numLength; i++) {
        const slider = document.getElementById(`${_effectMode}_b${i}`);
        if (slider)
            slider.value = "0";
    }
    updateHexOutput();
    renderSavedGames();
    remoteLog(`[Salvo] Gatilho "${effectName}" adicionado ao jogo "${gameName}".`);
    deviceChannel.postMessage({ type: "LOAD_PROFILES" });
}
function renderSavedGames() {
    const list = document.getElementById("savedGamesList");
    if (!list)
        return;
    const games = getSavedGames();
    if (games.length === 0) {
        list.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">Nenhum perfil salvo.</p>`;
        return;
    }
    let html = "";
    games.forEach((game) => {
        let triggersHtml = "";
        game.triggers.forEach((t) => {
            triggersHtml += `
            <div class="saved-trigger">
                <div class="trigger-header">
                    <strong>${t.name}</strong>
                    <span class="trigger-hand">${Number(t.hand) === 0 ? "Left (L2)" : Number(t.hand) === 2 ? "Both (L2 + R2)" : "Right (R2)"}</span>
                    <span>${EFFECTS[t.type] || t.type} (0x${t.type})</span>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <span class="trigger-cmd">${t.type} ${t.hex}</span>
                    <button class="btn btn-danger btn-small btn-del-trigger" data-game="${game.gameName}" data-tid="${t.id}">X</button>
                </div>
            </div>`;
        });
        html += `
        <div class="saved-game">
            <div class="saved-game-title">
                ${game.gameName}
                <button class="btn btn-danger btn-small btn-del-game" data-game="${game.gameName}">Excluir Jogo</button>
            </div>
            ${triggersHtml}
        </div>`;
    });
    list.innerHTML = html;
}
function deleteGame(gameName) {
    let games = getSavedGames();
    games = games.filter((g) => g.gameName !== gameName);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
    remoteLog(`[Excluído] Jogo "${gameName}" e todos os seus perfis foram apagados.`);
    renderSavedGames();
    deviceChannel.postMessage({ type: "LOAD_PROFILES" });
}
function deleteTrigger(gameName, triggerId) {
    let games = getSavedGames();
    const game = games.find((g) => g.gameName === gameName);
    if (game) {
        const triggerName = game.triggers.find((t) => t.id === triggerId)?.name || triggerId;
        game.triggers = game.triggers.filter((t) => t.id !== triggerId);
        if (game.triggers.length === 0) {
            games = games.filter((g) => g.gameName !== gameName);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
        remoteLog(`[Excluído] Gatilho "${triggerName}" apagado do jogo "${gameName}".`);
        renderSavedGames();
        deviceChannel.postMessage({ type: "LOAD_PROFILES" });
    }
}
function clearAll() {
    if (confirm("Apagar todos os perfis e gatilhos?")) {
        localStorage.removeItem(STORAGE_KEY);
        remoteLog(`[Excluído] Todos os perfis de gatilho foram apagados.`);
        renderSavedGames();
        deviceChannel.postMessage({ type: "LOAD_PROFILES" });
    }
}
document.addEventListener("DOMContentLoaded", () => {
    initSliders();
    updateHexOutput();
    renderSavedGames();
    document.getElementById("effectMode")?.addEventListener("change", () => {
        initSliders();
        updateHexOutput();
    });
    document.getElementById("btnSave")?.addEventListener("click", saveTrigger);
    document.getElementById("btnClearAll")?.addEventListener("click", clearAll);
    document.getElementById("savedGamesList")?.addEventListener("click", (e) => {
        const target = e.target;
        if (target.classList.contains("btn-del-game")) {
            const game = target.getAttribute("data-game");
            if (game && confirm(`Excluir o perfil do jogo ${game}?`)) {
                deleteGame(game);
            }
        }
        if (target.classList.contains("btn-del-trigger")) {
            const game = target.getAttribute("data-game");
            const tid = target.getAttribute("data-tid");
            if (game && tid) {
                deleteTrigger(game, tid);
            }
        }
    });
});
