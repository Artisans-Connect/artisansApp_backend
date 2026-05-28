import express, { NextFunction, type Application, type Request, type Response } from 'express';
import { globalErrorHandler } from './middleware/globalerrorHandler'
import cors from 'cors';
import helmet from 'helmet';
import createHttpError from 'http-errors';
import { setupSwagger } from './utils/swagger';
import { rateLimiter } from './middleware/rateLimiter';
import { authMiddleware } from './middleware/auth';
import apiRouter from './routes';



const app: Application = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(rateLimiter);


// Api Documentation
setupSwagger(app);

/**  Routes*/
app.use('/api', apiRouter);


/* Health check route*/
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Welcome to Artisans API' });
});

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Server is running' });
});

app.get('/protected/health', authMiddleware, (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Protected route accessible',
    user: req.user,
  });
});

/* Graceful Error handling*/
app.use((req: Request, res: Response, next: NextFunction) =>
  next(createHttpError(404, `Can't find ${req.originalUrl} on this server`)),
);
app.use(globalErrorHandler);

export default app;