import { Global, Module } from '@nestjs/common';
import { HttpClient } from './http/http-client.js';

@Global()
@Module({
  providers: [HttpClient],
  exports: [HttpClient],
})
export class CommonModule {}
