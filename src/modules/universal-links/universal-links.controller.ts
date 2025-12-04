import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller()
export class UniversalLinksController {
  @Get('.well-known/apple-app-site-association')
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-cache')
  async getAppleAppSiteAssociation(@Res() res: Response) {
    try {
      const filePath = path.join(process.cwd(), 'public/.well-known/apple-app-site-association');
      const data = fs.readFileSync(filePath, 'utf8');
      return res.status(200).json(JSON.parse(data));
    } catch (error) {
      return res.status(404).json({ error: 'Apple App Site Association file not found' });
    }
  }
}