import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren, ReactNode } from 'react';

/**
 * Web-only root HTML. Locks body scroll (native-like ScrollViews), paints the felt
 * background behind the app, and blocks horizontal overflow from decorative blobs.
 * Does not run on iOS/Android.
 */
export default function Root({ children }: PropsWithChildren): ReactNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                background-color: #0E2A1C;
                overscroll-behavior: none;
              }
              body {
                margin: 0;
                overflow-x: hidden;
              }
              #root {
                max-width: 480px;
                margin-left: auto;
                margin-right: auto;
                width: 100%;
                overflow: hidden;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
