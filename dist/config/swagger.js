"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openapiSpec = void 0;
exports.setupSwagger = setupSwagger;
const node_path_1 = __importDefault(require("node:path"));
const express_1 = __importDefault(require("express"));
// Pure OpenAPI specification without swagger-jsdoc
const openapiSpec = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'VaporDockerApp API',
            description: 'Superbase 연동 인증 API',
            version: '1.0.0',
        },
        servers: [
            {
                url: 'https://finalprojectsever.onrender.com',
                description: 'Production server'
            },
            {
                url: 'http://localhost:8080',
                description: 'Development server'
            }
        ],
        tags: [
            { name: 'Health', description: '서버 상태 체크' },
            { name: 'Auth', description: '인증 관련 API' },
            { name: 'Profile', description: '사용자 프로필 API' }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                // Auth Schemas
                SignupRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: {
                            type: 'string',
                            format: 'email',
                            example: 'user@example.com'
                        },
                        password: {
                            type: 'string',
                            minLength: 6,
                            example: 'password123'
                        },
                        name: {
                            type: 'string',
                            example: '홍길동'
                        }
                    }
                },
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: {
                            type: 'string',
                            example: 'user@example.com',
                            description: '이메일 또는 사용자명 (@ 앞 부분도 가능)'
                        },
                        password: {
                            type: 'string',
                            example: 'password123'
                        }
                    }
                },
                RefreshRequest: {
                    type: 'object',
                    required: ['refreshToken'],
                    properties: {
                        refreshToken: {
                            type: 'string',
                            example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                        }
                    }
                },
                AuthResponse: {
                    type: 'object',
                    properties: {
                        code: {
                            type: 'integer',
                            example: 200
                        },
                        message: {
                            type: 'string',
                            example: 'Login successful'
                        },
                        data: {
                            type: 'object',
                            properties: {
                                user: { $ref: '#/components/schemas/User' },
                                accessToken: {
                                    type: 'string',
                                    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                                },
                                refreshToken: {
                                    type: 'string',
                                    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                                },
                                expiresAt: {
                                    type: 'string',
                                    format: 'date-time'
                                },
                                refreshExpiresAt: {
                                    type: 'string',
                                    format: 'date-time'
                                },
                                tokenType: {
                                    type: 'string',
                                    example: 'Bearer'
                                }
                            }
                        }
                    }
                },
                // User Schemas
                User: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            example: '123e4567-e89b-12d3-a456-426614174000'
                        },
                        userId: {
                            type: 'string',
                            example: 'user123'
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            example: 'user@example.com'
                        },
                        name: {
                            type: 'string',
                            nullable: true,
                            example: '홍길동'
                        },
                        avatarURL: {
                            type: 'string',
                            nullable: true,
                            example: 'https://example.com/avatar.jpg'
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                            nullable: true
                        }
                    }
                },
                UserProfile: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            example: '123e4567-e89b-12d3-a456-426614174000'
                        },
                        userId: {
                            type: 'string',
                            example: 'user123'
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            example: 'user@example.com'
                        },
                        name: {
                            type: 'string',
                            nullable: true,
                            example: '홍길동'
                        },
                        avatarURL: {
                            type: 'string',
                            nullable: true,
                            example: 'https://example.com/avatar.jpg'
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                            nullable: true
                        },
                        updatedAt: {
                            type: 'string',
                            format: 'date-time',
                            nullable: true
                        }
                    }
                },
                // Response Wrappers
                UserEnvelope: {
                    type: 'object',
                    properties: {
                        code: {
                            type: 'integer',
                            example: 200
                        },
                        data: { $ref: '#/components/schemas/User' }
                    }
                },
                ProfileEnvelope: {
                    type: 'object',
                    properties: {
                        code: {
                            type: 'integer',
                            example: 200
                        },
                        data: { $ref: '#/components/schemas/UserProfile' }
                    }
                },
                DeleteEnvelope: {
                    type: 'object',
                    properties: {
                        code: {
                            type: 'integer',
                            example: 200
                        },
                        message: {
                            type: 'string',
                            example: 'Account deleted'
                        },
                        data: {
                            type: 'object',
                            properties: {
                                userID: {
                                    type: 'string',
                                    format: 'uuid'
                                }
                            }
                        }
                    }
                },
                HealthStatus: {
                    type: 'object',
                    properties: {
                        status: {
                            type: 'string',
                            example: 'ok'
                        },
                        database: {
                            type: 'string',
                            example: 'ok'
                        }
                    }
                }
            }
        },
        paths: {
            '/health': {
                get: {
                    summary: '서비스 상태 확인',
                    description: '서버와 데이터베이스 상태를 확인합니다',
                    tags: ['Health'],
                    responses: {
                        200: {
                            description: '서비스 상태 정보',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            code: {
                                                type: 'integer',
                                                example: 200
                                            },
                                            data: {
                                                $ref: '#/components/schemas/HealthStatus'
                                            }
                                        }
                                    },
                                    example: {
                                        code: 200,
                                        data: {
                                            status: 'ok',
                                            database: 'ok'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/v1/auth/signup': {
                post: {
                    summary: '사용자 회원가입',
                    description: 'Supabase Auth를 사용한 새 계정 생성',
                    tags: ['Auth'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/SignupRequest'
                                },
                                example: {
                                    email: 'user@example.com',
                                    password: 'password123',
                                    name: '홍길동'
                                }
                            }
                        }
                    },
                    responses: {
                        200: {
                            description: '회원가입 성공',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/AuthResponse'
                                    }
                                }
                            }
                        },
                        400: {
                            description: '잘못된 요청 (필수 필드 누락)',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            code: {
                                                type: 'integer',
                                                example: 400
                                            },
                                            message: {
                                                type: 'string',
                                                example: 'email and password are required'
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        500: {
                            description: '서버 오류',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            code: {
                                                type: 'integer',
                                                example: 500
                                            },
                                            message: {
                                                type: 'string',
                                                example: 'Supabase createUser failed'
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/v1/auth/login': {
                post: {
                    summary: '사용자 로그인',
                    description: 'Supabase Auth를 통한 로그인 및 JWT 토큰 발급. email 필드에는 이메일 전체나 @ 앞 부분만 입력 가능',
                    tags: ['Auth'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/LoginRequest'
                                },
                                example: {
                                    email: 'test',
                                    password: 'password123'
                                }
                            }
                        }
                    },
                    responses: {
                        200: {
                            description: '로그인 성공',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/AuthResponse'
                                    }
                                }
                            }
                        },
                        400: {
                            description: '잘못된 요청 (필수 필드 누락)',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            code: {
                                                type: 'integer',
                                                example: 400
                                            },
                                            message: {
                                                type: 'string',
                                                example: 'email/identifier and password are required'
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        401: {
                            description: '인증 실패',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            code: {
                                                type: 'integer',
                                                example: 401
                                            },
                                            message: {
                                                type: 'string',
                                                example: 'Invalid credentials'
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/v1/auth/refresh': {
                post: {
                    summary: '액세스 토큰 재발급',
                    description: 'Refresh token을 사용하여 새로운 access token과 refresh token 쌍을 발급받습니다',
                    tags: ['Auth'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/RefreshRequest'
                                },
                                example: {
                                    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                                }
                            }
                        }
                    },
                    responses: {
                        200: {
                            description: '토큰 재발급 성공',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            code: {
                                                type: 'integer',
                                                example: 200
                                            },
                                            message: {
                                                type: 'string',
                                                example: 'Token refreshed successfully'
                                            },
                                            data: {
                                                type: 'object',
                                                properties: {
                                                    accessToken: {
                                                        type: 'string',
                                                        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                                                    },
                                                    refreshToken: {
                                                        type: 'string',
                                                        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                                                    },
                                                    accessTokenExpiresAt: {
                                                        type: 'string',
                                                        format: 'date-time',
                                                        example: '2023-12-01T12:00:00.000Z'
                                                    },
                                                    refreshTokenExpiresAt: {
                                                        type: 'string',
                                                        format: 'date-time',
                                                        example: '2023-12-08T12:00:00.000Z'
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        400: {
                            description: '잘못된 요청 (refresh token 누락)',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            code: {
                                                type: 'integer',
                                                example: 400
                                            },
                                            message: {
                                                type: 'string',
                                                example: 'refreshToken is required'
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        401: {
                            description: '유효하지 않거나 만료된 refresh token',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            code: {
                                                type: 'integer',
                                                example: 401
                                            },
                                            message: {
                                                type: 'string',
                                                example: 'Invalid or expired refresh token'
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/v1/auth/me': {
                get: {
                    summary: '현재 사용자 정보 조회',
                    description: '인증된 사용자의 기본 정보를 조회합니다',
                    tags: ['Auth'],
                    security: [
                        {
                            bearerAuth: []
                        }
                    ],
                    responses: {
                        200: {
                            description: '사용자 정보 조회 성공',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/UserEnvelope'
                                    }
                                }
                            }
                        },
                        401: {
                            description: '인증 토큰이 유효하지 않음',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            code: {
                                                type: 'integer',
                                                example: 401
                                            },
                                            message: {
                                                type: 'string',
                                                example: 'Unauthorized'
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/v1/profile': {
                get: {
                    summary: '사용자 프로필 조회',
                    description: '인증된 사용자의 상세 프로필 정보를 조회합니다',
                    tags: ['Profile'],
                    security: [
                        {
                            bearerAuth: []
                        }
                    ],
                    responses: {
                        200: {
                            description: '프로필 정보 조회 성공',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/ProfileEnvelope'
                                    }
                                }
                            }
                        },
                        401: {
                            description: '인증 토큰이 유효하지 않음',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            code: {
                                                type: 'integer',
                                                example: 401
                                            },
                                            message: {
                                                type: 'string',
                                                example: 'Unauthorized'
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                delete: {
                    summary: '사용자 계정 삭제',
                    description: '인증된 사용자의 계정을 삭제합니다. purge=supabase 쿼리 파라미터로 Supabase Auth 계정도 함께 삭제할 수 있습니다',
                    tags: ['Profile'],
                    security: [
                        {
                            bearerAuth: []
                        }
                    ],
                    parameters: [
                        {
                            in: 'query',
                            name: 'purge',
                            schema: {
                                type: 'string',
                                enum: ['supabase']
                            },
                            description: 'Supabase Auth 계정도 함께 삭제할지 여부',
                            example: 'supabase'
                        }
                    ],
                    responses: {
                        200: {
                            description: '계정 삭제 성공',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/DeleteEnvelope'
                                    },
                                    examples: {
                                        withSupabase: {
                                            summary: 'Supabase 포함 삭제',
                                            value: {
                                                code: 200,
                                                message: 'Account deleted (supabase only)',
                                                data: {
                                                    userID: '123e4567-e89b-12d3-a456-426614174000',
                                                    supabaseDeleted: true
                                                }
                                            }
                                        },
                                        localOnly: {
                                            summary: '로컬만 삭제',
                                            value: {
                                                code: 200,
                                                message: 'Account deletion logged (local DB not configured)',
                                                data: {
                                                    userID: '123e4567-e89b-12d3-a456-426614174000',
                                                    supabaseDeleted: false
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        401: {
                            description: '인증 토큰이 유효하지 않음',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            code: {
                                                type: 'integer',
                                                example: 401
                                            },
                                            message: {
                                                type: 'string',
                                                example: 'Unauthorized'
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};
exports.openapiSpec = openapiSpec;
// Express app에 Swagger 설정을 적용하는 함수
function setupSwagger(app) {
    // 사파리 호환성을 위한 로컬 swagger-ui 파일 서빙
    app.use('/swagger-ui', express_1.default.static(node_path_1.default.join(process.cwd(), 'node_modules', 'swagger-ui-dist')));
    // 사파리 호환 커스텀 HTML - 이전에 작동했던 방식
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
    // Safari-compatible initialization with forced expansion
    function initSwagger() {
      try {
        if (typeof SwaggerUIBundle === 'undefined' || typeof SwaggerUIStandalonePreset === 'undefined') {
          console.log('Waiting for Swagger UI libraries to load...');
          setTimeout(initSwagger, 100);
          return;
        }

        console.log('Initializing Swagger UI...');

        // 직접 URL 사용하는 간단한 방식
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
          docExpansion: 'full',
          operationsSorter: 'alpha',
          tagsSorter: 'alpha',
          defaultModelsExpandDepth: 2,
          defaultModelExpandDepth: 2,
          tryItOutEnabled: true,
          requestInterceptor: function(request) {
            console.log('Request:', request);
            return request;
          },
          responseInterceptor: function(response) {
            console.log('Response:', response);
            return response;
          }
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
        setTimeout(initSwagger, 500); // Increased delay
      });
    } else {
      setTimeout(initSwagger, 500); // Increased delay
    }
  </script>
</body>
</html>
  `;
    // 커스텀 HTML을 사용한 API 문서 라우트
    app.get('/api-docs', (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.send(customSwaggerHTML);
    });
    // OpenAPI JSON 엔드포인트
    app.get('/openapi.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.json(openapiSpec);
    });
    // Legacy route redirects
    app.get('/docs', (_req, res) => {
        res.redirect(302, '/api-docs');
    });
    app.get('/swagger', (_req, res) => {
        res.redirect(302, '/api-docs');
    });
    console.log('🚀 Swagger documentation available at http://localhost:8080/api-docs');
}
