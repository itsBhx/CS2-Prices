import "../styles/globals.css";
import Head from "next/head";
import { Toaster, toast } from "react-hot-toast";

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

      {/* Your global Toaster provider */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 2500,
          style: {
            background: "#1f1f1f",
            color: "#fff",
            border: "1px solid #ff8c00",
          },
        }}
      />

      <Component {...pageProps} />
    </>
  );
}
