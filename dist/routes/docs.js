"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const express_1 = require("express");
const router = (0, express_1.Router)();
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
    const openapiPath = node_path_1.default.join(process.cwd(), 'public', 'openapi.json');
    const openapiDocument = JSON.parse(node_fs_1.default.readFileSync(openapiPath, 'utf-8'));
    res.setHeader('Cache-Control', 'no-store');
    res.json(openapiDocument);
});
exports.default = router;
