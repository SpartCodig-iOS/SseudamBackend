import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

const router = Router();

router.get('/test', (_req, res) => {
  res.send('TEST WORKING!');
});

// Custom HTML to serve Swagger UI with local files - Safari Compatible
const customSwaggerHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VaporDockerApp API Docs</title>
  <link rel="stylesheet" type="text/css" href="/swagger-ui/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>

  <!-- Load scripts directly in HTML for Safari compatibility -->
  <script src="/swagger-ui/swagger-ui-bundle.js"></script>
  <script src="/swagger-ui/swagger-ui-standalone-preset.js"></script>
  <script>
    // Safari-compatible initialization
    function initSwagger() {
      try {
        if (typeof SwaggerUIBundle === 'undefined' || typeof SwaggerUIStandalonePreset === 'undefined') {
          console.log('Waiting for Swagger UI libraries to load...');
          setTimeout(initSwagger, 100);
          return;
        }

        console.log('Initializing Swagger UI...');
        var ui = SwaggerUIBundle({
          url: '/openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "StandaloneLayout",
          docExpansion: 'none',
          operationsSorter: 'alpha',
          tagsSorter: 'alpha'
        });
        console.log('Swagger UI initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Swagger UI:', error);
        document.getElementById('swagger-ui').innerHTML =
          '<div style="padding: 20px; color: red;">Failed to initialize Swagger UI. Error: ' + error.message + '</div>';
      }
    }

    // Wait for DOM and scripts to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(initSwagger, 100);
      });
    } else {
      setTimeout(initSwagger, 100);
    }
  </script>
</body>
</html>
`;

const swaggerUiOptions = {
  customSiteTitle: 'VaporDockerApp API Docs',
  swaggerOptions: {
    url: '/openapi.json',
    deepLinking: true,
    docExpansion: 'none',
    operationsSorter: 'alpha',
    tagsSorter: 'alpha',
  },
};

// Serve custom HTML instead of swagger-ui-express to avoid CDN issues
router.get('/docs', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(customSwaggerHTML);
});

router.get('/openapi.json', (_req, res) => {
  const openapiPath = path.join(process.cwd(), 'public', 'openapi.json');
  const openapiDocument = JSON.parse(fs.readFileSync(openapiPath, 'utf-8'));
  res.setHeader('Cache-Control', 'no-store');
  res.json(openapiDocument);
});

export default router;
