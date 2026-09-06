"use strict";
// Dicionário de Efeitos
const EFFECTS = {
    "0x21": "Feedback",
    "0x22": "Bow",
    "0x25": "Weapon",
    "0x26": "Automatic Gun",
    "0x27": "Machine",
};
// Gera o HTML do formulário (3 slots)
function initForm() {
    const container = document.getElementById("triggersContainer");
    if (!container)
        return;
    let html = "";
    for (let i = 1; i <= 3; i++) {
        html += `
        <div class="p-3 bg-gray-900 border border-gray-700 rounded relative">
            <div class="absolute top-0 right-0 bg-gray-700 text-xs px-2 py-1 rounded-bl text-gray-300">Trigger ${i}</div>
            <div class="grid grid-cols-2 gap-2 mt-2 mb-2">
                <div>
                    <label class="block text-xs text-gray-400 mb-1">Nome (Ex: AK47)</label>
                    <input type="text" id="t${i}_name" class="w-full bg-gray-700 border border-gray-600 rounded p-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-1">Efeito (ID)</label>
                    <select id="t${i}_type" class="w-full bg-gray-700 border border-gray-600 rounded p-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
                        <option value="0x21">0x21 - Feedback</option>
                        <option value="0x22">0x22 - Bow</option>
                        <option value="0x25">0x25 - Weapon</option>
                        <option value="0x26">0x26 - Automatic Gun</option>
                        <option value="0x27">0x27 - Machine</option>
                    </select>
                </div>
            </div>
            <div>
                <label class="block text-xs text-gray-400 mb-1">Payload Hex</label>
                <input type="text" id="t${i}_hex" placeholder="Ex: 02 02 3a 0a 05" class="w-full bg-gray-800 border border-gray-600 rounded p-1.5 text-sm font-mono text-green-400 focus:outline-none focus:border-blue-500">
            </div>
        </div>`;
    }
    container.innerHTML = html;
}
// Salva os dados no LocalStorage
function saveGame() {
    const gameNameInput = document.getElementById("gameName");
    const gameName = gameNameInput.value.trim();
    if (!gameName) {
        alert("O nome do jogo é obrigatório.");
        return;
    }
    const triggers = [];
    for (let i = 1; i <= 3; i++) {
        const nameInput = document.getElementById(`t${i}_name`);
        const typeSelect = document.getElementById(`t${i}_type`);
        const hexInput = document.getElementById(`t${i}_hex`);
        const name = nameInput.value.trim();
        const type = typeSelect.value;
        const hex = hexInput.value.trim();
        if (name || hex) {
            triggers.push({ name: name || `Gatilho ${i}`, type, hex });
        }
    }
    if (triggers.length === 0) {
        alert("Preencha pelo menos um gatilho.");
        return;
    }
    const gameData = {
        id: Date.now().toString(),
        gameName,
        triggers,
    };
    const savedData = JSON.parse(localStorage.getItem("dualsenseProfiles") || "[]");
    savedData.push(gameData);
    localStorage.setItem("dualsenseProfiles", JSON.stringify(savedData));
    // Limpa o formulário
    gameNameInput.value = "";
    for (let i = 1; i <= 3; i++) {
        document.getElementById(`t${i}_name`).value = "";
        document.getElementById(`t${i}_hex`).value = "";
    }
    loadGames();
}
// Carrega os jogos do LocalStorage e renderiza o HTML
function loadGames() {
    const list = document.getElementById("savedGamesList");
    if (!list)
        return;
    const savedData = JSON.parse(localStorage.getItem("dualsenseProfiles") || "[]");
    if (savedData.length === 0) {
        list.innerHTML = `<p class="text-gray-500 italic col-span-2">Nenhum perfil salvo ainda.</p>`;
        return;
    }
    let html = "";
    savedData.forEach((game) => {
        let triggersHtml = "";
        game.triggers.forEach((t) => {
            const hexCleaned = t.type.replace("0x", "");
            triggersHtml += `
            <div class="bg-gray-900 p-2 rounded mb-2 border border-gray-700">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-sm text-gray-200">${t.name}</span>
                    <span class="text-xs bg-gray-700 px-2 py-0.5 rounded text-blue-300">${EFFECTS[t.type] || t.type}</span>
                </div>
                <div class="font-mono text-xs text-green-400 bg-black p-1.5 rounded break-all">
                    ds.SetTrigR 1 ${hexCleaned} ${t.hex}
                </div>
            </div>`;
        });
        html += `
        <div class="bg-gray-800 p-4 rounded border border-gray-600 relative group shadow-md">
            <button data-id="${game.id}" class="btn-delete absolute top-2 right-2 text-gray-500 hover:text-red-500 transition-colors" title="Deletar Perfil">
                <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
            <h3 class="font-bold text-lg mb-3 text-white pr-6">${game.gameName}</h3>
            ${triggersHtml}
        </div>`;
    });
    list.innerHTML = html;
}
// Remove um item do LocalStorage
function deleteGame(id) {
    let savedData = JSON.parse(localStorage.getItem("dualsenseProfiles") || "[]");
    savedData = savedData.filter((game) => game.id !== id);
    localStorage.setItem("dualsenseProfiles", JSON.stringify(savedData));
    loadGames();
}
// Limpa tudo do LocalStorage
function clearAll() {
    if (confirm("Tem certeza que deseja apagar todos os perfis salvos?")) {
        localStorage.removeItem("dualsenseProfiles");
        loadGames();
    }
}
// Registra os event listeners quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
    initForm();
    loadGames();
    const btnSave = document.getElementById("btnSave");
    if (btnSave) {
        btnSave.addEventListener("click", saveGame);
    }
    const btnClear = document.getElementById("btnClear");
    if (btnClear) {
        btnClear.addEventListener("click", clearAll);
    }
    // Delegação de eventos para os botões de exclusão que são renderizados dinamicamente
    const savedGamesList = document.getElementById("savedGamesList");
    if (savedGamesList) {
        savedGamesList.addEventListener("click", (event) => {
            const target = event.target;
            // Verifica se o clique foi no botão de deletar ou dentro dele
            const deleteBtn = target.closest(".btn-delete");
            if (deleteBtn) {
                const gameId = deleteBtn.getAttribute("data-id");
                if (gameId) {
                    deleteGame(gameId);
                }
            }
        });
    }
});
