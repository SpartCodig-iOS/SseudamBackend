import Fluent
import Vapor

func routes(_ app: Application) throws {
    app.get("hello") { req async -> String in
        "Hello, world!"
    }

    app.get("openapi.json") { req async throws -> Response in
        let path = req.application.directory.publicDirectory + "openapi.json"
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        var headers = HTTPHeaders()
        headers.add(name: .contentType, value: "application/json; charset=utf-8")
        headers.add(name: .cacheControl, value: "no-store")
        return Response(status: .ok, headers: headers, body: .init(data: data))
    }

    app.get("docs") { req async -> Response in
        let script = """
        const params = new URLSearchParams(window.location.search);
        const overrideSpec = params.get('spec');

        const buildSpecUrl = () => {
          const timestamp = Date.now().toString();

          if (overrideSpec) {
            try {
              const explicit = new URL(overrideSpec, window.location.href);
              explicit.searchParams.set('ts', timestamp);
              if (explicit.protocol === 'http:' || explicit.protocol === 'https:') {
                return explicit.toString();
              }
            } catch (error) {
              console.error('Invalid ?spec override detected', error);
            }
          }

          const supportedProtocols = ['http:', 'https:'];
          if (!supportedProtocols.includes(window.location.protocol)) {
            const container = document.getElementById('swagger-ui');
            container.innerHTML = "<p style=\"padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;\">Swagger UI 페이지는 http/https 환경에서 열리거나 <code>?spec=https://your-host/openapi.json</code> 형태로 스펙 URL을 명시해야 합니다.</p>";
            return null;
          }

          try {
            const url = new URL('./openapi.json', window.location.href);
            url.searchParams.set('ts', timestamp);
            return url.toString();
          } catch (error) {
            console.error('Unable to resolve local OpenAPI spec URL', error);
            return null;
          }
        };

        const specUrl = buildSpecUrl();
        if (!specUrl) {
          return;
        }

        SwaggerUIBundle({
            url: specUrl,
            dom_id: '#swagger-ui',
            docExpansion: 'none',
            tagsSorter: 'alpha',
            operationsSorter: 'alpha'
        });
        """
        let htmlTemplate = """
        <!DOCTYPE html>
        <html lang=\"ko\">
        <head>
            <meta charset=\"utf-8\" />
            <title>VaporDockerApp API Docs</title>
            <link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css\" />
            <style>
            body { margin: 0; background-color: #f5f5f5; }
            #swagger-ui { max-width: 960px; margin: 0 auto; }
            </style>
        </head>
        <body>
            <div id=\"swagger-ui\"></div>
            <script src=\"https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js\"></script>
            <script>
            window.onload = () => {
              %%SCRIPT%%
            };
            </script>
        </body>
        </html>
        """
        let html = htmlTemplate.replacingOccurrences(of: "%%SCRIPT%%", with: script)

        var headers = HTTPHeaders()
        headers.add(name: .contentType, value: "text/html; charset=utf-8")
        return Response(status: .ok, headers: headers, body: .init(string: html))
    }

  try app.register(collection: HealthController())

  let api = app.grouped("api", "v1")
  let auth = api.grouped("auth")

  try auth.register(collection: SignupController())
  try auth.register(collection: AuthController())
  try auth.register(collection: ProfileController())
}
