import { json, type RequestHandler } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const POST: RequestHandler = async () => {
  try {
    const host = process.env.REDIS_HOST || '10.12.127.84';
    const port = process.env.REDIS_PORT || '10000';
    const password = process.env.REDIS_PASSWORD;

    if (!password) {
      throw new Error('REDIS_PASSWORD environment variable is not set');
    }

    const command = `npx redis-cli -h ${host} -p ${port} -a ${password} FLUSHALL`;
    
    console.log(`Running: npx redis-cli -h ${host} -p ${port} -a *** FLUSHALL`);
    
    await execAsync(command);
    
    console.log('Redis cache flushed successfully');
    return json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error flushing cache:', error);
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
