function hexToRgb(hex) {
    // Remove o # se existir
    hex = hex.replace(/^#/, "");
    // Expande formato curto (ex: #03F para #0033FF)
    if (hex.length === 3) {
        hex = hex
            .split("")
            .map((char) => char + char)
            .join("");
    }
    // Separa e converte cada parte para decimal (base 16)
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return { r, g, b };
}
function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(func, args), delay);
    };
}
export { hexToRgb, debounce };
