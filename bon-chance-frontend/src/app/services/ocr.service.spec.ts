import { TestBed } from '@angular/core/testing';

import { OcrService as Ocr } from './ocr.service';

describe('Ocr', () => {
  let service: Ocr;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Ocr);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
