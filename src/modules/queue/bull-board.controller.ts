import { Controller, All, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUES } from '../../common/constants/queue.constants';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';

@ApiTags('Queue Dashboard')
@Controller('admin/queues')
export class BullBoardController {
  private serverAdapter!: ExpressAdapter;

  constructor(
    @InjectQueue(QUEUES.NOTIFICATION) private notificationQueue: Queue,
    @InjectQueue(QUEUES.SETTLEMENT) private settlementQueue: Queue,
    @InjectQueue(QUEUES.EMAIL) private emailQueue: Queue,
    @InjectQueue(QUEUES.ANALYTICS) private analyticsQueue: Queue,
  ) {
    this.setupBullBoard();
  }

  private setupBullBoard() {
    // ExpressAdapter 생성
    this.serverAdapter = new ExpressAdapter();
    this.serverAdapter.setBasePath('/admin/queues');

    // Bull Board 생성 - 모든 큐 등록
    createBullBoard({
      queues: [
        new BullAdapter(this.notificationQueue),
        new BullAdapter(this.settlementQueue),
        new BullAdapter(this.emailQueue),
        new BullAdapter(this.analyticsQueue),
      ],
      serverAdapter: this.serverAdapter,
    });
  }

  @All('*')
  @ApiExcludeEndpoint()
  async dashboard(@Req() req: Request, @Res() res: Response): Promise<void> {
    const handler = this.serverAdapter.getRouter();
    return handler(req, res, () => {
      res.status(404).send('Not Found');
    });
  }
}