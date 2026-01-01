import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SystemStats {
    cpu: {
        usage: number;
        cores: number;
        model: string;
    };
    memory: {
        total: number;
        used: number;
        free: number;
        usagePercent: number;
    };
    gpu?: {
        name: string;
        memoryTotal: number;
        memoryUsed: number;
        memoryFree: number;
        utilization: number;
        temperature: number;
    };
    uptime: number;
    platform: string;
}

/**
 * Get CPU usage (simple snapshot)
 */
function getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
        for (const type in cpu.times) {
            totalTick += cpu.times[type as keyof typeof cpu.times];
        }
        totalIdle += cpu.times.idle;
    }

    return Math.round((1 - totalIdle / totalTick) * 100);
}

/**
 * Get NVIDIA GPU stats via nvidia-smi
 */
async function getGpuStats(): Promise<SystemStats['gpu'] | undefined> {
    try {
        const { stdout } = await execAsync(
            'nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu --format=csv,noheader,nounits'
        );

        const [name, memTotal, memUsed, memFree, util, temp] = stdout.trim().split(', ');

        return {
            name: name.trim(),
            memoryTotal: parseInt(memTotal),
            memoryUsed: parseInt(memUsed),
            memoryFree: parseInt(memFree),
            utilization: parseInt(util),
            temperature: parseInt(temp),
        };
    } catch {
        return undefined; // No NVIDIA GPU or nvidia-smi not available
    }
}

/**
 * Get complete system stats
 */
export async function getSystemStats(): Promise<SystemStats> {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const [gpu] = await Promise.all([getGpuStats()]);

    return {
        cpu: {
            usage: getCpuUsage(),
            cores: os.cpus().length,
            model: os.cpus()[0]?.model || 'Unknown',
        },
        memory: {
            total: Math.round(totalMem / (1024 * 1024 * 1024) * 100) / 100, // GB
            used: Math.round(usedMem / (1024 * 1024 * 1024) * 100) / 100,
            free: Math.round(freeMem / (1024 * 1024 * 1024) * 100) / 100,
            usagePercent: Math.round((usedMem / totalMem) * 100),
        },
        gpu,
        uptime: os.uptime(),
        platform: os.platform(),
    };
}
