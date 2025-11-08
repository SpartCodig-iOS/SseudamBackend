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
  host: process.env.NODE_ENV === 'production' ? 'finalprojectsever.onrender.com' : 'localhost:8080',
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
const endpointsFiles = ['./src/app.ts'];

swaggerAutogen(outputFile, endpointsFiles, doc);