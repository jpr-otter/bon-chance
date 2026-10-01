import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ReceiptService as Receipt } from './receipt.service';

describe('Receipt', () => {
  let service: Receipt;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    service = TestBed.inject(Receipt);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
