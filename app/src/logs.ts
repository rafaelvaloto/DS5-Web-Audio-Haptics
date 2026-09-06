/**
 * Logger class for logging messages to a specified HTML element.
 * It maintains a maximum number of log lines and automatically scrolls to the bottom.
 */
export class Logger {
    private logLines: string[] = [];
    private logRenderPending: boolean = false;
    private readonly maxLogLines: number;
    private logBox: HTMLElement;

    constructor(containerId: string, maxLogLines: number = 100) {
        this.maxLogLines = maxLogLines;

        const el = document.getElementById(containerId);
        if (!el) {
            throw new Error(`Element with id '${containerId}' not found in the DOM.`);
        }
        this.logBox = el;
    }

    private flushLogRender = (): void => {
        this.logRenderPending = false;
        this.logBox.textContent = this.logLines.join("\n") + "\n";
        this.logBox.scrollTop = this.logBox.scrollHeight;
    };

    public log(message: string): void {
        const time = new Date().toLocaleTimeString();
        this.logLines.push(`[${time}] ${message}`);

        if (this.logLines.length > this.maxLogLines) {
            this.logLines.shift();
        }

        if (!this.logRenderPending) {
            this.logRenderPending = true;
            requestAnimationFrame(this.flushLogRender);
        }
    }

    public clear(): void {
        this.logLines = [];
        this.logBox.textContent = "";
        this.logRenderPending = false;
    }
}
