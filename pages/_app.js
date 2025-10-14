import "@/styles/globals.css";
import Head from "next/head";

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
    </>
  );
}
