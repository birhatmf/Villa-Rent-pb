import { Controller, Get } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';

@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private exchangeRates: ExchangeRatesService) {}

  @Get()
  get() {
    return this.exchangeRates.get();
  }
}
