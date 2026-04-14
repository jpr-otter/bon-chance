import { registerLocaleData } from '@angular/common';
import localeDE from '@angular/common/locales/de';
import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

registerLocaleData(localeDE);

async function clearDevBrowserCaches(): Promise<void> {
  if (!isDevMode() || typeof window === 'undefined') {
    return;
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
  }
}

clearDevBrowserCaches()
  .catch((err) => console.error(err))
  .finally(() => {
    bootstrapApplication(App, appConfig).catch((err) => console.error(err));
  });
