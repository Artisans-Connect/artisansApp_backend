import { Application, Request, Response } from 'express';
import { merge, isErrorResult } from 'openapi-merge';
import YAML from 'yamljs';
import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { apiReference } from '@scalar/express-api-reference';
import { logger } from './logger';

export function setupSwagger(app: Application) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const swaggerDirs = [
    path.join(__dirname, '../docs'),
    path.join(process.cwd(), 'docs'),
    path.join(process.cwd(), 'src/docs'),
  ];

  const swaggerDir = swaggerDirs.find((dir) => fs.existsSync(dir));
  let swaggerDocument: any = {};

  if (!swaggerDir) {
    logger('Swagger directory not found; skipping spec loading.');
  } else {
    const files = fs.readdirSync(swaggerDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    const inputs: any[] = [];
    for (const file of files) {
      try {
        const doc = YAML.load(path.join(swaggerDir, file));
        inputs.push({ oas: doc });
      } catch (err) {
        logger(`Failed to load swagger file ${file}:`, err);
      }
    }

    if (inputs.length > 0) {
      const mergeResult = merge(inputs as any);
      if (isErrorResult(mergeResult)) {
        logger(`Failed to merge OpenAPI specs: ${mergeResult.message}`);
      } else {
        swaggerDocument = mergeResult.output;
      }
    }
  }

  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerDocument);
  });

  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerDocument);
  });

  app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    swaggerUrl: '/api-docs.json',
  }));

  app.use(
    '/scalar',
    apiReference({
      url: '/api-docs.json',
    })
  );
}
