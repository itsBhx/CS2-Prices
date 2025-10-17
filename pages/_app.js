import "../styles/globals.css";
import Head from "next/head";
import { Toaster } from 'react-hot-toast';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Toaster
        position="bottom-right"
        toastOptions={{
          // Default: remove success checkmark globally
          success: {
            icon: null,
          },
          // Default: remove error ❌ as well (optional)
          error: {
            icon: null,
          },
          style: {
            background: "#141414",
            color: "#fff",
            fontWeight: 600,
            border: "1px solid #ff8c00",
            backdropFilter: "blur(8px)",
            opacity: 0.95,
          },
        }}
      />
    </>
  );
}


export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>CS2 Prices</title>
        <meta
          name="description"
          content="Track your CS2 investments — live Steam prices, stickers, cases and portfolio value."
        />
        <link rel="icon" href="/logo.png" type="image/png" />
      </Head>

      {/* ✅ global toast provider */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 2500,
          style: {
            background: "#1a1a1d",
            color: "#fff",
            border: "1px solid #3a3a3f",
          },
        }}
      />

      <Component {...pageProps} />
    </>
  );
}
