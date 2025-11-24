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
  });

  @All('*')
  proxyToNextjs(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, () => {
      // 프록시가 완료된 후 실행될 콜백
    });
  }
}