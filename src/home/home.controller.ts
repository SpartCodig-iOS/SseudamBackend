import { Controller, Get, Res, Req, All } from '@nestjs/common';
import { Response, Request } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

@Controller('home')
export class HomeController {
  private proxy = createProxyMiddleware({
    target: 'http://localhost:3031',
    changeOrigin: true,
    pathRewrite: {
      '^/home': '', // /home 경로를 제거하고 Next.js로 전달
    },
    onError: (err: any, req: any, res: any) => {
      console.error('Proxy error:', err.message);
      res.status(500).json({
        error: 'Next.js 서버에 연결할 수 없습니다. 포트 3031이 실행 중인지 확인하세요.'
      });
    },
  });

  @All('*')
  proxyToNextjs(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, () => {
      // 프록시가 완료된 후 실행될 콜백
    });
  }
}