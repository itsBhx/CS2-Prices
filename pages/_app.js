import "../styles/globals.css";
import Head from "next/head";
import { Toaster } from "react-hot-toast";

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

      <Component {...pageProps} />

      {/* Global Toast System */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 2500,
          style: {
            background: "#1a1a1d", // matches your dark theme
            color: "#fff",
            border: "1px solid #3a3a3f",
            fontWeight: 500,
          },
          success: {
            iconTheme: {
              primary: "#f79c42", // your orange glow
              secondary: "#1a1a1d",
            },
          },
        }}
      />
    </>
  );
}
