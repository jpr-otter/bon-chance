import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CameraService as Camera } from './camera.service';

describe('Camera', () => {
  let service: Camera;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    service = TestBed.inject(Camera);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
