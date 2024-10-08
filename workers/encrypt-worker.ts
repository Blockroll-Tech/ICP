import { parentPort } from 'worker_threads';
import Cryptr from 'cryptr';

const cryptr = new Cryptr(process.env.encode ?? 'myTotallySecretKey');

// Listen for tasks
parentPort?.on('message', (task: { action: string; data: string }) => {
    try {
        let result: string;
        if (task.action === 'encrypt') {
            result = cryptr.encrypt(task.data);
        } else if (task.action === 'decrypt') {
            result = cryptr.decrypt(task.data);
        } else {
            throw new Error('Invalid action');
        }
        parentPort?.postMessage(result);
    } catch (error) {
        parentPort?.postMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
});
