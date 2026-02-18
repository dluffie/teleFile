/**
 * In-memory sequential queue for Telegram API operations.
 * Ensures only one upload happens at a time with delays between ops
 * to avoid Telegram flood limits / bans.
 */

class UploadQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.DELAY_MS = 350; // ms between Telegram operations
    }

    /**
     * Add a task to the queue
     * @param {Function} task - async function to execute
     * @returns {Promise} resolves with task result
     */
    enqueue(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this._process();
        });
    }

    async _process() {
        if (this.processing) return;
        this.processing = true;

        while (this.queue.length > 0) {
            const { task, resolve, reject } = this.queue.shift();

            let attempts = 0;
            const maxAttempts = 3;

            while (attempts < maxAttempts) {
                try {
                    const result = await task();
                    resolve(result);
                    break;
                } catch (err) {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        reject(err);
                        break;
                    }
                    // Exponential backoff: 1s, 2s, 4s
                    const backoff = Math.pow(2, attempts) * 1000;
                    console.warn(`⚠️ Queue retry ${attempts}/${maxAttempts} in ${backoff}ms: ${err.message}`);
                    await this._delay(backoff);
                }
            }

            // Delay between operations
            await this._delay(this.DELAY_MS);
        }

        this.processing = false;
    }

    _delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    get length() {
        return this.queue.length;
    }
}

// Singleton instance
const uploadQueue = new UploadQueue();
module.exports = uploadQueue;
