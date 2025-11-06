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
        let html = """
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
              SwaggerUIBundle({
                url: '/openapi.json?ts=' + Date.now(),
                dom_id: '#swagger-ui',
                docExpansion: 'none',
                tagsSorter: 'alpha',
                operationsSorter: 'alpha'
              });
            };
            </script>
        </body>
        </html>
        """

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
