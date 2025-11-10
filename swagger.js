const swaggerAutogen = require('swagger-autogen')({
  disableLogs: false,
  autoHeaders: false,
  autoQuery: true,
  autoBody: true
});

const doc = {
  info: {
    title: 'SparatFinalProject App Server API',
    description: 'Supabase 연동 인증 API',
    version: '1.0.0'
  },
  host: process.env.NODE_ENV === 'production' ? 'https://sparatafinalapp.up.railway.app' : 'localhost:8080',
  schemes: process.env.NODE_ENV === 'production' ? ['https'] : ['http'],
  consumes: ['application/json'],
  produces: ['application/json'],
  tags: [
    {
      name: 'Auth',
      description: '인증 관련 API'
    },
    {
      name: 'Profile',
      description: '사용자 프로필 API'
    },
    {
      name: 'Session',
      description: '세션 관리 API'
    },
    {
      name: 'Health',
      description: '서버 상태 체크'
    }
  ],
  definitions: {
    SignupRequest: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: {
          type: "string",
          example: "user@example.com",
          description: "사용자 이메일 주소"
        },
        password: {
          type: "string",
          example: "password123",
          description: "비밀번호"
        },
        name: {
          type: "string",
          example: "홍길동",
          description: "사용자 이름 (선택사항)"
        }
      }
    },
    LoginRequest: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: {
          type: "string",
          example: "test",
          description: "이메일 주소 또는 사용자명 (@ 없으면 자동으로 @example.com 추가)"
        },
        password: {
          type: "string",
          example: "password123",
          description: "비밀번호"
        }
      }
    },
    RefreshRequest: {
      type: "object",
      required: ["refreshToken"],
      properties: {
        refreshToken: {
          type: "string",
          example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          description: "Refresh token"
        }
      }
    },
    User: {
      type: "object",
      properties: {
        id: {
          type: "string",
          example: "123e4567-e89b-12d3-a456-426614174000",
          description: "사용자 고유 ID"
        },
        email: {
          type: "string",
          example: "user@example.com",
          description: "사용자 이메일"
        },
        name: {
          type: "string",
          example: "홍길동",
          description: "사용자 이름"
        },
        avatarURL: {
          type: "string",
          nullable: true,
          example: null,
          description: "프로필 이미지 URL"
        },
        createdAt: {
          type: "string",
          format: "date-time",
          example: "2023-11-08T12:00:00.000Z",
          description: "계정 생성일"
        },
        userId: {
          type: "string",
          example: "user",
          description: "사용자명"
        }
      }
    },
    AuthResponse: {
      type: "object",
      properties: {
        code: {
          type: "integer",
          example: 200,
          description: "응답 코드"
        },
        message: {
          type: "string",
          example: "Login successful",
          description: "응답 메시지"
        },
        data: {
          type: "object",
          properties: {
            user: {
              $ref: "#/definitions/User"
            },
            accessToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              description: "액세스 토큰"
            },
            refreshToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              description: "리프레시 토큰"
            },
            accessTokenExpiresAt: {
              type: "string",
              format: "date-time",
              example: "2023-11-08T13:00:00.000Z",
              description: "액세스 토큰 만료시간"
            },
            refreshTokenExpiresAt: {
              type: "string",
              format: "date-time",
              example: "2023-11-15T12:00:00.000Z",
              description: "리프레시 토큰 만료시간"
            },
            sessionId: {
              type: "string",
              example: "f55ccc2093224215a581c74fb9e5bfcf2ac06b589fb7bc1bf471fbc6fdc70d31",
              description: "세션 ID (X-Session-ID 헤더로 사용)"
            },
            sessionExpiresAt: {
              type: "string",
              format: "date-time",
              example: "2023-11-09T12:00:00.000Z",
              description: "세션 만료시간"
            }
          }
        }
      }
    },
    UserResponse: {
      type: "object",
      properties: {
        code: {
          type: "integer",
          example: 200
        },
        data: {
          $ref: "#/definitions/User"
        }
      }
    },
    DeleteResponse: {
      type: "object",
      properties: {
        code: {
          type: "integer",
          example: 200
        },
        message: {
          type: "string",
          example: "Account deleted (supabase only)"
        },
        data: {
          type: "object",
          properties: {
            userID: {
              type: "string",
              example: "123e4567-e89b-12d3-a456-426614174000"
            },
            supabaseDeleted: {
              type: "boolean",
              example: true
            }
          }
        }
      }
    },
    TokenResponse: {
      type: "object",
      properties: {
        code: {
          type: "integer",
          example: 200
        },
        message: {
          type: "string",
          example: "Token refreshed successfully"
        },
        data: {
          type: "object",
          properties: {
            accessToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            },
            refreshToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            },
            accessTokenExpiresAt: {
              type: "string",
              format: "date-time",
              example: "2023-11-08T13:00:00.000Z"
            },
            refreshTokenExpiresAt: {
              type: "string",
              format: "date-time",
              example: "2023-11-15T12:00:00.000Z"
            }
          }
        }
      }
    },
    SessionResponse: {
      type: "object",
      properties: {
        code: {
          type: "integer",
          example: 200
        },
        message: {
          type: "string",
          example: "Session info retrieved successfully"
        },
        data: {
          type: "object",
          properties: {
            loginType: {
              type: "string",
              example: "email",
              description: "로그인 타입: signup, email, username"
            },
            lastLoginAt: {
              type: "string",
              format: "date-time",
              example: "2025-11-09T05:39:41.649Z",
              description: "최근 로그인 시간"
            },
            userId: {
              type: "string",
              example: "7856e7cf-bc95-44bf-9073-fdf53f36d240",
              description: "사용자 ID"
            },
            email: {
              type: "string",
              example: "user@example.com",
              description: "사용자 이메일"
            },
            sessionId: {
              type: "string",
              example: "6dc6ae7bcca872b327da17440eae56d6ce3c11d01ecc42d89b0adf8067ddce0e",
              description: "세션 ID"
            },
            createdAt: {
              type: "string",
              format: "date-time",
              example: "2025-11-08T21:33:15.396Z",
              description: "세션 생성 시간"
            },
            expiresAt: {
              type: "string",
              format: "date-time",
              example: "2025-11-09T21:33:15.396Z",
              description: "세션 만료 시간"
            }
          }
        }
      }
    }
  },
  securityDefinitions: {
    bearerAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'Bearer token을 사용한 인증. 형식: Bearer {token}'
    }
  }
};

const outputFile = './swagger-output.json';
const endpointsFiles = ['./src/app.ts', './src/routes/index.ts'];

swaggerAutogen(outputFile, endpointsFiles, doc);