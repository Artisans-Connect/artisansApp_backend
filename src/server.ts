import app from './app';
import { logger } from './utils/logger';
import { env } from './config/env';
import './config/firebase';
import { startScheduler } from './services/schedulerService';

const PORT = env.PORT;


async function startServer() 
    {
        try{
            process.on('SIGTERM', () => {
                logger('SIGTERM received → shutting down server');
                process.exit(0);
              });
              
            app.listen(PORT, () => {
                logger(`[Server] Server is running on port ${PORT}`);
                startScheduler();
            });
        }catch(error){
            logger(`[Server] Error starting server`, error);
            process.exit(1);
        }
    }

startServer();