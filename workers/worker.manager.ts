import { Worker } from 'worker_threads';
import path from 'path';
import logger from '../config/logger';

interface Task {
    taskData: { action: string; data: string };
    resolve: (value: string | PromiseLike<string>) => void;
    reject: (reason?: any) => void;
}

class WorkerManager {
    private static instance: WorkerManager;
    private worker: Worker | null = null;
    private taskQueue: Task[] = [];
    private isWorkerBusy = false;
    private idleTimeout: NodeJS.Timeout | null = null;
    private readonly IDLE_TIME_LIMIT = 30000; // 30 seconds

    // Singleton pattern to ensure only one worker is created
    private constructor() {}

    static getInstance(): WorkerManager {
        if (!WorkerManager.instance) {
            WorkerManager.instance = new WorkerManager();
        }
        return WorkerManager.instance;
    }

    private getWorker(): Worker {
        if (!this.worker) {
            this.worker = new Worker(path.join(__dirname, 'encrypt-worker.js'));

            // Handle messages from the worker
            this.worker.on('message', (result: string) => {
                const task = this.taskQueue.shift();
                if (task) {
                    task.resolve(result);
                }
                this.isWorkerBusy = false;
                this.processNextTask();
                this.resetIdleTimer();
            });

            // Handle errors
            this.worker.on('error', (error: Error) => {
                const task = this.taskQueue.shift();
                if (task) {
                    task.reject(error);
                }
                this.isWorkerBusy = false;
                this.processNextTask();
            });

            // Handle worker exit
            this.worker.on('exit', (code) => {
                logger.error(`Worker stopped with exit code ${code}`);
                this.worker = null;
            });
        }
        return this.worker;
    }

    // Add a task to the queue
    public addTask(action: 'encrypt' | 'decrypt', data: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.taskQueue.push({ taskData: { action, data }, resolve, reject });
            this.processNextTask();
        });
    }

    // Process the next task in the queue
    private processNextTask() {
        if (!this.isWorkerBusy && this.taskQueue.length > 0) {
            this.isWorkerBusy = true;
            const { taskData } = this.taskQueue[0];
            this.getWorker().postMessage(taskData);
        }
    }

    // Reset the idle timer
    private resetIdleTimer() {
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
        }
        this.idleTimeout = setTimeout(() => {
            this.terminateWorker();
        }, this.IDLE_TIME_LIMIT);
    }

    // Terminate the worker to free resources
    private terminateWorker() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.isWorkerBusy = false;
            clearTimeout(this.idleTimeout!);
            logger.info('Worker terminated due to inactivity.');
        }
    }
}

export default WorkerManager.getInstance();
